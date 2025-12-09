import { describe, it, expect } from 'vitest';
import { createMockModel } from './test/createMockModel';
import { runPrompt } from './runPrompt';
import { StatefulPrompt, tool, agent } from './StatefulPrompt';
import { z } from 'zod';

describe('StatefulPrompt', () => {
  const mockModel = createMockModel([
    { type: 'text', text: 'Hello' },
    { type: 'text', text: ' World' }
  ]);

  it('should create state with defState', async () => {
    let getState: any;
    let setState: any;

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      [getState, setState] = defState('test', 'initial');
      $`Hello!`;
    }, {
      model: mockModel,
      
    });

    await result.text;

    expect(getState).toBeDefined();
    expect(setState).toBeDefined();
    expect(prompt).toBeInstanceOf(StatefulPrompt);

    // Capture snapshot of the prompt state
    expect(prompt.steps).toMatchSnapshot();
  });

  it('should maintain state across re-executions', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'First response' },
      { type: 'tool-call', toolCallId: '1', toolName: 'testTool', args: { value: 1 } },
      { type: 'text', text: 'Second response' }
    ]);

    let stateValue: any;

    const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
      const [state, setState] = defState('counter', 0);
      stateValue = state;

      defTool('testTool', 'Test tool',
        z.object({ value: z.number() }),
        async ({ value }) => {
          setState(state + value);
          return { success: true, newCount: state + value };
        }
      );

      $`Current count: ${state}`;
    }, {
      model: mockModel,
      
    });

    await result.text;

    // Verify state was tracked
    expect(stateValue).toBeDefined();

    // Capture snapshot showing tool usage and state changes
    expect(prompt.steps).toMatchSnapshot();
  });

  it('should run effects with dependencies', async () => {
    let effectRunCount = 0;
    let lastDependency: any;
    let capturedSteps: any[] = [];

    const { result, prompt } = await runPrompt(async ({ defState, defEffect, $ }) => {
      const [state, setState] = defState('value', 0);

      defEffect((prompt) => {
        effectRunCount++;
        lastDependency = state;
        capturedSteps.push({
          stepNumber: prompt.stepNumber,
          stateValue: state,
          runCount: effectRunCount
        });
      }, [state]);

      $`Starting with value: ${state}`;

      // Change state to trigger effect
      setTimeout(() => setState(1), 10);
    }, {
      model: mockModel,
      
    });

    await result.text;

    expect(effectRunCount).toBeGreaterThan(0);

    // Capture snapshot of effect execution
    expect({
      steps: prompt.steps,
      effectRuns: capturedSteps,
      finalDependency: lastDependency
    }).toMatchSnapshot();
  });

  it('should run effects without dependencies on every step', async () => {
    let runCount = 0;
    let stepNumbers: number[] = [];

    const { result, prompt } = await runPrompt(async ({ defEffect, $ }) => {
      defEffect((prompt) => {
        runCount++;
        stepNumbers.push(prompt.stepNumber);
      });

      $`Test message`;
    }, {
      model: mockModel,
      
    });

    await result.text;

    expect(runCount).toBeGreaterThan(0);

    // Capture snapshot showing effect ran on multiple steps
    expect({
      steps: prompt.steps,
      runCount,
      stepNumbers
    }).toMatchSnapshot();
  });

  it('should provide prompt context to effects', async () => {
    let capturedContext: any;

    const { result, prompt } = await runPrompt(async ({ defEffect, $ }) => {
      defEffect((prompt) => {
        capturedContext = prompt;
      });

      $`Test message`;
    }, {
      model: mockModel,
      
    });

    await result.text;

    expect(capturedContext).toBeDefined();
    expect(capturedContext.messages).toBeDefined();
    expect(capturedContext.stepNumber).toBeDefined();
    expect(capturedContext.tools).toBeDefined();
    expect(capturedContext.systems).toBeDefined();
    expect(capturedContext.variables).toBeDefined();

    // Capture snapshot of the context structure
    expect({
      hasMessages: Array.isArray(capturedContext.messages),
      stepNumber: capturedContext.stepNumber,
      hasTools: typeof capturedContext.tools.has === 'function',
      hasSystems: typeof capturedContext.systems.has === 'function',
      hasVariables: typeof capturedContext.variables.has === 'function',
      lastTool: capturedContext.lastTool
    }).toMatchSnapshot();
  });

  it('should allow step modifications from effects', async () => {
    let stepModifierCalled = false;
    let modifiedAspect: any;
    let modifiedItems: any;

    const { result, prompt } = await runPrompt(async ({ defEffect, $ }) => {
      defEffect((prompt, step) => {
        stepModifierCalled = true;
        step('messages', [{ role: 'system', content: 'Modified message' }]);
        modifiedAspect = 'messages';
        modifiedItems = [{ role: 'system', content: 'Modified message' }];
      });

      $`Original message`;
    }, {
      model: mockModel,
    });

    await result.text;

    expect(stepModifierCalled).toBe(true);
    expect(modifiedAspect).toBe('messages');
    expect(modifiedItems).toEqual([{ role: 'system', content: 'Modified message' }]);

    // Capture snapshot showing step modifications
    expect({
      steps: prompt.steps,
      stepModifierCalled,
      modifiedAspect,
      modifiedItems
    }).toMatchSnapshot();
  });

  it('should demonstrate all StatefulPrompt features with comprehensive state management', async () => {
    // Create a 10-message mock model that exercises all features
    const mockModel = createMockModel([
      // Step 1: Initial response
      { type: 'text', text: 'I\'ll help you manage your project tasks. ' },

      // Step 2: Call single tool to add a task
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'taskManager',
        args: { action: 'add', task: 'Design UI mockups' }
      },
      { type: 'text', text: 'Task added! ' },

      // Step 3: Call composite tool (file operations)
      {
        type: 'tool-call',
        toolCallId: 'call_2',
        toolName: 'fileOps',
        args: {
          calls: [
            { name: 'write', args: { path: 'tasks.txt', content: 'Design UI mockups\n' } },
            { name: 'read', args: { path: 'tasks.txt' } }
          ]
        }
      },
      { type: 'text', text: 'Saved tasks to file. ' },

      // Step 4: Call single agent to analyze progress
      {
        type: 'tool-call',
        toolCallId: 'call_3',
        toolName: 'analyst',
        args: { data: 'Task completion: 1/5' }
      },
      { type: 'text', text: 'Analysis complete. ' },

      // Step 5: Call composite agent (specialists)
      {
        type: 'tool-call',
        toolCallId: 'call_4',
        toolName: 'specialists',
        args: {
          calls: [
            { name: 'researcher', args: { topic: 'UI trends 2025' } },
            { name: 'designer', args: { brief: 'Modern dashboard' } }
          ]
        }
      },
      { type: 'text', text: 'Specialist insights gathered. Project is on track!' }
    ]);

    // Track state changes and effect executions
    let stateHistory: any[] = [];
    let effectExecutions: any[] = [];
    let hookExecutions: any[] = [];

    const { result, prompt } = await runPrompt(async (context) => {
      const { defState, defEffect, defSystem, def, defData, defTool, defAgent, defHook, $ } = context;

      // 1. defSystem - Multiple system prompts
      defSystem('role', 'You are a project management AI assistant.');
      defSystem('capabilities', 'You can manage tasks, analyze progress, and coordinate specialists.');
      defSystem('guidelines', 'Always confirm actions and provide status updates.');

      // 2. def - Simple variables
      const projectName = def('PROJECT_NAME', 'Next-Gen Dashboard');
      const deadline = def('DEADLINE', '2025-12-31');

      // 3. defData - Structured data
      const teamData = defData('TEAM', {
        members: ['Alice', 'Bob', 'Charlie'],
        roles: { Alice: 'Designer', Bob: 'Developer', Charlie: 'QA' },
        capacity: { weekly_hours: 120, utilization: 0.75 }
      });

      // 4. defState - State that persists across re-executions
      const [taskCount, setTaskCount] = defState('taskCount', 0);
      const [completedTasks, setCompletedTasks] = defState('completedTasks', 0);
      const [analysisResults, setAnalysisResults] = defState<string[]>('analysisResults', []);

      // Track state for verification
      stateHistory.push({
        step: 'execution',
        taskCount: taskCount.toString(),
        completedTasks: completedTasks.toString(),
        analysisResults: Array.isArray(analysisResults) ? [...analysisResults] : []
      });

      // 5. defEffect - Effect with dependencies that tracks state changes
      defEffect((promptContext, stepModifier) => {
        const execution = {
          stepNumber: promptContext.stepNumber,
          taskCount: taskCount.toString(),
          completedTasks: completedTasks.toString(),
          hasTools: promptContext.tools.has('taskManager')
        };
        effectExecutions.push(execution);

        // Modify step to add a system message about current progress
        if (promptContext.stepNumber > 0) {
          stepModifier('messages', [{
            role: 'system',
            content: `Progress update: ${completedTasks}/${taskCount} tasks completed`
          }]);
        }
      }, [taskCount, completedTasks]);

      // 6. defEffect - Effect without dependencies (runs every step)
      defEffect((promptContext) => {
        effectExecutions.push({
          type: 'always-run',
          stepNumber: promptContext.stepNumber,
          messageCount: promptContext.messages.length
        });
      });

      // 7. defTool - Single tool
      defTool(
        'taskManager',
        'Manage project tasks',
        z.object({
          action: z.enum(['add', 'complete', 'list']),
          task: z.string().optional()
        }),
        async ({ action, task }) => {
          if (action === 'add' && task) {
            setTaskCount(Number(taskCount) + 1);
            return { success: true, taskCount: Number(taskCount) + 1, message: `Added: ${task}` };
          }
          if (action === 'complete') {
            setCompletedTasks(Number(completedTasks) + 1);
            return { success: true, completedTasks: Number(completedTasks) + 1 };
          }
          return { tasks: [`Task 1`, `Task 2`] };
        }
      );

      // 8. defTool - Composite tool (array syntax)
      defTool('fileOps', 'File operations', [
        tool('write', 'Write to file',
          z.object({ path: z.string(), content: z.string() }),
          async ({ path, content }) => ({ success: true, written: content.length })
        ),
        tool('read', 'Read file',
          z.object({ path: z.string() }),
          async ({ path }) => ({ content: `Mock content from ${path}` })
        ),
        tool('append', 'Append to file',
          z.object({ path: z.string(), content: z.string() }),
          async ({ path, content }) => ({ success: true, appended: content.length })
        )
      ]);

      // 9. defAgent - Single agent
      defAgent(
        'analyst',
        'Analyze project data',
        z.object({ data: z.string() }),
        async ({ data }, childPrompt) => {
          childPrompt.defSystem('role', 'You are a data analyst.');
          childPrompt.$`Analyze: ${data}`;

          // Update state based on analysis
          setAnalysisResults([...analysisResults, `Analyzed: ${data}`]);
        }
      );

      // 10. defAgent - Composite agent (array syntax)
      defAgent('specialists', 'Team of specialist agents', [
        agent('researcher', 'Research topics',
          z.object({ topic: z.string() }),
          async ({ topic }, childPrompt) => {
            childPrompt.defSystem('role', 'You are a research specialist.');
            childPrompt.$`Research: ${topic}`;
          }
        ),
        agent('designer', 'Design solutions',
          z.object({ brief: z.string() }),
          async ({ brief }, childPrompt) => {
            childPrompt.defSystem('role', 'You are a design specialist.');
            childPrompt.$`Design: ${brief}`;
          }
        )
      ]);

      // 11. defHook - Filter systems and variables by step
      defHook(({ stepNumber, systems, variables, tools }) => {
        const execution = {
          stepNumber,
          availableSystems: systems,
          availableVariables: variables,
          availableTools: tools
        };
        hookExecutions.push(execution);

        // Filter based on step number
        if (stepNumber === 0) {
          // First step: include all systems
          return {
            activeSystems: systems,
            activeVariables: variables
          };
        } else if (stepNumber === 1) {
          // Second step: limit systems
          return {
            activeSystems: systems.filter(s => s === 'role' || s === 'capabilities'),
            activeVariables: variables.filter(v => v.startsWith('PROJECT'))
          };
        } else {
          // Later steps: include everything
          return {
            activeSystems: systems,
            activeVariables: variables
          };
        }
      });

      // 12. $ - Template literal for user message
      $`Hello! I need help managing ${projectName} with team: ${teamData}. Deadline: ${deadline}.`;

    }, {
      model: mockModel,
    });

    await result.text;

    // Verify prompt is StatefulPrompt
    expect(prompt).toBeInstanceOf(StatefulPrompt);

    // Verify state tracking occurred
    expect(stateHistory.length).toBeGreaterThan(0);
    expect(effectExecutions.length).toBeGreaterThan(0);
    expect(hookExecutions.length).toBeGreaterThan(0);

    // Create comprehensive snapshot
    expect({
      // Step execution history
      steps: prompt.steps,

      // Full step details with raw chunks
      fullSteps: prompt.fullSteps,

      // State change tracking
      stateHistory,

      // Effect execution tracking
      effectExecutions,

      // Hook execution tracking
      hookExecutions,

      // Final state
      finalState: {
        variables: prompt.variables,
        systems: prompt.systems,
        messageCount: prompt.steps.length
      }
    }).toMatchSnapshot();
  });
});