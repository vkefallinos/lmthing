/**
 * LLM Integration Test for defTaskList
 *
 * Tests task list plugin with real LLMs.
 *
 * Running:
 * LM_TEST_MODEL=openai:gpt-4o-mini npm test -- --run tests/integration/defTaskList
 */

import { describe, it, expect } from 'vitest';
import { runPrompt } from '../../src/runPrompt';
import { taskListPlugin } from '../../src/plugins';
import {
  hasTestModel,
  TEST_MODEL,
  TEST_TIMEOUT,
  getModelDisplayName
} from './test-helper';

describe('defTaskList Integration Tests', () => {
  const modelDisplay = getModelDisplayName(TEST_MODEL);

  it.skipIf(!hasTestModel)(`uses defTaskList for task management (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defTaskList with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ defTaskList, defSystem, $ }) => {
      defSystem('role', `You are a project manager. You have access to startTask, completeTask, and failTask tools.
IMPORTANT: Use the task ID (number like "1", "2", "3") NOT the task name when calling tools.
For example: startTask({ taskId: "1" }) not startTask({ taskId: "Set up project" })`);

      const [tasks, setTasks] = defTaskList([
        { id: '1', name: 'Set up project', status: 'pending' },
        { id: '2', name: 'Write tests', status: 'pending' },
        { id: '3', name: 'Deploy', status: 'pending' }
      ]);

      $`Start task ID "1" (Set up project), then complete it. Then start task ID "2" (Write tests). Tell me the current task status.`;
    }, {
      model: TEST_MODEL,
      plugins: [taskListPlugin]
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    expect(text.length).toBeGreaterThan(0);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`completes multiple tasks in sequence (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defTaskList multiple tasks with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ defTaskList, defSystem, $ }) => {
      defSystem('role', `You are a task executor. Use startTask, completeTask, and failTask tools.
IMPORTANT: Always use the task ID (like "1", "2", "3") NEVER the task name.
Example: startTask({ taskId: "1" }) and completeTask({ taskId: "1" })`);

      const [tasks, setTasks] = defTaskList([
        { id: '1', name: 'Task A', status: 'pending' },
        { id: '2', name: 'Task B', status: 'pending' },
        { id: '3', name: 'Task C', status: 'pending' }
      ]);

      $`Complete all three tasks in order by ID. Start task "1", complete it, then task "2", complete it, then task "3", complete it. Tell me when all are done.`;
    }, {
      model: TEST_MODEL,
      plugins: [taskListPlugin]
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    expect(text.length).toBeGreaterThan(0);
    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`handles task failure and recovery (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defTaskList failTask with ${modelDisplay} ===`);

    const { result } = await runPrompt(async ({ defTaskList, defSystem, $ }) => {
      defSystem('role', `You are a project manager. Use startTask, completeTask, and failTask tools.
IMPORTANT: Always use task IDs (numbers like "1", "2") when calling tools.
When a task fails, use failTask with a reason, then you can restart it with startTask.`);

      const [tasks, setTasks] = defTaskList([
        { id: '1', name: 'Download data', status: 'pending' },
        { id: '2', name: 'Process data', status: 'pending' },
        { id: '3', name: 'Upload results', status: 'pending' }
      ]);

      $`Start task "1" (Download data), then fail it with reason "Network timeout". Then restart it and complete it. Tell me what happened.`;
    }, {
      model: TEST_MODEL,
      plugins: [taskListPlugin]
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    expect(text.length).toBeGreaterThan(0);
    console.log(`  > Test passed!\n`);
  });
});
