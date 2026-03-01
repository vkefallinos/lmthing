/**
 * LLM Integration Test for defTool
 *
 * Tests tool definitions with real LLMs.
 *
 * Running:
 * LM_TEST_MODEL=openai:gpt-4o-mini npm test -- --run tests/integration/defTool
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { runPrompt } from '../../src/runPrompt';
import { tool } from '../../src';
import {
  hasTestModel,
  TEST_MODEL,
  TEST_TIMEOUT,
  getModelDisplayName
} from './test-helper';

describe('defTool Integration Tests', () => {
  const modelDisplay = getModelDisplayName(TEST_MODEL);

  it.skipIf(!hasTestModel)(`executes a simple tool (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defTool with ${modelDisplay} ===`);

    let toolWasCalled = false;
    let toolArgs: any = null;

    const { result } = await runPrompt(async ({ defTool, $ }) => {
      defTool('calculate', 'Add two numbers',
        z.object({ a: z.number(), b: z.number() }),
        async (args) => {
          toolWasCalled = true;
          toolArgs = args;
          return { sum: args.a + args.b };
        }
      );

      $`Add 15 and 27 using the calculate tool. Return just the result number.`;
    }, {
      model: TEST_MODEL
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);
    console.log(`  > Tool was called: ${toolWasCalled}`);
    console.log(`  > Tool args:`, toolArgs);

    expect(toolWasCalled).toBe(true);
    expect(text).toMatch(/\b42\b/);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`executes a composite tool (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing composite defTool with ${modelDisplay} ===`);

    let addCalls = 0;
    let multiplyCalls = 0;

    const { result } = await runPrompt(async ({ defTool, $ }) => {
      defTool('math', 'Math operations', [
        tool('add', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          async ({ a, b }) => {
            addCalls++;
            return { result: a + b };
          }
        ),
        tool('multiply', 'Multiply two numbers',
          z.object({ a: z.number(), b: z.number() }),
          async ({ a, b }) => {
            multiplyCalls++;
            return { result: a * b };
          }
        )
      ]);

      $`Use the math tool to add 10 and 5, then multiply the result by 2. Return just the final number.`;
    }, {
      model: TEST_MODEL
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);
    console.log(`  > Add calls: ${addCalls}, Multiply calls: ${multiplyCalls}`);

    expect(addCalls).toBeGreaterThan(0);
    expect(multiplyCalls).toBeGreaterThan(0);
    expect(text).toMatch(/\b30\b/);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`handles tool with responseSchema (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defTool with responseSchema with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ defTool, $ }) => {
      defTool('analyze', 'Analyze text',
        z.object({ text: z.string() }),
        async ({ text }) => {
          const words = text.split(/\s+/).length;
          return { wordCount: words, firstChar: text[0] };
        },
        {
          responseSchema: z.object({
            wordCount: z.number(),
            firstChar: z.string()
          })
        }
      );

      $`Analyze the text "hello world" using the analyze tool. Tell me the word count.`;
    }, {
      model: TEST_MODEL
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    expect(text).toMatch(/\b2\b/);
    console.log(`  > Test passed!\n`);
  });
});
