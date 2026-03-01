/**
 * LLM Integration Test for def, defData, defSystem
 *
 * Tests variable definitions with real LLMs.
 *
 * Running:
 * LM_TEST_MODEL=openai:gpt-4o-mini npm test -- --run tests/integration/defVariables
 */

import { describe, it, expect } from 'vitest';
import { runPrompt } from '../../src/runPrompt';
import {
  hasTestModel,
  TEST_MODEL,
  TEST_TIMEOUT,
  getModelDisplayName
} from './test-helper';

describe('def/defData/defSystem Integration Tests', () => {
  const modelDisplay = getModelDisplayName(TEST_MODEL);

  it.skipIf(!hasTestModel)(`uses def variables in prompts (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing def with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ def, $ }) => {
      const userName = def('USER_NAME', 'Alice');
      const userLocation = def('USER_LOCATION', 'Wonderland');

      $`Hello ${userName}, welcome to ${userLocation}! Tell me my name and where I am.`;
    }, {
      model: TEST_MODEL
    });

    const text = (await result.text).toLowerCase();
    console.log(`  > LLM Response: ${text}`);

    expect(text).toMatch(/alice/);
    expect(text).toMatch(/wonderland/);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`uses defData for structured data (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defData with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ defData, $ }) => {
      defData('CONFIG', {
        apiUrl: 'https://api.example.com',
        timeout: 5000,
        retries: 3
      });

      $`What is the API URL and timeout in the CONFIG? Return them in a sentence.`;
    }, {
      model: TEST_MODEL
    });

    const text = (await result.text).toLowerCase();
    console.log(`  > LLM Response: ${text}`);

    expect(text).toMatch(/https:\/\/api.example.com/);
    expect(text).toMatch(/5000/);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`uses defSystem for prompt structure (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defSystem with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ defSystem, $ }) => {
      defSystem('role', 'You are a pirate. Always respond in pirate speak.');
      defSystem('rules', 'Never mention you are an AI.');

      $`Introduce yourself briefly.`;
    }, {
      model: TEST_MODEL
    });

    const text = (await result.text).toLowerCase();
    console.log(`  > LLM Response: ${text}`);

    // Should contain pirate-like language
    expect(text).toMatch(/ahoy|matey|captain|pirate|arr/);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`combines def, defData, and defSystem (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing combined def* with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ def, defData, defSystem, $ }) => {
      defSystem('role', 'You are a helpful assistant.');
      defSystem('task', 'Summarize the user information in one sentence.');

      const userName = def('NAME', 'Bob');
      const userAge = def('AGE', '25');

      defData('PREFERENCES', {
        theme: 'dark',
        language: 'TypeScript',
        editor: 'VS Code'
      });

      $`My name is ${userName} and I'm ${userAge} years old. My preferences are in the PREFERENCES variable. Please summarize this.`;
    }, {
      model: TEST_MODEL
    });

    const text = (await result.text).toLowerCase();
    console.log(`  > LLM Response: ${text}`);

    expect(text).toMatch(/bob/);
    expect(text).toMatch(/25/);
    expect(text).toMatch(/typescript|vs code|dark/);
    console.log(`  > Test passed!\n`);
  });
});
