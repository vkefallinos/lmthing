/**
 * LLM Integration Test for defTaskGraph (DAG)
 *
 * Tests the task graph plugin with real LLMs.
 * Validates that the task graph state is correct after execution.
 *
 * Running:
 * LM_TEST_MODEL=openai:gpt-4o-mini npm test -- --run tests/integration/defTaskGraph
 */

import { describe, it, expect } from 'vitest';
import { runPrompt } from '../../src/runPrompt';
import { taskGraphPlugin } from '../../src/plugins';
import type { TaskNode } from '../../src/plugins/types';
import {
  hasTestModel,
  TEST_MODEL,
  TEST_TIMEOUT,
  getModelDisplayName
} from './test-helper';

describe('defTaskGraph Integration Tests', () => {
  const modelDisplay = getModelDisplayName(TEST_MODEL);

  it.skipIf(!hasTestModel)(`executes a linear dependency chain (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defTaskGraph linear chain with ${modelDisplay} ===`);

    const { result, prompt } = await runPrompt(async ({ defTaskGraph, defSystem, $ }) => {
      defSystem('role', `You are a task executor. You have access to updateTaskStatus and getUnblockedTasks tools.
IMPORTANT: Use task IDs (like "research", "write", "review") when calling updateTaskStatus.
First set a task to "in_progress", then to "completed" with an output_result.
Execute tasks in dependency order: research first, then write, then review.`);

      const [graph, setGraph] = defTaskGraph([
        { id: 'research', title: 'Research', description: 'Gather information',
          status: 'pending', dependencies: [], unblocks: ['write'],
          required_capabilities: ['research'] },
        { id: 'write', title: 'Write Report', description: 'Write the report based on research',
          status: 'pending', dependencies: ['research'], unblocks: ['review'],
          required_capabilities: ['writing'] },
        { id: 'review', title: 'Review', description: 'Review the final report',
          status: 'pending', dependencies: ['write'], unblocks: [],
          required_capabilities: ['review'] },
      ]);

      $`Execute all tasks in order. Start with "research" (set to in_progress, then completed), then "write", then "review". Complete all three tasks. Tell me when all tasks are done.`;
    }, {
      model: TEST_MODEL,
      plugins: [taskGraphPlugin]
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    // Verify response is non-empty
    expect(text.length).toBeGreaterThan(0);

    // Verify final task graph state: all tasks should be completed
    const finalGraph = prompt.getState<TaskNode[]>('taskGraph');
    console.log(`  > Final graph state: ${finalGraph?.map(t => `${t.id}=${t.status}`).join(', ')}`);
    expect(finalGraph).toBeDefined();
    expect(finalGraph?.every(t => t.status === 'completed')).toBe(true);

    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`discovers unblocked tasks in a DAG (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defTaskGraph getUnblockedTasks with ${modelDisplay} ===`);

    const { result, prompt } = await runPrompt(async ({ defTaskGraph, defSystem, $ }) => {
      defSystem('role', `You are a project manager. You have access to getUnblockedTasks and updateTaskStatus tools.
Use getUnblockedTasks to discover which tasks are ready, then execute them.
Use task IDs like "setup" and "deploy" when calling updateTaskStatus.`);

      const [graph, setGraph] = defTaskGraph([
        { id: 'setup', title: 'Setup Environment', description: 'Set up the project environment',
          status: 'pending', dependencies: [], unblocks: ['deploy'],
          required_capabilities: ['devops'] },
        { id: 'deploy', title: 'Deploy', description: 'Deploy the application',
          status: 'pending', dependencies: ['setup'], unblocks: [],
          required_capabilities: ['devops'] },
      ]);

      $`First use getUnblockedTasks to find which tasks are ready. Then start and complete the "setup" task. Then check getUnblockedTasks again to see what's unblocked now. Tell me what happened.`;
    }, {
      model: TEST_MODEL,
      plugins: [taskGraphPlugin]
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    // Verify response is non-empty
    expect(text.length).toBeGreaterThan(0);

    // Verify the setup task was completed
    const finalGraph = prompt.getState<TaskNode[]>('taskGraph');
    console.log(`  > Final graph state: ${finalGraph?.map(t => `${t.id}=${t.status}`).join(', ')}`);
    expect(finalGraph).toBeDefined();
    const setupTask = finalGraph!.find(t => t.id === 'setup');
    expect(setupTask?.status).toBe('completed');

    console.log(`  > Test passed!\n`);
  });

  it.skipIf(!hasTestModel)(`handles dependency-blocked task correctly (${modelDisplay})`, { timeout: TEST_TIMEOUT }, async () => {
    console.log(`\n=== Testing defTaskGraph dependency blocking with ${modelDisplay} ===`);

    const { result, prompt } = await runPrompt(async ({ defTaskGraph, defSystem, $ }) => {
      defSystem('role', `You are a task executor. You have access to updateTaskStatus and getUnblockedTasks tools.
Use task IDs like "data" and "analysis" when calling updateTaskStatus.
When a task cannot be started due to unmet dependencies, the tool will tell you.`);

      const [graph, setGraph] = defTaskGraph([
        { id: 'data', title: 'Collect Data', description: 'Collect raw data',
          status: 'pending', dependencies: [], unblocks: ['analysis'],
          required_capabilities: ['data'] },
        { id: 'analysis', title: 'Analyze Data', description: 'Analyze the collected data',
          status: 'pending', dependencies: ['data'], unblocks: [],
          required_capabilities: ['analysis'] },
      ]);

      $`Try to start "analysis" first (it should be blocked). Then start and complete "data". Then start and complete "analysis". Report what happened at each step.`;
    }, {
      model: TEST_MODEL,
      plugins: [taskGraphPlugin]
    });

    const text = await result.text;
    console.log(`  > LLM Response: ${text}`);

    // Verify response is non-empty
    expect(text.length).toBeGreaterThan(0);

    // Verify final task graph state: both tasks should be completed
    const finalGraph = prompt.getState<TaskNode[]>('taskGraph');
    console.log(`  > Final graph state: ${finalGraph?.map(t => `${t.id}=${t.status}`).join(', ')}`);
    expect(finalGraph).toBeDefined();
    expect(finalGraph?.every(t => t.status === 'completed')).toBe(true);

    // Verify context propagation: analysis should have input_context from data
    const analysisTask = finalGraph?.find(t => t.id === 'analysis');
    console.log(`  > Analysis input_context: ${analysisTask?.input_context}`);
    expect(analysisTask?.input_context).toBeDefined();
    expect(analysisTask?.input_context).toContain('Collect Data');

    console.log(`  > Test passed!\n`);
  });
});
