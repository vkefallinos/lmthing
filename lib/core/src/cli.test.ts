import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  validateFile,
  loadModule,
  runLmtFile,
  printUsage,
  CliError,
  VALID_EXTENSION
} from './cli';

describe('CLI', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    testDir = join(tmpdir(), `lmthing-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('VALID_EXTENSION', () => {
    it('should be .lmt.mjs', () => {
      expect(VALID_EXTENSION).toBe('.lmt.mjs');
    });
  });

  describe('printUsage', () => {
    it('should return usage information', () => {
      const usage = printUsage();
      expect(usage).toContain('lmthing');
      expect(usage).toContain('run');
      expect(usage).toContain('.lmt.mjs');
      expect(usage).toContain('export default');
      expect(usage).toContain('export const config');
    });
  });

  describe('validateFile', () => {
    it('should throw CliError for invalid file extension', () => {
      expect(() => validateFile('myagent.js', testDir)).toThrow(CliError);
      expect(() => validateFile('myagent.js', testDir)).toThrow('File must end with .lmt.mjs');
    });

    it('should throw CliError for .mjs files without .lmt prefix', () => {
      expect(() => validateFile('myagent.mjs', testDir)).toThrow(CliError);
      expect(() => validateFile('myagent.mjs', testDir)).toThrow('File must end with .lmt.mjs');
    });

    it('should throw CliError for non-existent file with valid extension', () => {
      expect(() => validateFile('nonexistent.lmt.mjs', testDir)).toThrow(CliError);
      expect(() => validateFile('nonexistent.lmt.mjs', testDir)).toThrow('File not found');
    });

    it('should return resolved path for valid existing file', () => {
      const testFile = join(testDir, 'test.lmt.mjs');
      writeFileSync(testFile, 'export default () => {}');

      const result = validateFile('test.lmt.mjs', testDir);
      expect(result).toBe(testFile);
    });

    it('should handle absolute paths', () => {
      const testFile = join(testDir, 'absolute.lmt.mjs');
      writeFileSync(testFile, 'export default () => {}');

      const result = validateFile(testFile, '/');
      expect(result).toBe(testFile);
    });
  });

  describe('loadModule', () => {
    it('should load a valid module with default export', async () => {
      const testFile = join(testDir, 'valid.lmt.mjs');
      writeFileSync(testFile, `
        export default async ({ def, $ }) => {
          def('test', 'value');
        };
        export const config = { model: 'test:model' };
      `);

      const module = await loadModule(`file://${testFile}`);
      expect(typeof module.default).toBe('function');
      expect(module.config).toEqual({ model: 'test:model' });
    });

    it('should load module without config export', async () => {
      const testFile = join(testDir, 'noconfig.lmt.mjs');
      writeFileSync(testFile, `
        export default async ({ $ }) => {
          $\`Hello\`;
        };
      `);

      const module = await loadModule(`file://${testFile}`);
      expect(typeof module.default).toBe('function');
      expect(module.config).toBeUndefined();
    });

    it('should throw CliError for missing default export', async () => {
      const testFile = join(testDir, 'nodefault.lmt.mjs');
      writeFileSync(testFile, `
        export const config = { model: 'test:model' };
      `);

      await expect(loadModule(`file://${testFile}`)).rejects.toThrow(CliError);
      await expect(loadModule(`file://${testFile}`)).rejects.toThrow(
        'File must have a default export that is a function'
      );
    });

    it('should throw CliError when default export is not a function', async () => {
      const testFile = join(testDir, 'notfunc.lmt.mjs');
      writeFileSync(testFile, `
        export default { notAFunction: true };
      `);

      await expect(loadModule(`file://${testFile}`)).rejects.toThrow(CliError);
      await expect(loadModule(`file://${testFile}`)).rejects.toThrow(
        'File must have a default export that is a function'
      );
    });
  });

  describe('runLmtFile', () => {
    it('should run a valid lmt file with mock export and return output', async () => {
      const testFile = join(testDir, 'runnable.lmt.mjs');
      writeFileSync(testFile, `
        export const mock = [
          { type: 'text', text: 'Hello from lmthing CLI!' }
        ];

        export default async ({ def, $ }) => {
          const name = def('NAME', 'World');
          $\`Say hello to \${name}\`;
        };

        export const config = { model: 'mock' };
      `);

      const chunks: string[] = [];
      const result = await runLmtFile('runnable.lmt.mjs', {
        cwd: testDir,
        output: (chunk) => chunks.push(chunk)
      });

      expect(result).toBe('Hello from lmthing CLI!');
      expect(chunks.join('')).toBe('Hello from lmthing CLI!');
    });

    it('should run mock file with multiple text chunks', async () => {
      const testFile = join(testDir, 'multi.lmt.mjs');
      writeFileSync(testFile, `
        export const mock = [
          { type: 'text', text: 'First ' },
          { type: 'text', text: 'Second ' },
          { type: 'text', text: 'Third' }
        ];

        export default async ({ $ }) => {
          $\`Say something\`;
        };

        export const config = { model: 'mock' };
      `);

      const result = await runLmtFile('multi.lmt.mjs', { cwd: testDir });
      expect(result).toBe('First Second Third');
    });

    it('should throw CliError when mock export is missing for mock model', async () => {
      const testFile = join(testDir, 'nomock.lmt.mjs');
      writeFileSync(testFile, `
        export default async ({ $ }) => {
          $\`Test\`;
        };

        export const config = { model: 'mock' };
      `);

      await expect(runLmtFile('nomock.lmt.mjs', { cwd: testDir }))
        .rejects.toThrow('When using model: "mock", you must export a mock array');
    });

    it('should throw CliError for invalid file extension', async () => {
      await expect(runLmtFile('invalid.js', { cwd: testDir }))
        .rejects.toThrow(CliError);
    });

    it('should throw CliError for non-existent file', async () => {
      await expect(runLmtFile('missing.lmt.mjs', { cwd: testDir }))
        .rejects.toThrow(CliError);
    });
  });

  describe('CliError', () => {
    it('should have correct name and message', () => {
      const error = new CliError('Test error');
      expect(error.name).toBe('CliError');
      expect(error.message).toBe('Test error');
      expect(error.exitCode).toBe(1);
    });

    it('should support custom exit codes', () => {
      const error = new CliError('Test error', 2);
      expect(error.exitCode).toBe(2);
    });

    it('should be an instance of Error', () => {
      const error = new CliError('Test error');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
