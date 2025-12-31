import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

/**
 * Extracted package.json data.
 * Phase 6.8.3.1
 */
export interface PackageJsonData {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  main?: string;
  type?: string;
}

/**
 * Extracted tsconfig.json data.
 * Phase 6.8.3.2
 */
export interface TsConfigData {
  compilerOptions?: {
    target?: string;
    module?: string;
    strict?: boolean;
    esModuleInterop?: boolean;
    outDir?: string;
    rootDir?: string;
    declaration?: boolean;
    [key: string]: unknown;
  };
  include?: string[];
  exclude?: string[];
}

/**
 * Extracted pith.config.json data.
 * Phase 6.8.3.3
 */
export interface PithConfigData {
  extraction?: {
    include?: string[];
    exclude?: string[];
  };
  llm?: {
    provider?: string;
    model?: string;
  };
  output?: {
    dir?: string;
  };
}

/**
 * Combined config data from all config files.
 */
export interface ConfigData {
  packageJson?: PackageJsonData;
  tsconfig?: TsConfigData;
  pithConfig?: PithConfigData;
}

/**
 * Read and parse a JSON file safely.
 * @param filePath - Path to the JSON file
 * @returns Parsed JSON or null if file doesn't exist or is invalid
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Extract package.json data.
 * Phase 6.8.3.1: Extract scripts and dependencies.
 * @param rootDir - Project root directory
 * @returns Extracted package.json data or null
 */
export async function extractPackageJson(rootDir: string): Promise<PackageJsonData | null> {
  const filePath = join(rootDir, 'package.json');
  const data = await readJsonFile<Record<string, unknown>>(filePath);

  if (!data) {
    return null;
  }

  return {
    name: data.name as string | undefined,
    version: data.version as string | undefined,
    scripts: data.scripts as Record<string, string> | undefined,
    dependencies: data.dependencies as Record<string, string> | undefined,
    devDependencies: data.devDependencies as Record<string, string> | undefined,
    main: data.main as string | undefined,
    type: data.type as string | undefined,
  };
}

/**
 * Extract tsconfig.json data.
 * Phase 6.8.3.2: Extract compiler options.
 * @param rootDir - Project root directory
 * @returns Extracted tsconfig.json data or null
 */
export async function extractTsConfig(rootDir: string): Promise<TsConfigData | null> {
  const filePath = join(rootDir, 'tsconfig.json');
  const data = await readJsonFile<Record<string, unknown>>(filePath);

  if (!data) {
    return null;
  }

  return {
    compilerOptions: data.compilerOptions as TsConfigData['compilerOptions'],
    include: data.include as string[] | undefined,
    exclude: data.exclude as string[] | undefined,
  };
}

/**
 * Extract pith.config.json data.
 * Phase 6.8.3.3: Extract pith configuration if present.
 * @param rootDir - Project root directory
 * @returns Extracted pith.config.json data or null
 */
export async function extractPithConfig(rootDir: string): Promise<PithConfigData | null> {
  const filePath = join(rootDir, 'pith.config.json');
  const data = await readJsonFile<Record<string, unknown>>(filePath);

  if (!data) {
    return null;
  }

  return {
    extraction: data.extraction as PithConfigData['extraction'],
    llm: data.llm as PithConfigData['llm'],
    output: data.output as PithConfigData['output'],
  };
}

/**
 * Extract all config file data from a project.
 * Phase 6.8.3: Config File Extraction.
 * @param rootDir - Project root directory
 * @returns Combined config data from all config files
 */
export async function extractConfigFiles(rootDir: string): Promise<ConfigData> {
  const [packageJson, tsconfig, pithConfig] = await Promise.all([
    extractPackageJson(rootDir),
    extractTsConfig(rootDir),
    extractPithConfig(rootDir),
  ]);

  return {
    packageJson: packageJson ?? undefined,
    tsconfig: tsconfig ?? undefined,
    pithConfig: pithConfig ?? undefined,
  };
}
