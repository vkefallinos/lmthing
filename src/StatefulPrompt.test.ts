import { describe, it, expect } from 'vitest';
import { createMockModel } from './test/createMockModel';
import { runPrompt } from './runPrompt';
import { StatefulPrompt } from './StatefulPrompt';
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
});