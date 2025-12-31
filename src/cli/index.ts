#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { version } from '../index.ts';
import { resolve, dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import {
  findFiles,
  createProject,
  extractFile,
  storeExtracted,
  type ExtractedFile,
} from '../extractor/ast.ts';
import { extractGitInfo } from '../extractor/git.ts';
import { extractDocs } from '../extractor/docs.ts';
import { addPatternsToExtractedFile } from '../extractor/patterns.ts';
import {
  loadExtractionCache,
  saveExtractionCache,
  shouldExtract,
  getFileHash,
  type ExtractionCache,
} from '../extractor/cache.ts';
import { getDb, closeDb } from '../db/index.ts';
import {
  buildFileNode,
  buildFunctionNode,
  buildModuleNode,
  shouldCreateFunctionNode,
  shouldCreateModuleNode,
  buildContainsEdges,
  buildImportEdges,
  buildParentEdge,
  buildTestFileEdges,
  buildDependentEdges,
  computeMetadata,
  updateCrossFileCalls,
  type WikiNode,
} from '../builder/index.ts';
import { generateProse, updateNodeWithProse, type GeneratorConfig } from '../generator/index.ts';
import { createApp } from '../api/index.ts';
import { loadConfig } from '../config/index.ts';
import { PithError, formatError, groupErrorsBySeverity } from '../errors/index.ts';

const program = new Command();

// Global output control
interface OutputOptions {
  verbose?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
}

let outputOptions: OutputOptions = {};

function log(message: string, level: 'info' | 'verbose' | 'error' = 'info') {
  if (outputOptions.quiet && level !== 'error') {
    return;
  }
  if (level === 'verbose' && !outputOptions.verbose) {
    return;
  }
  console.log(message);
}

function logError(message: string) {
  console.error(message);
}

program
  .name('pith')
  .description('A codebase wiki optimized for LLM consumption')
  .version(version)
  .option('-v, --verbose', 'Show detailed output')
  .option('-q, --quiet', 'Show minimal output (errors only)')
  .option('--dry-run', 'Preview actions without executing')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    outputOptions = {
      verbose: opts.verbose,
      quiet: opts.quiet,
      dryRun: opts.dryRun,
    };
  });

