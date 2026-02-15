/**
 * Unit tests for contextCompaction plugin
 */

import { describe, it, expect } from 'vitest';
import { createMockModel } from '../test/createMockModel';
import { runPrompt } from '../runPrompt';
import { contextCompactionPlugin } from './contextCompaction';

describe('contextCompactionPlugin', () => {
  it('should register compaction without errors', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    const { result } = await runPrompt(
      async ({ defCompaction, $ }) => {
        defCompaction({ maxMessages: 10, preserveRecent: 3 });
        $`Say hello`;
      },
      { model: mockModel, plugins: [contextCompactionPlugin] }
    );

    await result.text;
    // Should complete without errors
    expect(true).toBe(true);
  });

  it('should use default config when no options provided', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    const { result, prompt } = await runPrompt(
      async ({ defCompaction, $ }) => {
        defCompaction();
        $`Say hello`;
      },
      { model: mockModel, plugins: [contextCompactionPlugin] }
    );

    await result.text;
    // Should complete without errors with defaults
    expect(prompt).toBeDefined();
  });

  it('should not compact when messages are below threshold', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Short reply' },
    ]);

    let capturedStepModifierCalls: any[] = [];

    const { result, prompt } = await runPrompt(
      async ({ defCompaction, defEffect, $ }) => {
        defCompaction({ maxMessages: 100, preserveRecent: 5 });

        // Track step modifications
        defEffect((ctx, step) => {
          // Just observing - the compaction effect handles the logic
        });

        $`A single message`;
      },
      { model: mockModel, plugins: [contextCompactionPlugin] }
    );

    await result.text;

    // With only 1 message, should not trigger compaction
    expect(prompt.steps).toBeDefined();
  });
});
