import { MangoClient, MangoDb } from '@jkershaw/mangodb';

let client: MangoClient | null = null;
let db: MangoDb | null = null;
let currentDataDir: string | null = null;

/**
 * Get or create a database connection.
 * @param dataDir - Directory to store data (defaults to ./data)
 * @returns The database instance
 * @throws Error if called with different dataDir while connection exists
 */
export async function getDb(dataDir = './data'): Promise<MangoDb> {
  if (db && currentDataDir !== null) {
    if (currentDataDir !== dataDir) {
      throw new Error(
        `Database already connected to "${currentDataDir}". ` +
          `Call closeDb() before connecting to "${dataDir}".`
      );
    }
    return db;
  }

  client = new MangoClient(dataDir);
  await client.connect();
  db = client.db('pith');
  currentDataDir = dataDir;
  return db;
}

/**
 * Close the database connection.
 */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    currentDataDir = null;
  }
}

/**
 * Get a typed collection from the database.
 * @param name - Collection name
 * @returns The collection
 */
export async function getCollection<T extends Record<string, unknown>>(name: string) {
  const database = await getDb();
  return database.collection<T>(name);
}