program
  .command('extract <path>')
  .description('Extract data from a TypeScript codebase')
  .option('--force', 'Force re-extraction of all files, ignoring cache')
  .action(async (path: string, options: { force?: boolean }) => {
    const startTime = Date.now();

    try {
      // Resolve path to absolute
      const absolutePath = resolve(path);

      // Check if path exists
      try {
        const stats = await stat(absolutePath);
        if (!stats.isDirectory()) {
          logError(`Error: "${absolutePath}" is not a directory`);
          process.exit(1);
        }
      } catch {
        logError(`Error: Path "${absolutePath}" does not exist`);
        process.exit(1);
      }

      if (outputOptions.dryRun) {
        log('[DRY-RUN] Extract mode - no files will be modified');
      }
      log(`Extracting from: ${absolutePath}`);

      // Load configuration
      const config = await loadConfig(absolutePath);

      // Get data directory from environment, config, or use default
      const dataDir = process.env.PITH_DATA_DIR || config.output.dataDir;

      // Find all TypeScript files using config patterns
      const files = await findFiles(absolutePath, {
        include: config.extraction.include,
        exclude: config.extraction.exclude,
      });
      log(`Found ${files.length} TypeScript files`);

      // Dry-run: just list files and exit
      if (outputOptions.dryRun) {
        log(`\n[DRY-RUN] Would extract ${files.length} files:`);
        for (const file of files.slice(0, 20)) {
          log(`  - ${file}`);
        }
        if (files.length > 20) {
          log(`  ... and ${files.length - 20} more`);
        }
        return;
      }

      // Create ts-morph project
      const ctx = createProject(absolutePath);

      // Get database connection
      const db = await getDb(dataDir);

      // Load extraction cache
      const cache = options.force ? { version: 1, files: {} } : await loadExtractionCache(dataDir);

      // Filter files based on cache (unless --force is used)
      const filesToExtract: string[] = [];
      let skippedCount = 0;

      if (options.force) {
        filesToExtract.push(...files);
        log('Force mode enabled: extracting all files', 'verbose');
      } else {
        for (const relativePath of files) {
          const fullPath = join(absolutePath, relativePath);
          if (await shouldExtract(fullPath, relativePath, cache)) {
            filesToExtract.push(relativePath);
          } else {
            skippedCount++;
          }
        }
        log(
          `Incremental extraction: ${filesToExtract.length} to extract, ${skippedCount} unchanged`
        );
      }

      // Extract and store each file with parallel processing
      const BATCH_SIZE = 4; // Process 4 files concurrently for extraction
      let processedCount = 0;
      const errors: Array<{ path: string; error: Error | PithError }> = [];
      const newCache: ExtractionCache = { version: 1, files: { ...cache.files } };

      // Process files in batches
      for (let i = 0; i < filesToExtract.length; i += BATCH_SIZE) {
        const batch = filesToExtract.slice(i, i + BATCH_SIZE);

        // Extract files in parallel (but store sequentially to avoid DB corruption)
        const results = await Promise.allSettled(
          batch.map(async (relativePath) => {
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

              // Phase 6.6.6: Detect design patterns
              addPatternsToExtractedFile(extracted);

              // Compute hash for cache
              const fullPath = join(absolutePath, relativePath);
              const hash = await getFileHash(fullPath);

              return { relativePath, extracted, hash };
            } catch (error) {
              // Wrap in PithError if it's a parse error
              if (error instanceof Error && error.message.includes('parse')) {
                throw new PithError('PARSE_ERROR', error.message, 'error');
              }
              throw error;
            }
          })
        );

        // Store results sequentially to avoid database corruption
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const relativePath = batch[j];

          if (!result || !relativePath) continue;

          if (result.status === 'fulfilled') {
            // Store in database (sequential to avoid file corruption)
            await storeExtracted(db, result.value.extracted);

            // Update cache
            newCache.files[relativePath] = {
              hash: result.value.hash,
              extractedAt: new Date().toISOString(),
            };

            processedCount++;
            log(`Extracted ${processedCount}/${filesToExtract.length}: ${relativePath}`, 'verbose');
            if (!outputOptions.verbose && processedCount % 10 === 0) {
              log(`Progress: ${processedCount}/${filesToExtract.length} files`);
            }
          } else {
            const reason = result.reason;
            const error = reason instanceof Error ? reason : new Error(String(reason));
            errors.push({ path: relativePath, error });
            log(`  ✗ ${relativePath}: ${error.message}`, 'verbose');
          }
        }
      }

      // Save updated cache
      await saveExtractionCache(dataDir, newCache);

      // Close database connection
      await closeDb();

      // Report summary
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      log(
        `\nCompleted in ${elapsedSec}s: ${processedCount} files extracted, ${skippedCount} skipped, ${errors.length} errors`
      );

      if (errors.length > 0) {
        logError('\nErrors:');

        // Group and display errors by severity
        const errorList = errors.map((e) => e.error);
        const grouped = groupErrorsBySeverity(errorList);

        // Show fatal errors first
        if (grouped.fatal.length > 0) {
          logError('\nFatal errors:');
          errors
            .filter((e) => e.error instanceof PithError && e.error.severity === 'fatal')
            .forEach(({ path, error }) => {
              logError(`  - ${path}:`);
              logError(`    ${formatError(error).split('\n').join('\n    ')}`);
            });
        }

        // Show regular errors
        if (grouped.error.length > 0) {
          logError('\nErrors:');
          errors
            .filter((e) => !(e.error instanceof PithError && e.error.severity === 'fatal'))
            .forEach(({ path, error }) => {
              logError(`  - ${path}: ${error.message}`);
            });
        }

        logError(
          '\nSuggestion: Try --force to reprocess all files, or check the error messages above.'
        );
      }
    } catch (error) {
      logError('Error during extraction:');
      logError(String(error));
      await closeDb();
      process.exit(1);
    }
  });

