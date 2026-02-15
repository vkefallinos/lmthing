/**
 * Unit tests for persistentContext plugin
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createMockModel } from '../test/createMockModel';
import { runPrompt } from '../runPrompt';
import { persistentContextPlugin } from './persistentContext';

describe('persistentContextPlugin', () => {
  const tmpDir = '/tmp/lmthing-test-context';
  const tmpFile = path.join(tmpDir, '.lmthing.md');

  afterEach(() => {
    // Clean up temp files
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
    } catch {
      // ignore cleanup errors
    }
  });

  it('should load context from direct content', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    let contextResult: any;

    const { result } = await runPrompt(
      async ({ defContext, $ }) => {
        contextResult = defContext({
          content: 'Always use TypeScript strict mode.',
        });
        $`Help me`;
      },
      { model: mockModel, plugins: [persistentContextPlugin] }
    );

    await result.text;

    expect(contextResult.loaded).toBe(true);
    expect(contextResult.sources).toEqual(['direct']);
    expect(contextResult.content).toBe('Always use TypeScript strict mode.');
  });

  it('should load context from a specific file path', async () => {
    // Create temp directory and file
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(tmpFile, '# Project Rules\n\nAlways write tests.');

    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    let contextResult: any;

    const { result } = await runPrompt(
      async ({ defContext, $ }) => {
        contextResult = defContext({ paths: [tmpFile] });
        $`Help me`;
      },
      { model: mockModel, plugins: [persistentContextPlugin] }
    );

    await result.text;

    expect(contextResult.loaded).toBe(true);
    expect(contextResult.sources).toContain(tmpFile);
    expect(contextResult.content).toContain('Always write tests.');
  });

  it('should return empty result when no context files found', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    let contextResult: any;

    const { result } = await runPrompt(
      async ({ defContext, $ }) => {
        contextResult = defContext({
          paths: ['/tmp/nonexistent-lmthing-context-file.md'],
        });
        $`Help me`;
      },
      { model: mockModel, plugins: [persistentContextPlugin] }
    );

    await result.text;

    expect(contextResult.loaded).toBe(false);
    expect(contextResult.sources).toEqual([]);
    expect(contextResult.content).toBe('');
  });

  it('should use custom section name', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    const { result, prompt } = await runPrompt(
      async ({ defContext, $ }) => {
        defContext({
          content: 'Custom instructions',
          sectionName: 'customRules',
        });
        $`Help me`;
      },
      { model: mockModel, plugins: [persistentContextPlugin] }
    );

    await result.text;
    // Should complete without errors
    expect(prompt).toBeDefined();
  });
});
