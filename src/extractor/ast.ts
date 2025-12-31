import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Project, SyntaxKind, type FunctionDeclaration, type MethodDeclaration } from 'ts-morph';
import { minimatch } from 'minimatch';
import type { MangoDb } from '@jkershaw/mangodb';
import type { GitInfo } from './git.ts';
import type { DocsInfo } from './docs.ts';
import type { ErrorPath } from './errors.ts';
import { extractErrorPaths } from './errors.ts';
import type { DetectedPattern } from './patterns.ts';

/**
 * Import declaration data.
 */
export interface Import {
  from: string;
  names: string[];
  defaultName?: string;
  namespaceImport?: string;
  isTypeOnly: boolean;
}

/**
 * Tracks where an imported symbol is actually used in a file.
 * Phase 6.8.1: Symbol-level import tracking.
 */
export interface SymbolUsage {
  /** The imported symbol name */
  symbol: string;
  /** Source file path the symbol is imported from (resolved) */
  sourceFile: string;
  /** Line numbers where this symbol is used in the file */
  usageLines: number[];
  /** Type of usage: 'call' for function calls, 'reference' for type/variable refs */
  usageType: 'call' | 'reference' | 'type';
}

/**
 * Export declaration data.
 */
export interface Export {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'default' | 'star';
  isReExport: boolean;
}

/**
 * Function parameter data.
 */
export interface Param {
  name: string;
  type: string;
  isOptional: boolean;
  defaultValue?: string;
}

/**
 * Key statement extracted from a function via AST analysis.
 * These are the "important" lines that capture config, formulas, conditions.
 */
export interface KeyStatement {
  line: number;
  text: string;
  category: 'config' | 'url' | 'math' | 'condition' | 'error';
}

/**
 * Function data extracted from AST.
 * Named FunctionData to avoid shadowing global Function constructor.
 */
export interface FunctionData {
  name: string;
  signature: string;
  params: Param[];
  returnType: string;
  isAsync: boolean;
  isExported: boolean;
  isDefaultExport: boolean; // Phase 6.6: Explicit default export detection
  startLine: number;
  endLine: number;
  codeSnippet: string; // First N lines of function source
  keyStatements: KeyStatement[]; // Important statements extracted via AST
  calls: string[]; // Names of functions called within this function (Phase 6.6.7a.1)
  calledBy: string[]; // Names of functions that call this function (Phase 6.6.7a.4, computed in builder)
  errorPaths: ErrorPath[]; // Error handling paths (Phase 6.6.8)
}

/**
 * Property data (for classes and interfaces).
 */
export interface Property {
  name: string;
  type: string;
  isOptional: boolean;
}

/**
 * Class data.
 */
export interface Class {
  name: string;
  methods: FunctionData[];
  properties: Property[];
  isExported: boolean;
  extends?: string;
  implements?: string[];
}

/**
 * Interface data.
 */
export interface Interface {
  name: string;
  properties: Property[];
  isExported: boolean;
}

/**
 * Extracted file data structure.
 */
export interface ExtractedFile {
  [key: string]: unknown; // Index signature for MangoDB Document compatibility
  path: string;
  lines: number;
  imports: Import[];
  exports: Export[];
  functions: FunctionData[];
  classes: Class[];
  interfaces: Interface[];
  git?: GitInfo;
  docs?: DocsInfo;
  patterns?: DetectedPattern[]; // Phase 6.6.6
  symbolUsages?: SymbolUsage[]; // Phase 6.8.1: Symbol-level import tracking
}

/**
 * Options for finding files.
 */
export interface FindFilesOptions {
  include?: string[];
  exclude?: string[];
}

/**
 * Maximum lines to include in code snippets.
 */
const SNIPPET_MAX_LINES = 15;
const SNIPPET_MAX_LINES_COMPLEX = 30; // Phase 6.8.2.1: Increased for complex functions
const KEY_STATEMENT_THRESHOLD = 5; // Functions with >5 key statements are "complex"
const KEY_STATEMENT_CONTEXT_LINES = 3; // Phase 6.8.2.2: Lines to preserve around key statements

/**
 * Extract a code snippet from a function or method.
 * Phase 6.8.2: Enhanced to support full content preservation.
 * - Complex functions (>5 key statements) get 30 lines instead of 15
 * - Smart truncation preserves 3 lines around each key statement
 * - Truncation indicator shows remaining lines AND remaining key statements
 *
 * @param getText - Function that returns the full source text
 * @param keyStatements - Key statements with file-level line numbers (for smart truncation)
 * @param funcStartLine - The function's start line in the file (for computing snippet-relative indices)
 * @returns The code snippet string
 */
