import type { MangoDb } from '@jkershaw/mangodb';
import type { WikiNode } from '../builder/index.ts';
import type { GeneratorConfig } from '../generator/index.ts';
import { generateProseForNode } from '../generator/index.ts';
import express, { type Express, type Request, type Response } from 'express';
import { stat } from 'node:fs/promises';

/**
 * Bundled context for LLM consumption
 */
export interface BundledContext {
  nodes: WikiNode[];     // All relevant nodes
  errors: string[];      // Any errors during bundling
  depth: number;         // Maximum traversal depth used
}

/**
 * Bundle context for a set of requested file paths.
 * Includes requested nodes, their imports, and parent modules.
 *
 * @param db - MangoDB database instance
 * @param paths - File paths to include in context
 * @param maxDepth - Maximum traversal depth (default 1)
 * @returns Bundled context with all relevant nodes
 */
export async function bundleContext(
  db: MangoDb,
  paths: string[],
  maxDepth: number = 1
): Promise<BundledContext> {
  const nodesCollection = db.collection<WikiNode>('nodes');
  const nodeMap = new Map<string, WikiNode>();
  const errors: string[] = [];

  // Fetch requested nodes in parallel
  const requestedNodes = await Promise.all(
    paths.map(path => nodesCollection.findOne({ id: path }))
  );

  for (let i = 0; i < paths.length; i++) {
    const node = requestedNodes[i];
    if (node) {
      nodeMap.set(node.id, node);
    } else {
      errors.push(`Node not found: ${paths[i]}`);
    }
  }

  // Traverse to find related nodes (depth 1 = immediate imports + parent)
  if (maxDepth >= 1) {
    const initialNodes = [...nodeMap.values()];

    // Collect all targets to fetch (imports + parents)
    const targetsToFetch = new Set<string>();

    for (const node of initialNodes) {
      // Collect import targets
      const importEdges = node.edges.filter(e => e.type === 'imports');
      for (const edge of importEdges) {
        if (!nodeMap.has(edge.target)) {
          targetsToFetch.add(edge.target);
        }
      }

      // Collect parent target
      const parentEdge = node.edges.find(e => e.type === 'parent');
      if (parentEdge && !nodeMap.has(parentEdge.target)) {
        targetsToFetch.add(parentEdge.target);
      }
    }

    // Fetch all related nodes in parallel
    const relatedNodes = await Promise.all(
      [...targetsToFetch].map(target => nodesCollection.findOne({ id: target }))
    );

    for (const node of relatedNodes) {
      if (node) {
        nodeMap.set(node.id, node);
      }
    }
  }

  return {
    nodes: [...nodeMap.values()],
    errors,
    depth: maxDepth,
  };
}

/**
 * Format bundled context as markdown for LLM consumption.
 *
 * @param context - Bundled context to format
 * @returns Markdown string
 */
