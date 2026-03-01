/**
 * LLM Integration Test for defAgent
 *
 * Tests agent definitions with real LLMs.
 *
 * Running:
 * LM_TEST_MODEL=openai:gpt-4o-mini npm test -- --run tests/integration/defAgent
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { runPrompt } from '../../src/runPrompt';
import { agent } from '../../src';
import {
  hasTestModel,
  TEST_MODEL,
  TEST_TIMEOUT,
  getModelDisplayName
} from './test-helper';

describe('defAgent Integration Tests', () => {
  const modelDisplay = getModelDisplayName(TEST_MODEL);

  it.skipIf(!hasTestModel)(`executes a simple agent (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defAgent with ${modelDisplay} ===`);

    let agentWasCalled = false;
    let agentArgs: any = null;

    const { result } = await runPrompt(async ({ defAgent, $ }) => {
      defAgent('summarizer', 'Summarize text',
        z.object({ text: z.string() }),
        async (args, childPrompt) => {
          agentWasCalled = true;
          agentArgs = args;
          childPrompt.$`Summarize this in one sentence: ${args.text}`;
        }
      );

      $`Use the summarizer agent to summarize: "The quick brown fox jumps over the lazy dog."`;
    }, {
      model: TEST_MODEL
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);
    console.log(`  > Agent was called: ${agentWasCalled}`);
    console.log(`  > Agent args:`, agentArgs);

    expect(agentWasCalled).toBe(true);
    expect(text.length).toBeGreaterThan(0);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`executes a composite agent (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing composite defAgent with ${modelDisplay} ===`);

    let counterCalls = 0;
    let reverserCalls = 0;

    const { result } = await runPrompt(async ({ defAgent, $ }) => {
      defAgent('helpers', 'Helper agents', [
        agent('counter', 'Count words',
          z.object({ text: z.string() }),
          async ({ text }, childPrompt) => {
            counterCalls++;
            childPrompt.$`Count the words in "${text}". Return just the number.`;
          }
        ),
        agent('reverser', 'Reverse text',
          z.object({ text: z.string() }),
          async ({ text }, childPrompt) => {
            reverserCalls++;
            childPrompt.$`Reverse "${text}" character by character.`;
          }
        )
      ]);

      $`Use the helpers counter agent to count words in "hello world test". Return just the number.`;
    }, {
      model: TEST_MODEL
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);
    console.log(`  > Counter calls: ${counterCalls}`);

    expect(counterCalls).toBeGreaterThan(0);
    expect(text).toMatch(/\b3\b/);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`uses agent with responseSchema (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defAgent with responseSchema with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ defAgent, $ }) => {
      defAgent('analyzer', 'Analyze sentiment',
        z.object({ text: z.string() }),
        async ({ text }, childPrompt) => {
          childPrompt.$`Analyze the sentiment of "${text}". Return JSON with: sentiment (positive/negative/neutral) and score (0-100).`;
        },
        {
          responseSchema: z.object({
            sentiment: z.string(),
            score: z.number()
          })
        }
      );

      $`Use the analyzer agent to analyze the sentiment of "I love this amazing product!"`;
    }, {
      model: TEST_MODEL
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toMatch(/positive|amazing|love/);
    console.log(`  > Test passed!\n`);
  });
});