function getCodeSnippet(
  getText: () => string,
  keyStatements: KeyStatement[] = [],
  funcStartLine: number = 1
): string {
  const fullText = getText();
  const lines = fullText.split('\n');
  const totalLines = lines.length;

  // Phase 6.8.2.1: Use higher limit for complex functions
  const isComplex = keyStatements.length > KEY_STATEMENT_THRESHOLD;
  const maxLines = isComplex ? SNIPPET_MAX_LINES_COMPLEX : SNIPPET_MAX_LINES;

  // If within limit, return full text
  if (totalLines <= maxLines) {
    return fullText;
  }

  // Phase 6.8.2.2: Smart truncation that preserves key statement context
  if (keyStatements.length > 0) {
    // Build a set of lines to include (around key statements)
    const linesToInclude = new Set<number>();

    // Always include first 3 lines (function signature context)
    for (let i = 1; i <= Math.min(3, totalLines); i++) {
      linesToInclude.add(i);
    }

    // Add context around each key statement
    for (const stmt of keyStatements) {
      // Convert file-level line number to snippet-relative line number
      // stmt.line is 1-indexed file line, funcStartLine is 1-indexed file line
      // Snippet line 1 corresponds to funcStartLine
      const snippetLineNum = stmt.line - funcStartLine + 1;

      // Skip if the key statement is outside the function body (shouldn't happen)
      if (snippetLineNum < 1 || snippetLineNum > totalLines) {
        continue;
      }

      for (
        let i = Math.max(1, snippetLineNum - KEY_STATEMENT_CONTEXT_LINES);
        i <= Math.min(totalLines, snippetLineNum + KEY_STATEMENT_CONTEXT_LINES);
        i++
      ) {
        linesToInclude.add(i);
      }
    }

    // If including key statement context gives us a reasonable snippet, use it
    if (linesToInclude.size > 0 && linesToInclude.size <= maxLines) {
      const includedLineNumbers = Array.from(linesToInclude).sort((a, b) => a - b);
      const result: string[] = [];
      let lastLine = 0;

      for (const lineNum of includedLineNumbers) {
        if (lineNum - lastLine > 1 && lastLine > 0) {
          // Add ellipsis for skipped lines
          result.push(`  // ... (${lineNum - lastLine - 1} lines omitted)`);
        }
        if (lineNum <= totalLines) {
          result.push(lines[lineNum - 1]);
        }
        lastLine = lineNum;
      }

      // Add final ellipsis if needed
      const remainingLines = totalLines - lastLine;
      const remainingKeyStatements = keyStatements.filter((s) => {
        const snippetLine = s.line - funcStartLine + 1;
        return !includedLineNumbers.includes(snippetLine);
      }).length;

      if (remainingLines > 0) {
        // Phase 6.8.2.3: Show remaining lines AND remaining key statements
        const keyStmtInfo =
          remainingKeyStatements > 0 ? `, ${remainingKeyStatements} more key statements` : '';
        result.push(`  // ... (${remainingLines} more lines${keyStmtInfo})`);
      }

      return result.join('\n');
    }
  }

  // Fallback: simple truncation with enhanced indicator
  const remainingLines = totalLines - maxLines;
  // Phase 6.8.2.3: Count key statements beyond the snippet
  const remainingKeyStatements = keyStatements.filter((stmt) => {
    const snippetLine = stmt.line - funcStartLine + 1;
    return snippetLine > maxLines;
  }).length;

  const keyStmtInfo =
    remainingKeyStatements > 0 ? `, ${remainingKeyStatements} more key statements` : '';
  return (
    lines.slice(0, maxLines).join('\n') + `\n  // ... (${remainingLines} more lines${keyStmtInfo})`
  );
}

/**
 * Extract key statements from a function using AST analysis.
 * Finds config values, URLs, math expressions, conditions, and error handling.
 * @param func - The function or method declaration to analyze
 * @returns Array of key statements with line numbers and categories
 */
