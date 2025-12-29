#!/usr/bin/env node

import { Command } from 'commander';
import { version } from '../index.ts';

const program = new Command();

program
  .name('pith')
  .description('A codebase wiki optimized for LLM consumption')
  .version(version);

program
  .command('extract <path>')
  .description('Extract data from a TypeScript codebase')
  .action((path: string) => {
    console.log(`Extracting from: ${path}`);
    // TODO: Implement extraction
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
