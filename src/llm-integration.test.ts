import { describe, it, expect } from 'vitest';
import { runPrompt } from './runPrompt';
import { z } from 'zod';

/**
 * LLM Integration Tests
 *
 * These tests run against a real LLM via the GitHub Models API using GitHub Copilot tokens.
 * They are skipped when the required environment variables are not set.
 *
 * Required environment variables:
 *   GITHUB_MODELS_API_KEY  - GitHub token (e.g., GITHUB_TOKEN in CI)
 *   GITHUB_MODELS_API_BASE - https://models.inference.ai.azure.com
 *   GITHUB_MODELS_API_TYPE - openai
 *   GITHUB_MODELS_API_NAME - github
 *
 * In GitHub Actions CI, these are set automatically in the llm-tests workflow.
 */

const hasGitHubModels =
  !!process.env.GITHUB_MODELS_API_KEY &&
  !!process.env.GITHUB_MODELS_API_BASE &&
  process.env.GITHUB_MODELS_API_TYPE === 'openai';

const MODEL = 'github:gpt-4o-mini';

describe.skipIf(!hasGitHubModels)('LLM Integration Tests (GitHub Models)', () => {
  it('should generate a text response', async () => {
    const { result } = await runPrompt(async ({ $ }) => {
      $`Reply with exactly the word "hello" and nothing else.`;
    }, {
      model: MODEL,
      options: { maxTokens: 20 },
    });

    const text = await result.text;
    expect(text).toBeTruthy();
    expect(text.toLowerCase()).toContain('hello');
  }, 30_000);

  it('should use system prompt', async () => {
    const { result } = await runPrompt(async ({ defSystem, $ }) => {
      defSystem('role', 'You are an assistant that always responds in uppercase letters only.');
      $`Say the word "test"`;
    }, {
      model: MODEL,
      options: { maxTokens: 20 },
    });

    const text = await result.text;
    expect(text).toBeTruthy();
    expect(text).toContain('TEST');
  }, 30_000);

  it('should use variables via def()', async () => {
    const { result } = await runPrompt(async ({ def, $ }) => {
      def('CITY', 'Paris');
      $`What country is <CITY> the capital of? Reply with only the country name.`;
    }, {
      model: MODEL,
      options: { maxTokens: 20 },
    });

    const text = await result.text;
    expect(text).toBeTruthy();
    expect(text.toLowerCase()).toContain('france');
  }, 30_000);

  it('should call a tool and return its result', async () => {
    const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
      defTool(
        'add',
        'Add two numbers',
        z.object({ a: z.number(), b: z.number() }),
        async ({ a, b }: { a: number; b: number }) => ({ sum: a + b }),
      );
      $`What is 7 + 15? Use the add tool to compute the answer, then reply with the numeric result.`;
    }, {
      model: MODEL,
      options: { maxTokens: 100 },
    });

    const text = await result.text;
    expect(text).toBeTruthy();
    expect(text).toContain('22');

    // Verify the tool was actually called
    const steps = prompt.steps;
    const toolCalls = steps.flatMap(s => s.output.content.filter((c: any) => c.type === 'tool-call'));
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(toolCalls[0].toolName).toBe('add');
  }, 60_000);
});
