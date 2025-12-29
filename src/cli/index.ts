#!/usr/bin/env node

import { Command } from 'commander';
import { version } from '../index.ts';
import { resolve, dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { findFiles, createProject, extractFile, storeExtracted, type ExtractedFile } from '../extractor/ast.ts';
import { extractGitInfo } from '../extractor/git.ts';
import { extractDocs } from '../extractor/docs.ts';
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
  computeMetadata,
  type WikiNode,
} from '../builder/index.ts';
import {
  generateProse,
  updateNodeWithProse,
  type GeneratorConfig,
} from '../generator/index.ts';
import { createApp } from '../api/index.ts';

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
  .action(async () => {
    try {
      console.log('Building node graph...');

      // Get data directory from environment or use default
      const dataDir = process.env.PITH_DATA_DIR || './data';

      // Get database connection
      const db = await getDb(dataDir);
      const extractedCollection = db.collection<ExtractedFile>('extracted');

      // Step 2.6.2: Check that extracted data exists
      const extractedFiles = await extractedCollection.find({}).toArray();
      if (extractedFiles.length === 0) {
        console.error('Error: No extracted data found. Please run `pith extract` first.');
        await closeDb();
        process.exit(1);
      }

      console.log(`Found ${extractedFiles.length} extracted files`);

      // Step 2.6.1: Build all nodes

      // Build file nodes
      const fileNodes: WikiNode[] = [];
      for (const extracted of extractedFiles) {
        const fileNode = buildFileNode(extracted);
        fileNodes.push(fileNode);
      }
      console.log(`Created ${fileNodes.length} file nodes`);

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
      console.log(`Created ${functionNodes.length} function nodes`);

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
          const extractedInDir = extractedFiles.find(f => dirname(f.path) === dirPath);
          if (extractedInDir?.docs?.readme) {
            readme = extractedInDir.docs.readme;
          }

          const moduleNode = buildModuleNode(dirPath, files, readme);
          moduleNodes.push(moduleNode);
        }
      }
      console.log(`Created ${moduleNodes.length} module nodes`);

      // Combine all nodes
      const allNodes = [...fileNodes, ...functionNodes, ...moduleNodes];

      // Build edges
      const allFilePaths = fileNodes.map(node => node.id);

      // Add contains edges: module → files
      for (const moduleNode of moduleNodes) {
        const filesInModule = fileNodes.filter(fileNode =>
          dirname(fileNode.path) === moduleNode.path
        );
        const containsEdges = buildContainsEdges(moduleNode, filesInModule);
        moduleNode.edges.push(...containsEdges);
      }

      // Add contains edges: file → functions
      for (const fileNode of fileNodes) {
        const functionsInFile = functionNodes.filter(funcNode =>
          funcNode.path === fileNode.path
        );
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
        const parentModule = moduleNodes.find(moduleNode =>
          moduleNode.path === dirname(fileNode.path)
        );
        if (parentModule) {
          const parentEdge = buildParentEdge(fileNode, parentModule);
          fileNode.edges.push(parentEdge);
        }
      }

      console.log('Built edges');

      // Compute metadata (fan-in, fan-out, age, recency)
      computeMetadata(allNodes);
      console.log('Computed metadata');

      // Store all nodes in database
      const nodesCollection = db.collection<WikiNode>('nodes');
      for (const node of allNodes) {
        await nodesCollection.updateOne(
          { id: node.id },
          { $set: node },
          { upsert: true }
        );
      }

      console.log(`\nBuild complete: ${fileNodes.length} file nodes, ${functionNodes.length} function nodes, ${moduleNodes.length} module nodes`);

      // Close database connection
      await closeDb();
    } catch (error) {
      console.error('Error during build:', error);
      await closeDb();
      process.exit(1);
    }
  });

program
  .command('generate')
  .description('Generate prose documentation for nodes using LLM')
  .option('-m, --model <model>', 'OpenRouter model to use', 'anthropic/claude-sonnet-4')
  .option('--node <nodeId>', 'Generate for specific node only')
  .option('--force', 'Regenerate prose even if already exists')
  .action(async (options: { model: string; node?: string; force?: boolean }) => {
    const dataDir = process.env.PITH_DATA_DIR || './data';
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      console.error('Error: OPENROUTER_API_KEY environment variable is required');
      console.error('Set it with: export OPENROUTER_API_KEY=your-key');
      process.exit(1);
    }

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: options.model,
      apiKey,
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
          console.error(`No node found with id: ${options.node}`);
        } else {
          console.log('No nodes found that need prose generation.');
          console.log('Use --force to regenerate existing prose.');
        }
        await closeDb();
        return;
      }

      console.log(`Generating prose for ${nodes.length} nodes...`);
      console.log(`Using model: ${options.model}`);

      let generated = 0;
      let errors = 0;

      // Process nodes (file nodes first for fractal generation)
      const fileNodes = nodes.filter(n => n.type === 'file');
      const moduleNodes = nodes.filter(n => n.type === 'module');
      const orderedNodes = [...fileNodes, ...moduleNodes];

      for (const node of orderedNodes) {
        try {
          console.log(`  Generating: ${node.id}`);

          // For module nodes, gather child summaries
          let childSummaries: Map<string, string> | undefined;
          if (node.type === 'module') {
            const childIds = node.edges
              .filter(e => e.type === 'contains')
              .map(e => e.target);

            const children = await nodesCollection
              .find({ id: { $in: childIds } })
              .toArray();

            childSummaries = new Map(
              children
                .filter(c => c.prose?.summary)
                .map(c => [c.id, c.prose!.summary])
            );
          }

          const prose = await generateProse(node, config, { childSummaries });
          await updateNodeWithProse(db, node.id, prose);

          generated++;
          console.log(`    ✓ ${node.id}`);
        } catch (error) {
          errors++;
          console.error(`    ✗ ${node.id}: ${(error as Error).message}`);
        }
      }

      console.log(`\nCompleted: ${generated} generated, ${errors} errors`);
      await closeDb();

    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      await closeDb();
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start the API server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .action(async (options: { port: string }) => {
    const port = parseInt(options.port, 10);
    const dataDir = process.env.PITH_DATA_DIR || './data';

    try {
      const db = await getDb(dataDir);
      const nodesCollection = db.collection<WikiNode>('nodes');

      // Verify nodes exist
      const nodeCount = await nodesCollection.countDocuments({});
      if (nodeCount === 0) {
        console.error('Error: No nodes found. Run `pith extract` and `pith build` first.');
        await closeDb();
        process.exit(1);
      }

      const app = createApp(db);

      app.listen(port, () => {
        console.log(`Pith API server running on http://localhost:${port}`);
        console.log(`\nEndpoints:`);
        console.log(`  GET  /node/:path      - Fetch a single node`);
        console.log(`  GET  /context?files=  - Bundled context for files`);
        console.log(`  POST /refresh         - Re-extract and rebuild`);
        console.log(`\nServing ${nodeCount} nodes.`);
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      await closeDb();
      process.exit(1);
    }
  });

program.parse();