export function formatContextAsMarkdown(context: BundledContext): string {
  const lines: string[] = [];

  lines.push('# Context');
  lines.push('');
  lines.push(`*${context.nodes.length} nodes included (depth ${context.depth})*`);
  lines.push('');

  // Sort nodes: modules first, then files by path
  const sortedNodes = [...context.nodes].sort((a, b) => {
    if (a.type === 'module' && b.type !== 'module') return -1;
    if (a.type !== 'module' && b.type === 'module') return 1;
    return a.path.localeCompare(b.path);
  });

  for (const node of sortedNodes) {
    lines.push(`## ${node.path}`);
    lines.push('');
    lines.push(`**Type:** ${node.type}`);

    // Prose summary and purpose
    if (node.prose) {
      lines.push('');
      lines.push(`**Summary:** ${node.prose.summary}`);
      if (node.prose.purpose) {
        lines.push('');
        lines.push(`**Purpose:** ${node.prose.purpose}`);
      }
      if (node.prose.gotchas && node.prose.gotchas.length > 0) {
        lines.push('');
        lines.push('**Gotchas:**');
        for (const gotcha of node.prose.gotchas) {
          lines.push(`- ${gotcha}`);
        }
      }
    }

    // Signatures for files
    if (node.type === 'file' && node.raw.signature && node.raw.signature.length > 0) {
      lines.push('');
      lines.push('**Functions:**');
      lines.push('```typescript');
      for (const sig of node.raw.signature) {
        lines.push(sig);
      }
      lines.push('```');
    }

    // Imports
    if (node.type === 'file' && node.raw.imports && node.raw.imports.length > 0) {
      lines.push('');
      lines.push('**Imports:**');
      for (const imp of node.raw.imports) {
        const names = imp.names?.join(', ') || 'default';
        lines.push(`- \`${names}\` from \`${imp.from}\``);
      }
    }

    // Edges (imports)
    const importEdges = node.edges.filter(e => e.type === 'imports');
    if (importEdges.length > 0) {
      lines.push('');
      lines.push('**Imports (resolved):**');
      for (const edge of importEdges) {
        lines.push(`- ${edge.target}`);
      }
    }

    // README for modules
    if (node.type === 'module' && node.raw.readme) {
      lines.push('');
      lines.push('**README:**');
      lines.push('');
      lines.push(node.raw.readme);
    }

    // Key files for modules
    if (node.type === 'module' && node.prose?.keyFiles) {
      lines.push('');
      lines.push('**Key Files:**');
      for (const file of node.prose.keyFiles) {
        lines.push(`- ${file}`);
      }
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Errors section
  if (context.errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const error of context.errors) {
      lines.push(`- ${error}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Create Express application with API routes.
 *
 * @param db - MangoDB database instance
 * @param generatorConfig - Optional LLM generator configuration for on-demand prose generation
 * @param fetchFn - Optional fetch function for testing
 * @returns Express application
 */
export function createApp(
  db: MangoDb,
  generatorConfig?: GeneratorConfig,
  fetchFn?: typeof fetch
): Express {
  const app = express();

  app.use(express.json());

  // GET /node/:path - Fetch a single node by path
  // Uses wildcard (*path) to capture paths with slashes like src/auth/login.ts
  // Express 5 returns wildcards as arrays, so we join them back into a path string
  app.get('/node/*path', async (req: Request, res: Response) => {
    try {
      const pathParts = req.params.path as unknown as string[];
      const nodePath = pathParts.join('/'); // Join array back into path string
      const proseParam = req.query.prose as string | undefined;

      const nodes = db.collection<WikiNode>('nodes');
      let node = await nodes.findOne({ id: nodePath });

      if (!node) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: `Node not found: ${nodePath}`,
        });
        return;
      }

      // On-demand prose generation
      // Generate prose if: node has no prose AND prose param is not 'false' AND generatorConfig is provided
      if (!node.prose && proseParam !== 'false' && generatorConfig) {
        try {
          const updatedNode = await generateProseForNode(nodePath, db, generatorConfig, fetchFn);
          if (updatedNode) {
            node = updatedNode;
          }
        } catch (error) {
          // Log error but return node without prose rather than failing the request
          console.error(`Failed to generate prose for ${nodePath}:`, (error as Error).message);
        }
      }

      res.json(node);
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: (error as Error).message,
      });
    }
  });

  // GET /context?files=a,b,c - Get bundled context for multiple files
  app.get('/context', async (req: Request, res: Response) => {
    try {
      const files = req.query.files as string | undefined;
      const format = req.query.format as string | undefined;

      if (!files) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Missing required query parameter: files',
        });
        return;
      }

      const filePaths = files.split(',').map(f => f.trim()).filter(f => f.length > 0);

      if (filePaths.length === 0) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'No valid file paths provided',
        });
        return;
      }

      const context = await bundleContext(db, filePaths);

      if (format === 'json') {
        res.json(context);
      } else {
        // Default to markdown
        const markdown = formatContextAsMarkdown(context);
        res.type('text/markdown').send(markdown);
      }
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: (error as Error).message,
      });
    }
  });

  // POST /refresh - Re-run extract + build for a project
  app.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath?: string };

      if (!projectPath) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Missing required field: projectPath',
        });
        return;
      }

      // Validate the path exists and is a directory (using async stat)
      let stats;
      try {
        stats = await stat(projectPath);
      } catch {
        res.status(400).json({
          error: 'INVALID_PATH',
          message: `Path does not exist: ${projectPath}`,
        });
        return;
      }

      if (!stats.isDirectory()) {
        res.status(400).json({
          error: 'INVALID_PATH',
          message: `Path is not a directory: ${projectPath}`,
        });
        return;
      }

      // TODO: Implement actual refresh logic by calling extract + build
      // For now, return success with placeholder message
      res.json({
        status: 'success',
        message: `Refresh triggered for ${projectPath}`,
        projectPath,
      });
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: (error as Error).message,
      });
    }
  });

  return app;
}
