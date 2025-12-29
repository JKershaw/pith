import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Project } from 'ts-morph';

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
 * Extracted file data structure.
 */
export interface ExtractedFile {
  path: string;
  lines: number;
  imports: Import[];
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

  return {
    path: relativePath,
    lines: sourceFile.getEndLineNumber(),
    imports,
  };
}