program
  .command('build')
  .description('Build node graph from extracted data')
  .action(async () => {
    const startTime = Date.now();

    try {
      if (outputOptions.dryRun) {
        log('[DRY-RUN] Build mode - no nodes will be saved');
      }
      log('Building node graph...');

      // Load configuration
      const config = await loadConfig();

      // Get data directory from environment, config, or use default
      const dataDir = process.env.PITH_DATA_DIR || config.output.dataDir;

      // Get database connection
      const db = await getDb(dataDir);
      const extractedCollection = db.collection<ExtractedFile>('extracted');

      // Step 2.6.2: Check that extracted data exists
      const extractedFiles = await extractedCollection.find({}).toArray();
      if (extractedFiles.length === 0) {
        logError('Error: No extracted data found. Please run `pith extract` first.');
        await closeDb();
        process.exit(1);
      }

      log(`Found ${extractedFiles.length} extracted files`);

      // Step 2.6.1: Build all nodes

      // Build file nodes
      const fileNodes: WikiNode[] = [];
      for (const extracted of extractedFiles) {
        const fileNode = buildFileNode(extracted);
        fileNodes.push(fileNode);
      }
      log(`Created ${fileNodes.length} file nodes`);

      // Build function nodes
      const functionNodes: WikiNode[] = [];
      for (const extracted of extractedFiles) {
        for (const func of extracted.functions) {
          if (shouldCreateFunctionNode(func)) {
            const functionNode = buildFunctionNode(extracted, func);
            functionNodes.push(functionNode);
          }
        }
      }
      log(`Created ${functionNodes.length} function nodes`);

      // Group files by directory and build module nodes
      const dirMap = new Map<string, string[]>();
      for (const extracted of extractedFiles) {
        const dir = dirname(extracted.path);
        if (!dirMap.has(dir)) {
          dirMap.set(dir, []);
        }
        dirMap.get(dir)!.push(extracted.path);
      }

      const moduleNodes: WikiNode[] = [];
      for (const [dirPath, files] of dirMap.entries()) {
        if (shouldCreateModuleNode(files)) {
          // Get README from one of the extracted files in this directory
          // (READMEs are extracted during the extract phase)
          let readme: string | undefined;
          const extractedInDir = extractedFiles.find((f) => dirname(f.path) === dirPath);
          if (extractedInDir?.docs?.readme) {
            readme = extractedInDir.docs.readme;
          }

          const moduleNode = buildModuleNode(dirPath, files, readme);
          moduleNodes.push(moduleNode);
        }
      }
      log(`Created ${moduleNodes.length} module nodes`);

      // Combine all nodes
      const allNodes = [...fileNodes, ...functionNodes, ...moduleNodes];

      // Build edges
      const allFilePaths = fileNodes.map((node) => node.id);

      // Add contains edges: module → files
      for (const moduleNode of moduleNodes) {
        const filesInModule = fileNodes.filter(
          (fileNode) => dirname(fileNode.path) === moduleNode.path
        );
        const containsEdges = buildContainsEdges(moduleNode, filesInModule);
        moduleNode.edges.push(...containsEdges);
      }

      // Add contains edges: file → functions
      for (const fileNode of fileNodes) {
        const functionsInFile = functionNodes.filter((funcNode) => funcNode.path === fileNode.path);
        const containsEdges = buildContainsEdges(fileNode, functionsInFile);
        fileNode.edges.push(...containsEdges);
      }

      // Add import edges: file → file
      for (const fileNode of fileNodes) {
        const importEdges = buildImportEdges(fileNode, allFilePaths);
        fileNode.edges.push(...importEdges);
      }

      // Add parent edges: file → module
      for (const fileNode of fileNodes) {
        const parentModule = moduleNodes.find(
          (moduleNode) => moduleNode.path === dirname(fileNode.path)
        );
        if (parentModule) {
          const parentEdge = buildParentEdge(fileNode, parentModule);
          fileNode.edges.push(parentEdge);
        }
      }

      // Add test file edges: source → test file (Phase 6.2.2)
      const testFileEdges = buildTestFileEdges(fileNodes);
      for (const { sourceId, type, target, weight } of testFileEdges) {
        const sourceNode = fileNodes.find((n) => n.id === sourceId);
        if (sourceNode) {
          sourceNode.edges.push({ type, target, weight });
        }
      }

      // Add importedBy edges: file → dependents (Phase 6.3.1)
      const dependentEdges = buildDependentEdges(fileNodes);
      for (const { sourceId, type, target, weight } of dependentEdges) {
        const sourceNode = fileNodes.find((n) => n.id === sourceId);
        if (sourceNode) {
          sourceNode.edges.push({ type, target, weight });
        }
      }

      log('Built edges', 'verbose');

      // Update cross-file calls (Phase 6.6.7b.3)
      updateCrossFileCalls(fileNodes);
      log('Computed cross-file call graph', 'verbose');

      // Compute metadata (fan-in, fan-out, age, recency)
      computeMetadata(allNodes);
      log('Computed metadata', 'verbose');

      // Dry-run: show what would be created and exit
      if (outputOptions.dryRun) {
        log(`\n[DRY-RUN] Would create ${allNodes.length} nodes:`);
        log(`  - ${fileNodes.length} file nodes`);
        log(`  - ${functionNodes.length} function nodes`);
        log(`  - ${moduleNodes.length} module nodes`);
        if (outputOptions.verbose) {
          log(`\nSample nodes:`);
          for (const node of allNodes.slice(0, 5)) {
            log(`  - ${node.type}: ${node.id}`);
          }
        }
        await closeDb();
        return;
      }

      // Store all nodes in database
      const nodesCollection = db.collection<WikiNode>('nodes');
      for (const node of allNodes) {
        await nodesCollection.updateOne({ id: node.id }, { $set: node }, { upsert: true });
      }

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      log(
        `\nBuild complete in ${elapsedSec}s: ${fileNodes.length} file nodes, ${functionNodes.length} function nodes, ${moduleNodes.length} module nodes`
      );

      // Close database connection
      await closeDb();
    } catch (error) {
      logError('Error during build:');
      logError(String(error));
      await closeDb();
      process.exit(1);
    }
  });

