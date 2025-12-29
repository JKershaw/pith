import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Project } from 'ts-morph';
import type { MangoDb } from '@jkershaw/mangodb';
import type { GitInfo } from './git.ts';

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
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'default';
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
 * Function data.
 */
export interface Function {
  name: string;
  signature: string;
  params: Param[];
  returnType: string;
  isAsync: boolean;
  isExported: boolean;
  startLine: number;
  endLine: number;
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
  methods: Function[];
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
  functions: Function[];
  classes: Class[];
  interfaces: Interface[];
  git?: GitInfo;
}

/**
 * Find all TypeScript files in a directory.
 * @param rootDir - The root directory to search
 * @returns Array of relative file paths
 */
export async function findFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

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
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(relative(rootDir, fullPath));
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
 */
export function extractFile(ctx: ProjectContext, relativePath: string): ExtractedFile {
  const sourceFile = ctx.project.addSourceFileAtPath(join(ctx.rootDir, relativePath));

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
        kind: 'const', // Star exports re-export everything
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
  const functions: Function[] = sourceFile.getFunctions().map((func) => ({
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
  }));

  // Extract classes
  const classes: Class[] = sourceFile.getClasses().map((cls) => ({
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
    })),
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

  return {
    path: relativePath,
    lines: sourceFile.getEndLineNumber(),
    imports,
    exports,
    functions,
    classes,
    interfaces,
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
