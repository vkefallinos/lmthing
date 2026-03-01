/**
 * LLM Integration Test for defState, defEffect
 *
 * Tests StatefulPrompt hooks with real LLMs.
 *
 * Running:
 * LM_TEST_MODEL=openai:gpt-4o-mini npm test -- --run tests/integration/defHooks
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { runPrompt } from '../../src/runPrompt';
import {
  hasTestModel,
  TEST_MODEL,
  TEST_TIMEOUT,
  getModelDisplayName
} from './test-helper';

describe('defState/defEffect Integration Tests', () => {
  const modelDisplay = getModelDisplayName(TEST_MODEL);

  it.skipIf(!hasTestModel)(`uses defState for state management (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defState with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ defState, defTool, $ }) => {
      const [count, setCount] = defState('counter', 0);

      defTool('increment', 'Increment counter',
        z.object({}),
        async () => {
          setCount((prev: number) => prev + 1);
          return { newCount: count.value + 1 };
        }
      );

      $`Increment the counter twice and tell me the final value.`;
    }, {
      model: TEST_MODEL
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    expect(text.length).toBeGreaterThan(0);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`uses defEffect for side effects (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defEffect with ${modelDisplay} ===`);

    let effectRuns = 0;

    const { result } = await runPrompt(async ({ defState, defEffect, defTool, $ }) => {
      const [topic] = defState('topic', 'AI');

      defEffect((ctx) => {
        effectRuns++;
        console.log(`  > Effect run ${effectRuns}, topic: ${topic.value}`);
      });

      defTool('changeTopic', 'Change topic',
        z.object({ newTopic: z.string() }),
        async ({ newTopic }) => {
          return { changed: true };
        }
      );

      $`Change the topic to "machine learning" and then tell me the current topic.`;
    }, {
      model: TEST_MODEL
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);
    console.log(`  > Effect runs: ${effectRuns}`);

    expect(text.length).toBeGreaterThan(0);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`combines defState with defEffect (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defState + defEffect with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ defState, defEffect, defTool, $ }) => {
      const [stepCount, setStepCount] = defState('steps', 0);
      const [history, setHistory] = defState('history', [] as string[]);

      defEffect(() => {
        setHistory((prev: string[]) => [...prev, `Step ${stepCount.value}`]);
      }, [stepCount]);

      defTool('nextStep', 'Go to next step',
        z.object({}),
        async () => {
          setStepCount((prev: number) => prev + 1);
          return { step: stepCount.value + 1 };
        }
      );

      $`Take 2 steps and tell me what step you're on.`;
    }, {
      model: TEST_MODEL
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    expect(text.length).toBeGreaterThan(0);
    console.log(`  > Test passed!\n`);
  });
});