program
  .command('generate')
  .description('Generate prose documentation for nodes using LLM')
  .option('-m, --model <model>', 'OpenRouter model to use (or set OPENROUTER_MODEL in .env)')
  .option('--node <nodeId>', 'Generate for specific node only')
  .option('--force', 'Regenerate prose even if already exists')
  .option('--estimate', 'Show cost estimate without generating')
  .action(
    async (options: { model?: string; node?: string; force?: boolean; estimate?: boolean }) => {
      const startTime = Date.now();
      // Load configuration
      const config = await loadConfig();

      const dataDir = process.env.PITH_DATA_DIR || config.output.dataDir;
      const apiKey = process.env.OPENROUTER_API_KEY;
      const model =
        options.model ||
        process.env.OPENROUTER_MODEL ||
        config.llm?.model ||
        'anthropic/claude-sonnet-4';

      // For estimation and dry-run, we don't need the API key
      const needsApiKey = !options.estimate && !outputOptions.dryRun;
      if (!apiKey && needsApiKey) {
        logError('Error: OPENROUTER_API_KEY is required');
        logError('Set it in .env file or with: export OPENROUTER_API_KEY=your-key');
        process.exit(1);
      }

      const generatorConfig: GeneratorConfig = {
        provider: 'openrouter',
        model,
        apiKey: apiKey ?? '', // Empty string for estimate/dry-run modes
      };

      try {
        const db = await getDb(dataDir);
        const nodesCollection = db.collection<WikiNode>('nodes');

        // Get nodes to generate for
        let query: Record<string, unknown> = {};
        if (options.node) {
          query = { id: options.node };
        } else if (!options.force) {
          // Only nodes without prose
          query = { prose: { $exists: false } };
        }

        const nodes = await nodesCollection.find(query).toArray();

        if (nodes.length === 0) {
          if (options.node) {
            logError(`No node found with id: ${options.node}`);
          } else {
            log('No nodes found that need prose generation.');
            log('Use --force to regenerate existing prose.');
          }
          await closeDb();
          return;
        }

        // Cost estimation mode
        if (options.estimate || outputOptions.dryRun) {
          // Estimate tokens based on raw data size
          let totalInputTokens = 0;
          const AVG_CHARS_PER_TOKEN = 4; // Rough estimate
          const AVG_OUTPUT_TOKENS = 500; // Typical output size

          for (const node of nodes) {
            // Estimate input tokens from prompt (rough calculation)
            const rawDataSize = JSON.stringify(node.raw).length;
            const metadataSize = JSON.stringify(node.metadata).length;
            const estimatedPromptSize = rawDataSize + metadataSize + 500; // +500 for prompt template
            totalInputTokens += Math.ceil(estimatedPromptSize / AVG_CHARS_PER_TOKEN);
          }

          const totalOutputTokens = nodes.length * AVG_OUTPUT_TOKENS;

          // OpenRouter pricing for Anthropic Claude Sonnet 4 (approximate)
          const INPUT_COST_PER_1K = 0.003; // $3 per 1M tokens
          const OUTPUT_COST_PER_1K = 0.015; // $15 per 1M tokens

          const inputCost = (totalInputTokens / 1000) * INPUT_COST_PER_1K;
          const outputCost = (totalOutputTokens / 1000) * OUTPUT_COST_PER_1K;
          const totalCost = inputCost + outputCost;

          log('\nProse generation estimate:');
          log(`  Nodes without prose: ${nodes.length}`);
          log(`  Estimated input tokens: ~${totalInputTokens.toLocaleString()}`);
          log(`  Estimated output tokens: ~${totalOutputTokens.toLocaleString()}`);
          log(`  Estimated cost: ~$${totalCost.toFixed(2)}`);
          log(`  Using model: ${model}`);

          if (outputOptions.dryRun) {
            log('\n[DRY-RUN] Would generate prose for these nodes:');
            for (const node of nodes.slice(0, 10)) {
              log(`  - ${node.type}: ${node.id}`);
            }
            if (nodes.length > 10) {
              log(`  ... and ${nodes.length - 10} more`);
            }
          }

          await closeDb();
          return;
        }

        log(`Generating prose for ${nodes.length} nodes...`);
        log(`Using model: ${model}`);

        let generated = 0;
        const generationErrors: Array<{ nodeId: string; error: Error | PithError }> = [];

        // Process nodes (file nodes first for fractal generation)
        const fileNodes = nodes.filter((n) => n.type === 'file');
        const moduleNodes = nodes.filter((n) => n.type === 'module');
        const orderedNodes = [...fileNodes, ...moduleNodes];

        for (const node of orderedNodes) {
          try {
            log(`  Generating: ${node.id}`, 'verbose');
            if (!outputOptions.verbose && generated % 5 === 0 && generated > 0) {
              log(`Progress: ${generated}/${orderedNodes.length} nodes`);
            }

            // For module nodes, gather child summaries
            let childSummaries: Map<string, string> | undefined;
            if (node.type === 'module') {
              const childIds = node.edges.filter((e) => e.type === 'contains').map((e) => e.target);

              const children = await nodesCollection.find({ id: { $in: childIds } }).toArray();

              childSummaries = new Map(
                children.filter((c) => c.prose?.summary).map((c) => [c.id, c.prose!.summary])
              );
            }

            const prose = await generateProse(node, generatorConfig, { childSummaries });
            await updateNodeWithProse(db, node.id, prose);

            generated++;
            log(`    ✓ ${node.id}`, 'verbose');
          } catch (error) {
            const pithError =
              error instanceof Error
                ? error.message.includes('Rate limited') || error.message.includes('429')
                  ? new PithError(
                      'LLM_ERROR',
                      error.message,
                      'error',
                      'Wait a few minutes and try again'
                    )
                  : error instanceof PithError
                    ? error
                    : new Error(error.message)
                : new Error(String(error));

            generationErrors.push({ nodeId: node.id, error: pithError });
            log(`    ✗ ${node.id}: ${(error as Error).message}`, 'verbose');
          }
        }

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        log(
          `\nCompleted in ${elapsedSec}s: ${generated} generated, ${generationErrors.length} errors`
        );

        if (generationErrors.length > 0) {
          logError('\nDetailed error information:');

          // Group errors by severity
          const errorList = generationErrors.map((e) => e.error);
          const grouped = groupErrorsBySeverity(errorList);

          // Show warnings (like rate limits that might retry)
          if (grouped.warning.length > 0) {
            logError('\nWarnings:');
            generationErrors
              .filter((e) => e.error instanceof PithError && e.error.severity === 'warning')
              .forEach(({ nodeId, error }) => {
                logError(`  - ${nodeId}:`);
                logError(`    ${formatError(error).split('\n').join('\n    ')}`);
              });
          }

          // Show errors
          if (grouped.error.length > 0) {
            logError('\nErrors:');
            generationErrors
              .filter((e) => !(e.error instanceof PithError && e.error.severity === 'warning'))
              .forEach(({ nodeId, error }) => {
                logError(`  - ${nodeId}: ${error.message}`);
              });
          }

          logError(
            '\nSuggestion: Check your OPENROUTER_API_KEY and rate limits. Use --force to regenerate failed nodes.'
          );
        }

        await closeDb();
      } catch (error) {
        logError(`Error: ${(error as Error).message}`);
        await closeDb();
        process.exit(1);
      }
    }
  );