function extractKeyStatements(func: FunctionDeclaration | MethodDeclaration): KeyStatement[] {
  const statements: KeyStatement[] = [];

  // 1. Find variable declarations with numeric literals or nullish coalescing defaults
  for (const decl of func.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    if (!init) continue;

    const initText = init.getText();
    const declText = decl.getText();
    const line = decl.getStartLineNumber();

    // Config: numeric literals or ?? with numeric fallback
    if (
      init.getKind() === SyntaxKind.NumericLiteral ||
      initText.match(/\?\?\s*\d+/) ||
      initText.match(/\|\|\s*\d+/)
    ) {
      statements.push({ line, text: declText, category: 'config' });
      continue;
    }

    // URL: string literals that look like URLs
    if (init.getKind() === SyntaxKind.StringLiteral && initText.match(/https?:\/\/|wss?:\/\//)) {
      statements.push({ line, text: declText, category: 'url' });
      continue;
    }

    // Math: expressions with Math.pow, **, or exponential patterns
    if (initText.includes('Math.pow') || initText.includes('**')) {
      statements.push({ line, text: declText, category: 'math' });
      continue;
    }
  }

  // 2. Find Math.pow or ** in any expression (not just variable declarations)
  for (const call of func.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callText = call.getText();
    if (callText.includes('Math.pow')) {
      // Get the containing statement
      const stmt =
        call.getFirstAncestorByKind(SyntaxKind.VariableStatement) ||
        call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
      if (stmt) {
        const line = stmt.getStartLineNumber();
        // Avoid duplicates
        if (!statements.some((s) => s.line === line)) {
          statements.push({ line, text: stmt.getText().trim(), category: 'math' });
        }
      }
    }
  }

  // 3. Find status code conditionals (if status === 429, status >= 500, etc.)
  for (const ifStmt of func.getDescendantsOfKind(SyntaxKind.IfStatement)) {
    const condition = ifStmt.getExpression().getText();
    // Match status code patterns
    if (
      condition.match(/status\s*(===|==|>=|<=|>|<)\s*\d{3}/) ||
      condition.match(/\d{3}\s*(===|==|>=|<=|>|<)\s*status/)
    ) {
      const line = ifStmt.getStartLineNumber();
      // Get just the condition part, not the body
      const conditionOnly = `if (${condition})`;
      statements.push({ line, text: conditionOnly, category: 'condition' });
    }
  }

  // 4. Find catch clauses (error handling)
  for (const catchClause of func.getDescendantsOfKind(SyntaxKind.CatchClause)) {
    const line = catchClause.getStartLineNumber();
    const param = catchClause.getVariableDeclaration();
    const paramText = param ? param.getText() : 'error';
    statements.push({ line, text: `catch (${paramText})`, category: 'error' });
  }

  // Sort by line number and deduplicate
  statements.sort((a, b) => a.line - b.line);

  // Remove duplicates (same line)
  const seen = new Set<number>();
  return statements.filter((s) => {
    if (seen.has(s.line)) return false;
    seen.add(s.line);
    return true;
  });
}

/**
 * Find all TypeScript files in a directory.
 * @param rootDir - The root directory to search
 * @param options - Optional include/exclude patterns
 * @returns Array of relative file paths
 */
export async function findFiles(rootDir: string, options?: FindFilesOptions): Promise<string[]> {
  const files: string[] = [];
  const include = options?.include || ['**/*.ts'];
  const exclude = options?.exclude || ['node_modules/**', '**/*.d.ts'];

  async function scanDir(dir: string): Promise<void> {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        // Skip node_modules and hidden directories
        if (!entry.startsWith('.') && entry !== 'node_modules') {
          await scanDir(fullPath);
        }
      } else if (entry.endsWith('.ts')) {
        const relativePath = relative(rootDir, fullPath);

        // Check if file matches include patterns
        const isIncluded = include.some((pattern) => minimatch(relativePath, pattern));

        // Check if file matches exclude patterns
        const isExcluded = exclude.some((pattern) => minimatch(relativePath, pattern));

        if (isIncluded && !isExcluded) {
          files.push(relativePath);
        }
      }
    }
  }

  await scanDir(rootDir);
  return files.sort();
}

/**
 * A ts-morph Project with its root directory.
 */
export interface ProjectContext {
  project: Project;
  rootDir: string;
}

/**
 * Extract function calls within a function.
 * Phase 6.6.7a.1: Track function calls within same file.
 * @param func - The function or method declaration to analyze
 * @param allFunctionNames - Names of all functions defined in the same file
 * @returns Array of function names called within this function
 */
