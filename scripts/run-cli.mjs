import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { config as loadDotenv } from 'dotenv';

function parseExampleArg() {
  if (process.argv.length > 2) {
    return process.argv[2];
  }

  const rawNpmArgs = process.env.npm_config_argv;
  if (!rawNpmArgs) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawNpmArgs);
    const [first] = Array.isArray(parsed?.remain) ? parsed.remain : [];
    return typeof first === 'string' && first.length > 0 ? first : undefined;
  } catch {
    return undefined;
  }
}

async function findFile(root, fileName) {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.turbo') {
          continue;
        }
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name === fileName) {
        return fullPath;
      }
    }
  }

  return null;
}

async function loadEnvironment() {
  const cwd = process.cwd();
  loadDotenv({ path: path.join(cwd, '.env'), override: false });
  loadDotenv({ path: path.join(cwd, '.env.local'), override: false });
}

async function ensureCliPath(cliPath) {
  try {
    await access(cliPath, constants.F_OK);
  } catch {
    console.error('dist/cli.js not found. Run "npm run build:cli" before executing this script.');
    process.exit(1);
  }
}

async function main() {
  await loadEnvironment();

  const exampleName = parseExampleArg();
  if (!exampleName) {
    console.error('Usage: npm run script <example-name>');
    process.exit(1);
  }

  const targetFileName = `${exampleName}.lmt.mjs`;
  const searchRoots = [process.cwd(), path.resolve(process.cwd(), '..')];
  let targetPath = null;

  for (const root of searchRoots) {
    targetPath = await findFile(root, targetFileName);
    if (targetPath) {
      break;
    }
  }

  if (!targetPath) {
    console.error(`Unable to locate a file matching ../**/${targetFileName}`);
    process.exit(1);
  }

  const cliPath = path.resolve(process.cwd(), 'dist/cli.js');
  await ensureCliPath(cliPath);

  const child = spawn(process.execPath, [cliPath, 'run', targetPath], {
    stdio: 'inherit'
  });

  child.on('close', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
