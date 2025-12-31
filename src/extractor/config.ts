import { join } from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

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
 * Distinguishes between missing files (returns null silently) and
 * parse errors (logs warning, returns null).
 * @param filePath - Path to the JSON file
 * @returns Parsed JSON or null if file doesn't exist or is invalid
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  // Check if file exists first
  try {
    await access(filePath, constants.R_OK);
  } catch {
    // File doesn't exist or isn't readable - this is expected, return null silently
    return null;
  }

  // File exists, try to read and parse
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    // File exists but couldn't be parsed - this is a problem, log it
    console.warn(`Warning: Failed to parse ${filePath}: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Type guard for string values.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for Record<string, string> (e.g., scripts, dependencies).
 */
function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.values(value).every((v) => typeof v === 'string');
}

/**
 * Type guard for string arrays.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Extract package.json data.
 * Phase 6.8.3.1: Extract scripts and dependencies.
 * @param rootDir - Project root directory
 * @returns Extracted package.json data or undefined if not found/invalid
 */
export async function extractPackageJson(rootDir: string): Promise<PackageJsonData | undefined> {
  const filePath = join(rootDir, 'package.json');
  const data = await readJsonFile<Record<string, unknown>>(filePath);

  if (!data) {
    return undefined;
  }

  return {
    name: isString(data.name) ? data.name : undefined,
    version: isString(data.version) ? data.version : undefined,
    scripts: isStringRecord(data.scripts) ? data.scripts : undefined,
    dependencies: isStringRecord(data.dependencies) ? data.dependencies : undefined,
    devDependencies: isStringRecord(data.devDependencies) ? data.devDependencies : undefined,
    main: isString(data.main) ? data.main : undefined,
    type: isString(data.type) ? data.type : undefined,
  };
}

/**
 * Type guard for compiler options object.
 */
function isCompilerOptions(value: unknown): value is TsConfigData['compilerOptions'] {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard for extraction config.
 */
function isExtractionConfig(value: unknown): value is PithConfigData['extraction'] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (obj.include !== undefined && !isStringArray(obj.include)) {
    return false;
  }
  if (obj.exclude !== undefined && !isStringArray(obj.exclude)) {
    return false;
  }
  return true;
}

/**
 * Type guard for LLM config.
 */
function isLlmConfig(value: unknown): value is PithConfigData['llm'] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (obj.provider !== undefined && !isString(obj.provider)) {
    return false;
  }
  if (obj.model !== undefined && !isString(obj.model)) {
    return false;
  }
  return true;
}

/**
 * Type guard for output config.
 */
function isOutputConfig(value: unknown): value is PithConfigData['output'] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (obj.dir !== undefined && !isString(obj.dir)) {
    return false;
  }
  return true;
}

/**
 * Extract tsconfig.json data.
 * Phase 6.8.3.2: Extract compiler options.
 * @param rootDir - Project root directory
 * @returns Extracted tsconfig.json data or undefined if not found/invalid
 */
export async function extractTsConfig(rootDir: string): Promise<TsConfigData | undefined> {
  const filePath = join(rootDir, 'tsconfig.json');
  const data = await readJsonFile<Record<string, unknown>>(filePath);

  if (!data) {
    return undefined;
  }

  return {
    compilerOptions: isCompilerOptions(data.compilerOptions) ? data.compilerOptions : undefined,
    include: isStringArray(data.include) ? data.include : undefined,
    exclude: isStringArray(data.exclude) ? data.exclude : undefined,
  };
}

/**
 * Extract pith.config.json data.
 * Phase 6.8.3.3: Extract pith configuration if present.
 * @param rootDir - Project root directory
 * @returns Extracted pith.config.json data or undefined if not found/invalid
 */
export async function extractPithConfig(rootDir: string): Promise<PithConfigData | undefined> {
  const filePath = join(rootDir, 'pith.config.json');
  const data = await readJsonFile<Record<string, unknown>>(filePath);

  if (!data) {
    return undefined;
  }

  return {
    extraction: isExtractionConfig(data.extraction) ? data.extraction : undefined,
    llm: isLlmConfig(data.llm) ? data.llm : undefined,
    output: isOutputConfig(data.output) ? data.output : undefined,
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
    packageJson,
    tsconfig,
    pithConfig,
  };
}