function extractFunctionCalls(
  func: FunctionDeclaration | MethodDeclaration,
  allFunctionNames: Set<string>
): string[] {
  const calls: string[] = [];
  const seen = new Set<string>();

  // Find all CallExpression nodes within the function
  for (const callExpr of func.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    // Get the expression being called (e.g., "foo" in "foo()")
    const expression = callExpr.getExpression();

    // We only want direct function calls like "foo()"
    // Ignore method calls like "obj.method()" or "this.method()"
    if (expression.getKind() === SyntaxKind.Identifier) {
      const functionName = expression.getText();

      // Only include if it's a function defined in the same file
      if (allFunctionNames.has(functionName) && !seen.has(functionName)) {
        calls.push(functionName);
        seen.add(functionName);
      }
    }
  }

  return calls;
}

/**
 * Create a ts-morph Project for a directory.
 * @param rootDir - The root directory of the project
 * @returns A configured Project instance with root directory
 */
export function createProject(rootDir: string): ProjectContext {
  const project = new Project({
    tsConfigFilePath: join(rootDir, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
  return { project, rootDir };
}

/**
 * Extract data from a single TypeScript file.
 * @param ctx - The project context
 * @param relativePath - The relative path to the file
 * @returns Extracted file data
 * @throws Error if file cannot be read or parsed
 */
export function extractFile(ctx: ProjectContext, relativePath: string): ExtractedFile {
  const fullPath = join(ctx.rootDir, relativePath);
  let sourceFile;
  try {
    sourceFile = ctx.project.addSourceFileAtPath(fullPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse "${relativePath}": ${message}`);
  }

  // Extract imports
  const imports: Import[] = sourceFile.getImportDeclarations().map((decl) => {
    const namedImports = decl.getNamedImports().map((n) => n.getName());
    const defaultImport = decl.getDefaultImport();
    const namespaceImport = decl.getNamespaceImport();

    return {
      from: decl.getModuleSpecifierValue(),
      names: namedImports,
      defaultName: defaultImport?.getText(),
      namespaceImport: namespaceImport?.getText(),
      isTypeOnly: decl.isTypeOnly(),
    };
  });

  // Extract exports
  const exports: Export[] = [];

  // Exported functions
  for (const func of sourceFile.getFunctions()) {
    if (func.isExported()) {
      exports.push({
        name: func.getName() || 'default',
        kind: 'function',
        isReExport: false,
      });
    }
  }

  // Exported classes
  for (const cls of sourceFile.getClasses()) {
    if (cls.isExported()) {
      exports.push({
        name: cls.getName() || 'default',
        kind: 'class',
        isReExport: false,
      });
    }
  }

  // Exported interfaces
  for (const iface of sourceFile.getInterfaces()) {
    if (iface.isExported()) {
      exports.push({
        name: iface.getName(),
        kind: 'interface',
        isReExport: false,
      });
    }
  }

  // Exported type aliases
  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (typeAlias.isExported()) {
      exports.push({
        name: typeAlias.getName(),
        kind: 'type',
        isReExport: false,
      });
    }
  }

  // Exported variable statements (export const x = ...)
  for (const varStmt of sourceFile.getVariableStatements()) {
    if (varStmt.isExported()) {
      for (const decl of varStmt.getDeclarations()) {
        exports.push({
          name: decl.getName(),
          kind: 'const',
          isReExport: false,
        });
      }
    }
  }

  // Export declarations (export { x } or export { x } from './y' or export * from './y')
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    const isReExport = !!exportDecl.getModuleSpecifier();
    const moduleSpecifier = exportDecl.getModuleSpecifierValue();

    // Handle star exports (export * from './module')
    if (exportDecl.isNamespaceExport() && moduleSpecifier) {
      exports.push({
        name: '*',
        kind: 'star',
        isReExport: true,
      });
      continue;
    }

    // Handle named exports
    for (const namedExport of exportDecl.getNamedExports()) {
      // Try to find what kind of thing is being exported
      const name = namedExport.getName();
      const symbol = namedExport.getSymbol();
      let kind: Export['kind'] = 'const';

      if (symbol) {
        const declarations = symbol.getDeclarations();
        if (declarations.length > 0) {
          const decl = declarations[0];
          if (decl && 'getKindName' in decl) {
            const kindName = (decl as { getKindName(): string }).getKindName();
            if (kindName === 'FunctionDeclaration') kind = 'function';
            else if (kindName === 'ClassDeclaration') kind = 'class';
            else if (kindName === 'InterfaceDeclaration') kind = 'interface';
            else if (kindName === 'TypeAliasDeclaration') kind = 'type';
          }
        }
      }

      exports.push({
        name,
        kind,
        isReExport,
      });
    }
  }

  // Extract functions
  // Phase 6.6.7a.1: Build global set of all callable names (functions + all class methods)
  // This allows detecting intra-file calls between top-level functions and class methods
  const allCallableNames = new Set<string>();
  for (const func of sourceFile.getFunctions()) {
    allCallableNames.add(func.getName() || 'anonymous');
  }
  for (const cls of sourceFile.getClasses()) {
    for (const method of cls.getMethods()) {
      allCallableNames.add(method.getName());
    }
  }

  const functions: FunctionData[] = sourceFile.getFunctions().map((func) => {
    // Phase 6.8.2: Extract key statements first to inform code snippet generation
    const keyStatements = extractKeyStatements(func);
    return {
      name: func.getName() || 'anonymous',
      signature: func.getSignature().getDeclaration().getText(),
      params: func.getParameters().map((p) => ({
        name: p.getName(),
        type: p.getType().getText(),
        isOptional: p.isOptional(),
        defaultValue: p.getInitializer()?.getText(),
      })),
      returnType: func.getReturnType().getText(),
      isAsync: func.isAsync(),
      isExported: func.isExported(),
      isDefaultExport: func.isDefaultExport(), // Phase 6.6: Explicit default export detection
      startLine: func.getStartLineNumber(),
      endLine: func.getEndLineNumber(),
      codeSnippet: getCodeSnippet(() => func.getText(), keyStatements, func.getStartLineNumber()), // Phase 6.8.2
      keyStatements,
      calls: extractFunctionCalls(func, allCallableNames), // Phase 6.6.7a.1
      calledBy: [], // Phase 6.6.7a.4: Computed later in builder
      errorPaths: extractErrorPaths(func), // Phase 6.6.8
    };
  });

  // Extract classes
  const classes: Class[] = sourceFile.getClasses().map((cls) => ({
    name: cls.getName() || 'anonymous',
    methods: cls.getMethods().map((method) => {
      // Phase 6.8.2: Extract key statements first to inform code snippet generation
      const keyStatements = extractKeyStatements(method);
      return {
        name: method.getName(),
        signature: method.getSignature().getDeclaration().getText(),
        params: method.getParameters().map((p) => ({
          name: p.getName(),
          type: p.getType().getText(),
          isOptional: p.isOptional(),
          defaultValue: p.getInitializer()?.getText(),
        })),
        returnType: method.getReturnType().getText(),
        isAsync: method.isAsync(),
        isExported: false, // Methods aren't directly exported
        isDefaultExport: false, // Methods aren't default exported
        startLine: method.getStartLineNumber(),
        endLine: method.getEndLineNumber(),
        codeSnippet: getCodeSnippet(
          () => method.getText(),
          keyStatements,
          method.getStartLineNumber()
        ), // Phase 6.8.2
        keyStatements,
        calls: extractFunctionCalls(method, allCallableNames), // Phase 6.6.7a.1: Use global callable set
        calledBy: [], // Phase 6.6.7a.4: Computed later in builder
        errorPaths: extractErrorPaths(method), // Phase 6.6.8
      };
    }),
    properties: cls.getProperties().map((prop) => ({
      name: prop.getName(),
      type: prop.getType().getText(),
      isOptional: prop.hasQuestionToken(),
    })),
    isExported: cls.isExported(),
    extends: cls.getExtends()?.getText(),
    implements: cls.getImplements().map((i) => i.getText()),
  }));

  // Extract interfaces
  const interfaces: Interface[] = sourceFile.getInterfaces().map((iface) => ({
    name: iface.getName(),
    properties: iface.getProperties().map((prop) => ({
      name: prop.getName(),
      type: prop.getType().getText(),
      isOptional: prop.hasQuestionToken(),
    })),
    isExported: iface.isExported(),
  }));

  // Build the extracted file data (without patterns initially)
  const extracted: ExtractedFile = {
    path: relativePath,
    lines: sourceFile.getEndLineNumber(),
    imports,
    exports,
    functions,
    classes,
    interfaces,
  };

  // Phase 6.6.6: Detect design patterns
  // Note: Pattern detection is done separately to avoid circular imports
  // See cli/extract.ts for pattern detection integration

  // Phase 6.8.1: Extract symbol-level import usages
  extracted.symbolUsages = extractSymbolUsages(sourceFile, imports, relativePath);

  return extracted;
}

/**
 * Extract where imported symbols are actually used in a file.
 * Phase 6.8.1: Symbol-level import tracking.
 *
 * @param sourceFile - The ts-morph source file
 * @param imports - The imports extracted from this file
 * @param filePath - The file path (for context)
 * @returns Array of symbol usages with line numbers
 */
function extractSymbolUsages(
  sourceFile: ReturnType<Project['addSourceFileAtPath']>,
  imports: Import[],
  _filePath: string
): SymbolUsage[] {
  const usages: SymbolUsage[] = [];

  for (const imp of imports) {
    // Only process relative imports (starting with . or /)
    // External/bare module imports (e.g., 'react', 'express') won't have WikiNodes
    const isExternalImport = !imp.from.startsWith('.') && !imp.from.startsWith('/');
    if (isExternalImport) {
      continue;
    }

    // Resolve the source file path
    let sourceFilePath = imp.from;
    // Simple path normalization - add .ts extension if missing
    // Note: Directory imports (e.g., './components') become './components.ts' here,
    // but matching still works because normalizeImportPath in builder/index.ts
    // strips /index suffixes, so 'src/components/index' normalizes to 'src/components'
    // and matches 'components' via the pathsMatch endsWith check.
    if (!sourceFilePath.endsWith('.ts')) {
      sourceFilePath = sourceFilePath + '.ts';
    }

    // Track named imports
    for (const symbolName of imp.names) {
      const symbolUsage = findSymbolUsages(sourceFile, symbolName, sourceFilePath, imp.isTypeOnly);
      if (symbolUsage) {
        usages.push(symbolUsage);
      }
    }

    // Track default import
    if (imp.defaultName) {
      const symbolUsage = findSymbolUsages(
        sourceFile,
        imp.defaultName,
        sourceFilePath,
        imp.isTypeOnly
      );
      if (symbolUsage) {
        usages.push(symbolUsage);
      }
    }
  }

  return usages;
}

/**
 * Find all usages of a specific symbol in the source file.
 */
function findSymbolUsages(
  sourceFile: ReturnType<Project['addSourceFileAtPath']>,
  symbolName: string,
  sourceFilePath: string,
  isTypeOnly: boolean
): SymbolUsage | null {
  const usageLines: number[] = [];
  let usageType: SymbolUsage['usageType'] = isTypeOnly ? 'type' : 'reference';

  // Find all identifiers with this name in the file
  const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier);

  for (const identifier of identifiers) {
    if (identifier.getText() !== symbolName) {
      continue;
    }

    // Skip the import declaration itself
    const parent = identifier.getParent();
    if (
      parent &&
      (parent.getKindName() === 'ImportSpecifier' || parent.getKindName() === 'ImportClause')
    ) {
      continue;
    }

    const line = identifier.getStartLineNumber();
    if (!usageLines.includes(line)) {
      usageLines.push(line);
    }

    // Check if it's a function call
    if (parent && parent.getKindName() === 'CallExpression') {
      // Use getExpression() for robust call expression detection
      // This is clearer than getChildAtIndex(0) and doesn't depend on AST structure
      const callExpr = parent.asKindOrThrow(SyntaxKind.CallExpression);
      // Check if this identifier is the expression being called (not an argument)
      if (callExpr.getExpression() === identifier) {
        usageType = 'call';
      }
    }
  }

  if (usageLines.length === 0) {
    return null;
  }

  return {
    symbol: symbolName,
    sourceFile: sourceFilePath,
    usageLines: usageLines.sort((a, b) => a - b),
    usageType,
  };
}

/**
 * Store extracted file data in MangoDB.
 * @param db - The MangoDB database instance
 * @param extracted - The extracted file data
 */
export async function storeExtracted(db: MangoDb, extracted: ExtractedFile): Promise<void> {
  const collection = db.collection<ExtractedFile>('extracted');

  // Upsert: update if exists, insert if not
  await collection.updateOne({ path: extracted.path }, { $set: extracted }, { upsert: true });
}
