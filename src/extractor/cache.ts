import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Cache entry for a single file.
 */
export interface CacheEntry {
  hash: string;
  extractedAt: string;
}

/**
 * Extraction cache structure.
 */
export interface ExtractionCache {
  version: number;
  files: Record<string, CacheEntry>;
}

/**
 * Compute SHA-256 hash of a file's content.
 * @param filePath - Absolute path to the file
 * @returns Hash string in format "sha256-{hex}"
 */
export async function getFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8');
  const hash = createHash('sha256').update(content).digest('hex');
  return `sha256-${hash}`;
}

/**
 * Load extraction cache from data directory.
 * Returns empty cache if file doesn't exist or is invalid.
 * @param dataDir - Directory containing the cache file
 * @returns Extraction cache
 */
export async function loadExtractionCache(dataDir: string): Promise<ExtractionCache> {
  const cachePath = join(dataDir, 'extraction-cache.json');

  try {
    const content = await readFile(cachePath, 'utf-8');
    const cache = JSON.parse(content) as ExtractionCache;

    // Validate cache structure
    if (typeof cache.version !== 'number' || typeof cache.files !== 'object') {
      throw new Error('Invalid cache structure');
    }

    return cache;
  } catch {
    // Return empty cache if file doesn't exist or is invalid
    return {
      version: 1,
      files: {},
    };
  }
}

/**
 * Save extraction cache to data directory.
 * @param dataDir - Directory to save the cache file
 * @param cache - Cache to save
 */
export async function saveExtractionCache(
  dataDir: string,
  cache: ExtractionCache
): Promise<void> {
  // Ensure directory exists before writing
  await mkdir(dataDir, { recursive: true });
  const cachePath = join(dataDir, 'extraction-cache.json');
  await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Determine if a file should be extracted based on cache.
 * Returns true if:
 * - File is not in cache
 * - File hash has changed since last extraction
 * @param filePath - Absolute path to the file
 * @param relativePath - Relative path used as cache key
 * @param cache - Current extraction cache
 * @returns True if file should be extracted
 */
export async function shouldExtract(
  filePath: string,
  relativePath: string,
  cache: ExtractionCache
): Promise<boolean> {
  const currentHash = await getFileHash(filePath);

  // Check if file is in cache
  const cached = cache.files[relativePath];
  if (!cached) {
    return true; // New file, should extract
  }

  // Compare hashes
  return cached.hash !== currentHash;
}
