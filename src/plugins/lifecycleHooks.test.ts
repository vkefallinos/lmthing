/**
 * Unit tests for lifecycleHooks plugin
 */

import { describe, it, expect, vi } from 'vitest';
import { StatefulPrompt } from '../StatefulPrompt';
import { createMockModel } from '../test/createMockModel';
import { runPrompt } from '../runPrompt';
import { lifecycleHooksPlugin } from './lifecycleHooks';
import { z } from 'zod';

describe('lifecycleHooksPlugin', () => {
  it('should register and execute onAfterToolUse hooks', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Let me search...' },
      { type: 'tool-call', toolCallId: 'c1', toolName: 'search', args: { query: 'test' } },
      { type: 'text', text: 'Found it!' },
    ]);

    const hookCalls: any[] = [];

    const { result } = await runPrompt(
      async ({ defLifecycleHook, defTool, $ }) => {
        defLifecycleHook('onAfterToolUse', ({ toolName, args, output }) => {
          hookCalls.push({ toolName, args, output });
        });

        defTool(
          'search',
          'Search for info',
          z.object({ query: z.string() }),
          async ({ query }: { query: string }) => ({ results: [query] })
        );

        $`Search for test`;
      },
      { model: mockModel, plugins: [lifecycleHooksPlugin] }
    );

    await result.text;

    // The onAfterToolUse hook should have been called
    expect(hookCalls.length).toBeGreaterThan(0);
    expect(hookCalls[0].toolName).toBe('search');
    expect(hookCalls[0].args).toEqual({ query: 'test' });
  });

  it('should register and execute onBeforeStep hooks', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    const stepNumbers: number[] = [];

    const { result } = await runPrompt(
      async ({ defLifecycleHook, $ }) => {
        defLifecycleHook('onBeforeStep', ({ stepNumber }) => {
          stepNumbers.push(stepNumber);
        });

        $`Say hello`;
      },
      { model: mockModel, plugins: [lifecycleHooksPlugin] }
    );

    await result.text;

    // The onBeforeStep hook should have been called at least once
    expect(stepNumbers.length).toBeGreaterThan(0);
    expect(stepNumbers[0]).toBe(0);
  });

  it('should not call onAfterToolUse when no tools are used', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    const hookCalls: any[] = [];

    const { result } = await runPrompt(
      async ({ defLifecycleHook, $ }) => {
        defLifecycleHook('onAfterToolUse', (ctx) => {
          hookCalls.push(ctx);
        });

        $`Just a simple message`;
      },
      { model: mockModel, plugins: [lifecycleHooksPlugin] }
    );

    await result.text;

    // No tool was called, so hook should not fire
    expect(hookCalls.length).toBe(0);
  });
});
