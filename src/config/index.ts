import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * LLM configuration.
 */
export interface LLMConfig {
  provider: 'openrouter' | 'anthropic' | 'openai';
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Extraction configuration.
 */
export interface ExtractionConfig {
  include: string[];
  exclude: string[];
}

/**
 * Output configuration.
 */
export interface OutputConfig {
  dataDir: string;
}

/**
 * Pith configuration.
 */
export interface PithConfig {
  extraction: ExtractionConfig;
  llm?: LLMConfig;
  output: OutputConfig;
}

/**
 * Default configuration.
 */
export const DEFAULT_CONFIG: PithConfig = {
  extraction: {
    include: ['src/**/*.ts', 'lib/**/*.ts', '**/*.ts'],
    exclude: [
      'node_modules/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/*.d.ts',
      'dist/**',
      'build/**',
    ],
  },
  output: {
    dataDir: '.pith/data',
  },
};

/**
 * Load configuration from pith.config.json or return defaults.
 * @param rootDir - The root directory to search for config file (defaults to cwd)
 * @returns The loaded configuration
 * @throws Error if config file exists but is invalid
 */
export async function loadConfig(rootDir?: string): Promise<PithConfig> {
  const configDir = rootDir || process.cwd();
  const configPath = join(configDir, 'pith.config.json');

  try {
    const configContent = await readFile(configPath, 'utf-8');
    let userConfig: Partial<PithConfig>;

    try {
      userConfig = JSON.parse(configContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse pith.config.json: ${message}`);
    }

    // Validate LLM provider if specified
    if (userConfig.llm?.provider) {
      const validProviders = ['openrouter', 'anthropic', 'openai'];
      if (!validProviders.includes(userConfig.llm.provider)) {
        throw new Error(
          `Invalid LLM provider: "${userConfig.llm.provider}". Must be one of: ${validProviders.join(', ')}`
        );
      }
    }

    // Merge with defaults
    const config: PithConfig = {
      extraction: {
        include: userConfig.extraction?.include || DEFAULT_CONFIG.extraction.include,
        exclude: userConfig.extraction?.exclude || DEFAULT_CONFIG.extraction.exclude,
      },
      llm: userConfig.llm,
      output: {
        dataDir: userConfig.output?.dataDir || DEFAULT_CONFIG.output.dataDir,
      },
    };

    return config;
  } catch (error) {
    // If file doesn't exist, return defaults
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return DEFAULT_CONFIG;
    }

    // Re-throw other errors (parsing, validation, etc.)
    throw error;
  }
}
