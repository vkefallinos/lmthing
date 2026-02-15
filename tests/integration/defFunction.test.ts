/**
 * LLM Integration Test for defFunction
 *
 * Tests the defFunction plugin with real LLMs.
 *
 * Required environment variables:
 * - LM_TEST_MODEL: Model to use (e.g., openai:gpt-4o-mini)
 *
 * Running:
 * LM_TEST_MODEL=openai:gpt-4o-mini npm test -- --run tests/integration/defFunction
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { runPrompt } from '../../src/runPrompt';
import { functionPlugin } from '../../src/plugins/function';
import {
  hasTestModel,
  TEST_MODEL,
  TEST_TIMEOUT,
  getModelDisplayName
} from './test-helper';

describe('defFunction Integration Tests', () => {
  const modelDisplay = getModelDisplayName(TEST_MODEL);

  it.skipIf(!hasTestModel)(`executes a function via TypeScript code (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defFunction with ${modelDisplay} ===`);

    const { result, prompt } = await runPrompt(async ({ defFunction, defSystem, $ }) => {
      defSystem('role', 'You are a helpful assistant. Use the runToolCode tool to execute TypeScript code. To call the calculate function, use: calculate({ a: 5, b: 3 })');

      defFunction('calculate', 'Add two numbers',
        z.object({ a: z.number(), b: z.number() }),
        async ({ a, b }) => {
          console.log(`  > calculate({ a: ${a}, b: ${b} }) called`);
          return { sum: a + b };
        },
        { responseSchema: z.object({ sum: z.number() }) }
      );

      $`Add 15 and 27 using the calculate function. Use: calculate({ a: 15, b: 27 }). Return just the result number.`;
    }, {
      model: TEST_MODEL,
      plugins: [functionPlugin]
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    // Check for the answer
    const hasAnswer = text.includes('42') || text.toLowerCase().includes('forty');
    expect(hasAnswer).toBe(true);

    // Verify the function was called
    const steps = (prompt as any).steps || [];
    let foundToolCall = false;
    for (const step of steps) {
      if (step.input?.prompt) {
        for (const message of step.input.prompt) {
          if (message.role === 'tool' && message.content) {
            for (const content of message.content) {
              if (content.type === 'tool-result' && content.toolName === 'runToolCode') {
                foundToolCall = true;
                break;
              }
            }
          }
        }
      }
    }
    expect(foundToolCall).toBe(true);
    console.log(`  > Test passed!\n`);
  });
});
