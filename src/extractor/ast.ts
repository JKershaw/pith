import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Project, SyntaxKind, type FunctionDeclaration, type MethodDeclaration } from 'ts-morph';
import { minimatch } from 'minimatch';
import type { MangoDb } from '@jkershaw/mangodb';
import type { GitInfo } from './git.ts';
import type { DocsInfo } from './docs.ts';
import type { ErrorPath } from './errors.ts';
import { extractErrorPaths } from './errors.ts';

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
  startLine: number;
  endLine: number;
  codeSnippet: string;  // First N lines of function source
  keyStatements: KeyStatement[];  // Important statements extracted via AST
  calls: string[];  // Names of functions called within this function (Phase 6.6.7a.1)
  calledBy: string[];  // Names of functions that call this function (Phase 6.6.7a.4, computed in builder)
  errorPaths: ErrorPath[];  // Error handling paths (Phase 6.6.8)
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
  path: string;
  lines: number;
  imports: Import[];
  exports: Export[];
  functions: FunctionData[];
  classes: Class[];
  interfaces: Interface[];
  git?: GitInfo;
  docs?: DocsInfo;
  patterns?: import('./patterns.ts').DetectedPattern[];  // Phase 6.6.6
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

/**
 * Extract a code snippet from a function or method.
 * Returns the first N lines with a truncation indicator if needed.
 * @param getText - Function that returns the full source text
 * @param maxLines - Maximum lines to include (default: 15)
 * @returns The code snippet string
 */
function getCodeSnippet(getText: () => string, maxLines = SNIPPET_MAX_LINES): string {
  const fullText = getText();
  const lines = fullText.split('\n');

  if (lines.length <= maxLines) {
    return fullText;
  }

  const remainingLines = lines.length - maxLines;
  return lines.slice(0, maxLines).join('\n') + `\n  // ... (${remainingLines} more lines)`;
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
    if (init.getKind() === SyntaxKind.NumericLiteral ||
        initText.match(/\?\?\s*\d+/) ||
        initText.match(/\|\|\s*\d+/)) {
      statements.push({ line, text: declText, category: 'config' });
      continue;
    }

    // URL: string literals that look like URLs
    if (init.getKind() === SyntaxKind.StringLiteral &&
        initText.match(/https?:\/\/|wss?:\/\//)) {
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
      const stmt = call.getFirstAncestorByKind(SyntaxKind.VariableStatement) ||
                   call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
      if (stmt) {
        const line = stmt.getStartLineNumber();
        // Avoid duplicates
        if (!statements.some(s => s.line === line)) {
          statements.push({ line, text: stmt.getText().trim(), category: 'math' });
        }
      }
    }
  }

  // 3. Find status code conditionals (if status === 429, status >= 500, etc.)
  for (const ifStmt of func.getDescendantsOfKind(SyntaxKind.IfStatement)) {
    const condition = ifStmt.getExpression().getText();
    // Match status code patterns
    if (condition.match(/status\s*(===|==|>=|<=|>|<)\s*\d{3}/) ||
        condition.match(/\d{3}\s*(===|==|>=|<=|>|<)\s*status/)) {
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
  return statements.filter(s => {
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
        const isIncluded = include.some(pattern => minimatch(relativePath, pattern));

        // Check if file matches exclude patterns
        const isExcluded = exclude.some(pattern => minimatch(relativePath, pattern));

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
  // Phase 6.6.7a.1: First, collect all function names in the file
  const allFunctionNames = new Set<string>(
    sourceFile.getFunctions().map((f) => f.getName() || 'anonymous')
  );

  const functions: FunctionData[] = sourceFile.getFunctions().map((func) => ({
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
    startLine: func.getStartLineNumber(),
    endLine: func.getEndLineNumber(),
    codeSnippet: getCodeSnippet(() => func.getText()),
    keyStatements: extractKeyStatements(func),
    calls: extractFunctionCalls(func, allFunctionNames),  // Phase 6.6.7a.1
    calledBy: [],  // Phase 6.6.7a.4: Computed later in builder
    errorPaths: extractErrorPaths(func),  // Phase 6.6.8
  }));

  // Extract classes
  const classes: Class[] = sourceFile.getClasses().map((cls) => {
    // Phase 6.6.7a.1: Collect all method names for this class
    const allMethodNames = new Set<string>(cls.getMethods().map((m) => m.getName()));

    return {
      name: cls.getName() || 'anonymous',
      methods: cls.getMethods().map((method) => ({
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
        startLine: method.getStartLineNumber(),
        endLine: method.getEndLineNumber(),
        codeSnippet: getCodeSnippet(() => method.getText()),
        keyStatements: extractKeyStatements(method),
        calls: extractFunctionCalls(method, allMethodNames),  // Phase 6.6.7a.1
        calledBy: [],  // Phase 6.6.7a.4: Computed later in builder
        errorPaths: extractErrorPaths(method),  // Phase 6.6.8
      })),
      properties: cls.getProperties().map((prop) => ({
        name: prop.getName(),
        type: prop.getType().getText(),
        isOptional: prop.hasQuestionToken(),
      })),
      isExported: cls.isExported(),
      extends: cls.getExtends()?.getText(),
      implements: cls.getImplements().map((i) => i.getText()),
    };
  });

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

  return extracted;
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