program
  .command('serve')
  .description('Start the API server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('--lazy', 'Enable on-demand prose generation (default: true)')
  .option('--no-lazy', 'Disable on-demand prose generation')
  .action(async (options: { port: string; lazy: boolean }) => {
    // Load configuration
    const config = await loadConfig();

    const port = parseInt(options.port, 10);
    const dataDir = process.env.PITH_DATA_DIR || config.output.dataDir;
    const lazy = options.lazy !== false; // Default to true

    try {
      const db = await getDb(dataDir);
      const nodesCollection = db.collection<WikiNode>('nodes');

      // Verify nodes exist
      const nodeCount = await nodesCollection.countDocuments({});
      if (nodeCount === 0) {
        logError('Error: No nodes found. Run `pith extract` and `pith build` first.');
        await closeDb();
        process.exit(1);
      }

      // Setup generator config if lazy mode is enabled
      let generatorConfig: GeneratorConfig | undefined;
      if (lazy) {
        const apiKey = process.env.OPENROUTER_API_KEY;
        const model =
          process.env.OPENROUTER_MODEL || config.llm?.model || 'anthropic/claude-sonnet-4';

        if (apiKey) {
          generatorConfig = {
            provider: 'openrouter',
            model,
            apiKey,
          };
          log('Lazy prose generation enabled', 'verbose');
        } else {
          log(
            'Warning: OPENROUTER_API_KEY not set. On-demand prose generation disabled.',
            'verbose'
          );
        }
      }

      const app = createApp(db, generatorConfig);

      const server = app.listen(port, () => {
        log(`Pith API server running on http://localhost:${port}`);
        log(`\nEndpoints:`);
        log(`  GET  /node/:path      - Fetch a single node`);
        log(`  GET  /context?files=  - Bundled context for files`);
        log(`  POST /refresh         - Re-extract and rebuild`);
        log(`\nServing ${nodeCount} nodes.`);
        if (generatorConfig) {
          log(`On-demand prose generation: enabled (model: ${generatorConfig.model})`);
        } else {
          log(`On-demand prose generation: disabled`);
        }
      });

      server.on('error', async (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          logError(`Error: Port ${port} is already in use`);
        } else {
          logError(`Server error: ${err.message}`);
        }
        await closeDb();
        process.exit(1);
      });
    } catch (error) {
      logError(`Error: ${(error as Error).message}`);
      await closeDb();
      process.exit(1);
    }
  });

program.parse();
