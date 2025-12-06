#!/usr/bin/env node

import { resolve } from 'path';
import { existsSync } from 'fs';
import { runPrompt } from './runPrompt';

export const VALID_EXTENSION = '.lmt.mjs';

export interface LmtModule {
  default: (prompt: any) => Promise<void>;
  config?: {
    model: string;
    options?: Record<string, unknown>;
  };
}

export class CliError extends Error {
  constructor(message: string, public exitCode: number = 1) {
    super(message);
    this.name = 'CliError';
  }
}

export function printUsage(): string {
  return `
lmthing - Run AI agent prompts

Usage:
  lmthing run <file>    Run a prompt file

Arguments:
  <file>    Path to a ${VALID_EXTENSION} file

Example:
  npx lmthing run myagent.lmt.mjs

File format:
  export default async ({ def, defTool, $ }) => {
    def('NAME', 'World');
    $\`Hello \${def('NAME')}\`;
  };

  export const config = {
    model: 'openai:gpt-4o'
  };
`;
}

export function validateFile(filePath: string, cwd: string = process.cwd()): string {
  const resolvedPath = resolve(cwd, filePath);

  // Check if file ends with .lmt.mjs
  if (!filePath.endsWith(VALID_EXTENSION)) {
    throw new CliError(`File must end with ${VALID_EXTENSION}\n  Got: ${filePath}`);
  }

  // Check if file exists
  if (!existsSync(resolvedPath)) {
    throw new CliError(`File not found: ${resolvedPath}`);
  }

  return resolvedPath;
}

export async function loadModule(filePath: string): Promise<LmtModule> {
  const module = await import(filePath);

  if (typeof module.default !== 'function') {
    throw new CliError(
      'File must have a default export that is a function\n' +
      '  Example: export default async ({ def, $ }) => { ... }'
    );
  }

  return module as LmtModule;
}

export interface RunOptions {
  cwd?: string;
  output?: (chunk: string) => void;
}

export async function runLmtFile(
  filePath: string,
  options: RunOptions = {}
): Promise<string> {
  const { cwd = process.cwd(), output } = options;

  const resolvedPath = validateFile(filePath, cwd);

  // Convert to file:// URL for dynamic import on all platforms
  const fileUrl = `file://${resolvedPath}`;
  const module = await loadModule(fileUrl);

  const promptFn = module.default;
  const config = module.config ?? { model: 'openai:gpt-4o' };

  // Validate config has a model
  if (!config.model) {
    throw new CliError(
      'config must specify a model\n' +
      '  Example: export const config = { model: "openai:gpt-4o" }'
    );
  }

  const { result } = await runPrompt(promptFn, config);

  let fullText = '';

  // Stream the output
  for await (const chunk of result.textStream) {
    fullText += chunk;
    if (output) {
      output(chunk);
    }
  }

  return fullText;
}

async function runCommand(filePath: string): Promise<void> {
  try {
    await runLmtFile(filePath, {
      output: (chunk) => process.stdout.write(chunk)
    });
    // Ensure we end with a newline
    console.log();
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`Error: ${error.message}`);
      process.exit(error.exitCode);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(printUsage());
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'run':
      if (args.length < 2) {
        console.error('Error: Missing file argument');
        console.error('Usage: lmthing run <file>');
        process.exit(1);
      }
      await runCommand(args[1]);
      break;

    case '--help':
    case '-h':
    case 'help':
      console.log(printUsage());
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(printUsage());
      process.exit(1);
  }
}

// Only run main when executed directly, not when imported as a module
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/cli.js') ||
  process.argv[1]?.endsWith('\\cli.js');

if (isMainModule) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
