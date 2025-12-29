#!/usr/bin/env node

import { Command } from 'commander';
import { version } from '../index.ts';
import { resolve, dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { findFiles, createProject, extractFile, storeExtracted } from '../extractor/ast.ts';
import { extractGitInfo } from '../extractor/git.ts';
import { extractDocs } from '../extractor/docs.ts';
import { getDb, closeDb } from '../db/index.ts';

const program = new Command();

program
  .name('pith')
  .description('A codebase wiki optimized for LLM consumption')
  .version(version);

program
  .command('extract <path>')
  .description('Extract data from a TypeScript codebase')
  .action(async (path: string) => {
    try {
      // Resolve path to absolute
      const absolutePath = resolve(path);

      // Check if path exists
      try {
        const stats = await stat(absolutePath);
        if (!stats.isDirectory()) {
          console.error(`Error: "${absolutePath}" is not a directory`);
          process.exit(1);
        }
      } catch {
        console.error(`Error: Path "${absolutePath}" does not exist`);
        process.exit(1);
      }

      console.log(`Extracting from: ${absolutePath}`);

      // Get data directory from environment or use default
      const dataDir = process.env.PITH_DATA_DIR || './data';

      // Find all TypeScript files
      const files = await findFiles(absolutePath);
      console.log(`Found ${files.length} TypeScript files`);

      // Create ts-morph project
      const ctx = createProject(absolutePath);

      // Get database connection
      const db = await getDb(dataDir);

      // Extract and store each file, collecting errors
      let processedCount = 0;
      const errors: { path: string; message: string }[] = [];

      for (const relativePath of files) {
        try {
          // Extract AST data
          const extracted = extractFile(ctx, relativePath);

          // Extract git info
          const git = await extractGitInfo(absolutePath, relativePath);

          // Extract docs (need the directory for README)
          const fileDirPath = join(absolutePath, dirname(relativePath));
          const docs = await extractDocs(ctx, relativePath, fileDirPath);

          // Combine all data
          extracted.git = git;
          extracted.docs = docs;

          // Store in database
          await storeExtracted(db, extracted);

          processedCount++;
          console.log(`Extracted ${processedCount}/${files.length}: ${relativePath}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ path: relativePath, message });
          console.log(`Error extracting ${relativePath}: ${message}`);
        }
      }

      // Close database connection
      await closeDb();

      // Report summary
      console.log(`\nCompleted: ${processedCount} files extracted, ${errors.length} errors`);
      if (errors.length > 0) {
        console.log('\nErrors:');
        for (const error of errors) {
          console.log(`  - ${error.path}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('Error during extraction:', error);
      await closeDb();
      process.exit(1);
    }
  });

program
  .command('build')
  .description('Build node graph from extracted data')
  .action(() => {
    console.log('Building node graph...');
    // TODO: Implement build
  });

program
  .command('generate')
  .description('Generate prose for nodes using LLM')
  .action(() => {
    console.log('Generating prose...');
    // TODO: Implement generation
  });

program
  .command('serve')
  .description('Start the API server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .action((options: { port: string }) => {
    console.log(`Starting server on port ${options.port}...`);
    // TODO: Implement server
  });

program.parse();
