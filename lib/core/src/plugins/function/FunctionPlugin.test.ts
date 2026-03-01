import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { runPrompt } from '../../runPrompt';
import { functionPlugin, func, funcAgent } from './index';
import { createMockModel } from '../../test/createMockModel';

type RunToolCodeResult = {
  success: boolean;
  message?: string;
  result?: unknown;
  errors?: unknown[];
  error?: string;
};

function getRunToolCodeResults(prompt: { steps?: any[] }): RunToolCodeResult[] {
  const results: RunToolCodeResult[] = [];
  const steps = prompt.steps || [];

  for (const step of steps) {
    if (!step.input?.prompt) continue;
    for (const message of step.input.prompt) {
      if (message.role !== 'tool' || !message.content) continue;
      for (const content of message.content) {
        if (content.type === 'tool-result' && content.toolName === 'runToolCode') {
          results.push(content.output.value);
        }
      }
    }
  }

  return results;
}

describe('FunctionPlugin', () => {
  describe('defFunction - single functions', () => {
    it('should register a function and generate system prompt', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello!' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          async ({ a, b }) => ({ sum: a + b }),
          { responseSchema: z.object({ sum: z.number() }) }
        );

        $`Use the calculate function`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      // Check that system prompt includes function description
      const systems = (prompt as any).systems;
      expect(systems['available_functions']).toBeDefined();
      const functionsPrompt = systems['available_functions'];
      expect(functionsPrompt).toContain('calculate');
      expect(functionsPrompt).toContain('Add two numbers');

      // Snapshot the system prompt
      expect(functionsPrompt).toMatchSnapshot('single-function-system-prompt');

      // Snapshot the tools structure
      const tools = (prompt as any)._tools;
      expect(tools.runToolCode).toBeDefined();
      expect(Object.keys(tools)).toMatchSnapshot('single-function-tools');
    });

    it('should throw error if responseSchema is missing', async () => {
      await expect(async () => {
        await runPrompt(async ({ defFunction }) => {
          (defFunction as any)('calculate', 'Add numbers',
            z.object({ a: z.number() }),
            async ({ a }) => ({ result: a }),
            {} // Missing responseSchema
          );
        }, {
          model: createMockModel([{ type: 'text', text: 'test' }]) as any,
          plugins: [functionPlugin]
        });
      }).rejects.toThrow('responseSchema');
    });

    it('should throw error if options are missing', async () => {
      await expect(async () => {
        await runPrompt(async ({ defFunction }) => {
          (defFunction as any)('calculate', 'Add numbers',
            z.object({ a: z.number() }),
            async ({ a }) => ({ result: a })
            // Missing options parameter
          );
        }, {
          model: createMockModel([{ type: 'text', text: 'test' }]) as any,
          plugins: [functionPlugin]
        });
      }).rejects.toThrow('options');
    });
  });

  describe('defFunction - composite functions', () => {
    it('should register composite functions', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello!' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('math', 'Math operations', [
          func('add', 'Add numbers',
            z.object({ a: z.number(), b: z.number() }),
            async ({ a, b }) => ({ result: a + b }),
            { responseSchema: z.object({ result: z.number() }) }
          ),
          func('multiply', 'Multiply numbers',
            z.object({ a: z.number(), b: z.number() }),
            async ({ a, b }) => ({ result: a * b }),
            { responseSchema: z.object({ result: z.number() }) }
          )
        ]);

        $`Use math operations`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      // Check that system prompt includes both sub-functions
      const systems = (prompt as any).systems;
      const functionsPrompt = systems['available_functions'];
      expect(functionsPrompt).toContain('math.add');
      expect(functionsPrompt).toContain('math.multiply');

      // Snapshot the system prompt for composite functions
      expect(functionsPrompt).toMatchSnapshot('composite-function-system-prompt');

      // Snapshot the tools structure
      const tools = (prompt as any)._tools;
      expect(Object.keys(tools)).toMatchSnapshot('composite-function-tools');
    });

    it('should throw error if composite sub-function missing responseSchema', async () => {
      await expect(async () => {
        await runPrompt(async ({ defFunction }) => {
          defFunction('math', 'Math operations', [
            func('add', 'Add numbers',
              z.object({ a: z.number() }),
              async ({ a }) => ({ result: a }),
              {} as any // Missing responseSchema
            )
          ]);
        }, {
          model: createMockModel([{ type: 'text', text: 'test' }]) as any,
          plugins: [functionPlugin]
        });
      }).rejects.toThrow('responseSchema');
    });
  });

  describe('TypeScript validation', () => {
    it('should validate correct TypeScript code', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Let me calculate...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await calculate({ a: 5, b: 3 });\nreturn result.sum;' }
        },
        { type: 'text', text: 'The sum is 8' }
      ]);

      const { result } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          async ({ a, b }) => ({ sum: a + b }),
          { responseSchema: z.object({ sum: z.number() }) }
        );

        $`Calculate 5 + 3`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      const text = await result.text;
      expect(text).toContain('8');
    });

    it('should reject invalid TypeScript code with wrong property names', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Let me try...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await calculate({ x: 5, y: 3 });' } // Wrong property names
        },
        { type: 'text', text: 'Error occurred' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          async ({ a, b }) => ({ sum: a + b }),
          { responseSchema: z.object({ sum: z.number() }) }
        );

        $`Calculate 5 + 3`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      // Snapshot the complete steps to verify TypeScript validation error flow
      const steps = (prompt as any).steps;
      expect(steps).toBeDefined();
      expect(steps.length).toBeGreaterThan(0);

      // Look through all steps to find tool result
      let toolResult: any = null;
      for (const step of steps) {
        if (step.input?.prompt) {
          for (const message of step.input.prompt) {
            if (message.role === 'tool' && message.content) {
              for (const content of message.content) {
                if (content.type === 'tool-result' && content.toolName === 'runToolCode') {
                  toolResult = content;
                  break;
                }
              }
            }
          }
        }
      }

      // Verify we found the tool result
      expect(toolResult).toBeDefined();
      expect(toolResult.output.value.success).toBe(false);
      expect(toolResult.output.value.errors).toBeDefined();
      expect(toolResult.output.value.errors.length).toBeGreaterThan(0);

      // Snapshot the validation errors
      expect(toolResult.output.value.errors).toMatchSnapshot('typescript-wrong-property-names-errors');

      // Snapshot the complete execution steps
      expect(steps).toMatchSnapshot('typescript-validation-failed-wrong-properties-steps');
    });

    it('should reject invalid TypeScript code with wrong types', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Let me try...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await calculate({ a: "5", b: "3" });' } // Wrong types
        },
        { type: 'text', text: 'Error occurred' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          async ({ a, b }) => ({ sum: a + b }),
          { responseSchema: z.object({ sum: z.number() }) }
        );

        $`Calculate 5 + 3`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      // Snapshot the complete steps to verify TypeScript validation error flow
      const steps = (prompt as any).steps;
      expect(steps).toBeDefined();
      expect(steps.length).toBeGreaterThan(0);

      // Look through all steps to find tool result
      let toolResult: any = null;
      for (const step of steps) {
        if (step.input?.prompt) {
          for (const message of step.input.prompt) {
            if (message.role === 'tool' && message.content) {
              for (const content of message.content) {
                if (content.type === 'tool-result' && content.toolName === 'runToolCode') {
                  toolResult = content;
                  break;
                }
              }
            }
          }
        }
      }

      // Verify we found the tool result
      expect(toolResult).toBeDefined();
      expect(toolResult.output.value.success).toBe(false);
      expect(toolResult.output.value.errors).toBeDefined();
      expect(toolResult.output.value.errors.length).toBeGreaterThan(0);

      // Snapshot the validation errors
      expect(toolResult.output.value.errors).toMatchSnapshot('typescript-wrong-types-errors');

      // Snapshot the complete execution steps
      expect(steps).toMatchSnapshot('typescript-validation-failed-wrong-types-steps');
    });

    it('should support type-check correction flow from invalid to corrected code', async () => {
      const addFn = vi.fn(async ({ a, b }) => ({ result: a + b }));

      const invalidModel = createMockModel([
        { type: 'text', text: 'Attempting...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await math.add({ x: 8, y: 2 });\nreturn result.result;' }
        },
        { type: 'text', text: 'Error' }
      ]);

      const { result: invalidResult, prompt: invalidPrompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('math', 'Math operations', [
          func('add', 'Add numbers',
            z.object({ a: z.number(), b: z.number() }),
            addFn,
            { responseSchema: z.object({ result: z.number() }) }
          )
        ]);

        $`Calculate 8 + 2`;
      }, {
        model: invalidModel as any,
        plugins: [functionPlugin]
      });

      await invalidResult.text;
      const invalidResults = getRunToolCodeResults(invalidPrompt);
      expect(invalidResults.some((result) => result.success === false)).toBe(true);
      expect(invalidResults.some((result) => result.message === 'TypeScript validation failed. Fix the errors and try again.')).toBe(true);
      expect(addFn).not.toHaveBeenCalled();

      const validModel = createMockModel([
        { type: 'text', text: 'Retrying...' },
        {
          type: 'tool-call',
          toolCallId: 'call_2',
          toolName: 'runToolCode',
          args: { code: 'const result = await math.add({ a: 8, b: 2 });\nreturn result.result;' }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result: validResult, prompt: validPrompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('math', 'Math operations', [
          func('add', 'Add numbers',
            z.object({ a: z.number(), b: z.number() }),
            addFn,
            { responseSchema: z.object({ result: z.number() }) }
          )
        ]);

        $`Calculate 8 + 2`;
      }, {
        model: validModel as any,
        plugins: [functionPlugin]
      });

      await validResult.text;
      const validResults = getRunToolCodeResults(validPrompt);
      expect(validResults.some((result) => result.success === true && result.result === 10)).toBe(true);
      expect(addFn).toHaveBeenCalledTimes(1);
      expect(addFn).toHaveBeenCalledWith({ a: 8, b: 2 });
    });
  });

  describe('Sandbox execution', () => {
    it('should execute valid code successfully', async () => {
      const calculateFn = vi.fn(async ({ a, b }) => ({ sum: a + b }));

      const mockModel = createMockModel([
        { type: 'text', text: 'Calculating...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await calculate({ a: 10, b: 5 });\nreturn result.sum;' }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          calculateFn,
          { responseSchema: z.object({ sum: z.number() }) }
        );

        $`Calculate 10 + 5`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;
      expect(calculateFn).toHaveBeenCalledWith({ a: 10, b: 5 });

      // Snapshot the execution steps
      const steps = (prompt as any).steps;
      expect(steps).toMatchSnapshot('successful-execution-steps');
    });

    it('should handle composite functions in sandbox', async () => {
      const addFn = vi.fn(async ({ a, b }) => ({ result: a + b }));
      const multiplyFn = vi.fn(async ({ a, b }) => ({ result: a * b }));

      const mockModel = createMockModel([
        { type: 'text', text: 'Calculating...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: {
            code: `
              const sum = await math.add({ a: 5, b: 3 });
              const product = await math.multiply({ a: sum.result, b: 2 });
              return product.result;
            `
          }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('math', 'Math operations', [
          func('add', 'Add numbers',
            z.object({ a: z.number(), b: z.number() }),
            addFn,
            { responseSchema: z.object({ result: z.number() }) }
          ),
          func('multiply', 'Multiply numbers',
            z.object({ a: z.number(), b: z.number() }),
            multiplyFn,
            { responseSchema: z.object({ result: z.number() }) }
          )
        ]);

        $`Calculate (5 + 3) * 2`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;
      expect(addFn).toHaveBeenCalledWith({ a: 5, b: 3 });
      expect(multiplyFn).toHaveBeenCalledWith({ a: 8, b: 2 });

      // Snapshot the execution steps for composite functions
      const steps = (prompt as any).steps;
      expect(steps).toMatchSnapshot('composite-function-execution-steps');
    });

    it('should enforce response schema for function outputs', async () => {
      const executeFn = vi.fn(async ({ a, b }) => ({ total: a + b }));

      const mockModel = createMockModel([
        { type: 'text', text: 'Calculating...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await calculate({ a: 10, b: 5 });\nreturn result;' }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          executeFn as any,
          { responseSchema: z.object({ sum: z.number() }) }
        );

        $`Calculate 10 + 5`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      const runToolCodeResults = getRunToolCodeResults(prompt);
      expect(runToolCodeResults).toHaveLength(1);
      expect(runToolCodeResults[0].success).toBe(false);
      expect(runToolCodeResults[0].message).toBe('Runtime error during execution.');
    });
  });

  describe('Callbacks', () => {
    it('should execute beforeCall callback', async () => {
      const beforeCallFn = vi.fn(async (input) => undefined);
      const executeFn = vi.fn(async ({ a, b }) => ({ sum: a + b }));

      const mockModel = createMockModel([
        { type: 'text', text: 'Calculating...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await calculate({ a: 5, b: 3 });\nreturn result.sum;' }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          executeFn,
          {
            responseSchema: z.object({ sum: z.number() }),
            beforeCall: beforeCallFn
          }
        );

        $`Calculate 5 + 3`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;
      expect(beforeCallFn).toHaveBeenCalledWith({ a: 5, b: 3 }, undefined);
    });

    it('should execute onSuccess callback', async () => {
      const onSuccessFn = vi.fn(async (input, output) => undefined);
      const executeFn = vi.fn(async ({ a, b }) => ({ sum: a + b }));

      const mockModel = createMockModel([
        { type: 'text', text: 'Calculating...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await calculate({ a: 5, b: 3 });\nreturn result.sum;' }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          executeFn,
          {
            responseSchema: z.object({ sum: z.number() }),
            onSuccess: onSuccessFn
          }
        );

        $`Calculate 5 + 3`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;
      expect(onSuccessFn).toHaveBeenCalledWith({ a: 5, b: 3 }, { sum: 8 });
    });

    it('should execute onError callback on validation errors', async () => {
      const onErrorFn = vi.fn(async (input, error) => undefined);
      const executeFn = vi.fn(async (_args: { a: number; b: number }) => {
        throw new Error('Execution failed');
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calculating...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await calculate({ a: 5, b: 3 });\nreturn result;' }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          executeFn,
          {
            responseSchema: z.object({ sum: z.number() }),
            onError: onErrorFn
          }
        );

        $`Calculate something`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;
      expect(onErrorFn).toHaveBeenCalledTimes(1);
      expect(onErrorFn).toHaveBeenCalledWith(
        { a: 5, b: 3 },
        expect.objectContaining({ message: 'Execution failed' })
      );
      const runToolCodeResults = getRunToolCodeResults(prompt);
      expect(runToolCodeResults[0].success).toBe(false);
      expect(runToolCodeResults[0].message).toBe('Runtime error during execution.');
    });

    it('should allow beforeCall to short-circuit execution', async () => {
      const beforeCallFn = vi.fn(async (input) => ({ sum: 999 })); // Return value to skip execution
      const executeFn = vi.fn(async ({ a, b }) => ({ sum: a + b }));

      const mockModel = createMockModel([
        { type: 'text', text: 'Calculating...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await calculate({ a: 5, b: 3 });\nreturn result.sum;' }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          executeFn,
          {
            responseSchema: z.object({ sum: z.number() }),
            beforeCall: beforeCallFn
          }
        );

        $`Calculate 5 + 3`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;
      expect(beforeCallFn).toHaveBeenCalled();
      expect(executeFn).not.toHaveBeenCalled(); // Should be skipped
    });
  });

  describe('Security', () => {
    it('should block require calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Trying...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const fs = require("fs");' }
        },
        { type: 'text', text: 'Error' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('test', 'Test function',
          z.object({}),
          async () => ({ result: 'ok' }),
          { responseSchema: z.object({ result: z.string() }) }
        );

        $`Try something`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;
      const runToolCodeResults = getRunToolCodeResults(prompt);
      expect(runToolCodeResults).toHaveLength(1);
      expect(runToolCodeResults[0].success).toBe(false);
    });

    it('should block eval calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Trying...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'eval("console.log(\'test\')");' }
        },
        { type: 'text', text: 'Error' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, $ }) => {
        defFunction('test', 'Test function',
          z.object({}),
          async () => ({ result: 'ok' }),
          { responseSchema: z.object({ result: z.string() }) }
        );

        $`Try something`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;
      const runToolCodeResults = getRunToolCodeResults(prompt);
      expect(runToolCodeResults).toHaveLength(1);
      const firstResult = runToolCodeResults[0];
      expect(firstResult.success).toBe(false);
      expect(firstResult.message).toBe('Runtime error during execution.');
    });
  });

  describe('defFunctionAgent - single agents', () => {
    it('should register an agent and generate system prompt', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello!' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunctionAgent, $ }) => {
        defFunctionAgent('analyzer', 'Analyze data',
          z.object({ data: z.string() }),
          async ({ data }, childPrompt) => {
            childPrompt.$`Analyze: ${data}`;
          },
          {
            responseSchema: z.object({ summary: z.string(), score: z.number() })
          }
        );

        $`Use the analyzer agent`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      // Check that system prompt includes agent description
      const systems = (prompt as any).systems;
      expect(systems['available_functions']).toBeDefined();
      const functionsPrompt = systems['available_functions'];
      expect(functionsPrompt).toContain('analyzer');
      expect(functionsPrompt).toContain('(agent)');
      expect(functionsPrompt).toContain('Analyze data');

      // Snapshot the system prompt
      expect(functionsPrompt).toMatchSnapshot('single-agent-system-prompt');
    });

    it('should throw error if responseSchema is missing', async () => {
      await expect(async () => {
        await runPrompt(async ({ defFunctionAgent }) => {
          (defFunctionAgent as any)('analyzer', 'Analyze data',
            z.object({ data: z.string() }),
            async ({ data }, prompt) => {},
            {} // Missing responseSchema
          );
        }, {
          model: createMockModel([{ type: 'text', text: 'test' }]) as any,
          plugins: [functionPlugin]
        });
      }).rejects.toThrow('responseSchema');
    });

    it('should throw error if options are missing', async () => {
      await expect(async () => {
        await runPrompt(async ({ defFunctionAgent }) => {
          (defFunctionAgent as any)('analyzer', 'Analyze data',
            z.object({ data: z.string() }),
            async ({ data }, prompt) => {}
            // Missing options parameter
          );
        }, {
          model: createMockModel([{ type: 'text', text: 'test' }]) as any,
          plugins: [functionPlugin]
        });
      }).rejects.toThrow('options');
    });

    it('should execute agent and validate response schema', async () => {
      const childMockModel = createMockModel([
        { type: 'text', text: '{"summary": "Test summary", "score": 85}' }
      ]);

      const mockModel = createMockModel([
        { type: 'text', text: 'Analyzing...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: {
            code: 'const result = await analyzer({ data: "test data" });\nreturn result;'
          }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunctionAgent, $ }) => {
        defFunctionAgent('analyzer', 'Analyze data',
          z.object({ data: z.string() }),
          async ({ data }, childPrompt) => {
            childPrompt.$`Analyze this data: ${data}`;
          },
          {
            responseSchema: z.object({ summary: z.string(), score: z.number() }),
            model: childMockModel as any
          }
        );

        $`Analyze test data`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      const toolResults = getRunToolCodeResults(prompt as any);
      expect(toolResults).toHaveLength(1);
      expect(toolResults[0].output.value).toEqual({
        success: true,
        result: { summary: 'Test summary', score: 85 }
      });
    });

    it('should propagate schema validation failures as runtime tool errors', async () => {
      const childMockModel = createMockModel([
        { type: 'text', text: '{"summary": 123, "score": "oops"}' }
      ]);

      const mockModel = createMockModel([
        { type: 'text', text: 'Analyzing...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: {
            code: 'const result = await analyzer({ data: "test data" });\nreturn result;'
          }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunctionAgent, $ }) => {
        defFunctionAgent('analyzer', 'Analyze data',
          z.object({ data: z.string() }),
          async ({ data }, childPrompt) => {
            childPrompt.$`Analyze this data: ${data}`;
          },
          {
            responseSchema: z.object({ summary: z.string(), score: z.number() }),
            model: childMockModel as any
          }
        );

        $`Analyze test data`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      const toolResults = getRunToolCodeResults(prompt as any);
      expect(toolResults).toHaveLength(1);
      expect(toolResults[0].output.value.success).toBe(false);
      expect(toolResults[0].output.value.error).toContain('Agent response validation failed');
      expect(toolResults[0].output.value.message).toBe('Runtime error during execution.');
    });

    it('should keep error metadata stable across re-executions', async () => {
      const childMockModel = createMockModel([
        { type: 'text', text: '{"summary": 123, "score": "oops"}' },
        { type: 'text', text: '{"summary": 456, "score": "bad"}' }
      ]);

      const mockModel = createMockModel([
        { type: 'text', text: 'First try...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'await analyzer({ data: "first" });\nreturn "first";' }
        },
        { type: 'text', text: 'Second try...' },
        {
          type: 'tool-call',
          toolCallId: 'call_2',
          toolName: 'runToolCode',
          args: { code: 'await analyzer({ data: "second" });\nreturn "second";' }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunctionAgent, $ }) => {
        defFunctionAgent('analyzer', 'Analyze data',
          z.object({ data: z.string() }),
          async ({ data }, childPrompt) => {
            childPrompt.$`Analyze this data: ${data}`;
          },
          {
            responseSchema: z.object({ summary: z.string(), score: z.number() }),
            model: childMockModel as any
          }
        );

        $`Analyze test data`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      const toolResults = getRunToolCodeResults(prompt as any).filter(
        (content: any) => content.output?.value?.success === false
      );
      expect(toolResults.length).toBeGreaterThanOrEqual(2);
      const firstFailure = toolResults[toolResults.length - 2];
      const secondFailure = toolResults[toolResults.length - 1];
      expect(firstFailure.output.value).toMatchObject({
        success: false,
        message: 'Runtime error during execution.'
      });
      expect(secondFailure.output.value).toMatchObject({
        success: false,
        message: 'Runtime error during execution.'
      });
      expect(Object.keys(firstFailure.output.value).sort()).toEqual(
        Object.keys(secondFailure.output.value).sort()
      );
      expect(firstFailure.output.value.error).toContain('Agent response validation failed');
      expect(secondFailure.output.value.error).toContain('Agent response validation failed');
    });

    it('should type-check function-agent return shape before sandbox execution', async () => {
      const childMockModel = createMockModel([
        { type: 'text', text: '{"summary": "ok", "score": 99}' }
      ]);

      const mockModel = createMockModel([
        { type: 'text', text: 'Analyzing...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: {
            code: 'const result = await analyzer({ data: "test data" });\nreturn result.nonexistent;'
          }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunctionAgent, $ }) => {
        defFunctionAgent('analyzer', 'Analyze data',
          z.object({ data: z.string() }),
          async ({ data }, childPrompt) => {
            childPrompt.$`Analyze this data: ${data}`;
          },
          {
            responseSchema: z.object({ summary: z.string(), score: z.number() }),
            model: childMockModel as any
          }
        );

        $`Analyze test data`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      const toolResults = getRunToolCodeResults(prompt as any);
      expect(toolResults).toHaveLength(1);
      expect(toolResults[0].output.value.success).toBe(false);
      expect(toolResults[0].output.value.errors[0].message).toContain('nonexistent');
      expect(childMockModel.steps()).toHaveLength(0);
    });
  });

  describe('defFunctionAgent - composite agents', () => {
    it('should register composite agents', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello!' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunctionAgent, $ }) => {
        defFunctionAgent('specialists', 'Specialist agents', [
          funcAgent('researcher', 'Research topics',
            z.object({ topic: z.string() }),
            async ({ topic }, childPrompt) => {
              childPrompt.$`Research: ${topic}`;
            },
            { responseSchema: z.object({ findings: z.array(z.string()) }) }
          ),
          funcAgent('analyst', 'Analyze data',
            z.object({ data: z.string() }),
            async ({ data }, childPrompt) => {
              childPrompt.$`Analyze: ${data}`;
            },
            { responseSchema: z.object({ summary: z.string(), score: z.number() }) }
          )
        ]);

        $`Use specialist agents`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      // Check that system prompt includes composite agent description
      const systems = (prompt as any).systems;
      expect(systems['available_functions']).toBeDefined();
      const functionsPrompt = systems['available_functions'];
      expect(functionsPrompt).toContain('specialists');
      expect(functionsPrompt).toContain('researcher');
      expect(functionsPrompt).toContain('(agent)');
      expect(functionsPrompt).toContain('analyst');

      // Snapshot the system prompt
      expect(functionsPrompt).toMatchSnapshot('composite-agent-system-prompt');
    });

    it('should throw error if sub-agent is missing responseSchema', async () => {
      await expect(async () => {
        await runPrompt(async ({ defFunctionAgent }) => {
          defFunctionAgent('specialists', 'Specialist agents', [
            (funcAgent as any)('researcher', 'Research topics',
              z.object({ topic: z.string() }),
              async ({ topic }, prompt) => {},
              {} // Missing responseSchema
            )
          ]);
        }, {
          model: createMockModel([{ type: 'text', text: 'test' }]) as any,
          plugins: [functionPlugin]
        });
      }).rejects.toThrow('responseSchema');
    });

    it('should execute composite function-agent namespaces with per-agent options', async () => {
      const tracePlugin = {
        defTrace(this: any, label: string) {
          this.defSystem('trace', `trace:${label}`);
        }
      };

      const researcherExecute = vi.fn(async ({ topic }, childPrompt) => {
        expect((childPrompt as any)._plugins).toEqual([tracePlugin]);
        (childPrompt as any)._boundPluginMethods.defTrace('research');
        childPrompt.$`Research: ${topic}`;
      });
      const analystExecute = vi.fn(async ({ data }, childPrompt) => {
        expect((childPrompt as any)._plugins).toEqual([tracePlugin]);
        (childPrompt as any)._boundPluginMethods.defTrace('analysis');
        childPrompt.$`Analyze: ${data}`;
      });

      const researcherModel = createMockModel([
        { type: 'text', text: '{"findings": ["fact-1", "fact-2"]}' }
      ]);
      const analystModel = createMockModel([
        { type: 'text', text: '{"summary": "Looks good", "score": 91}' }
      ]);

      const mockModel = createMockModel([
        { type: 'text', text: 'Working...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: {
            code: `
              const research = await specialists.researcher({ topic: "AI" });
              const analysis = await specialists.analyst({ data: "AI findings" });
              return { research, analysis };
            `
          }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunctionAgent, $ }) => {
        defFunctionAgent('specialists', 'Specialist agents', [
          funcAgent('researcher', 'Research topics',
            z.object({ topic: z.string() }),
            researcherExecute,
            {
              responseSchema: z.object({ findings: z.array(z.string()) }),
              model: researcherModel as any,
              system: 'Research system prompt',
              plugins: [tracePlugin]
            }
          ),
          funcAgent('analyst', 'Analyze data',
            z.object({ data: z.string() }),
            analystExecute,
            {
              responseSchema: z.object({ summary: z.string(), score: z.number() }),
              model: analystModel as any,
              system: 'Analysis system prompt',
              plugins: [tracePlugin]
            }
          )
        ]);

        $`Use specialist agents`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      expect(researcherExecute).toHaveBeenCalledWith({ topic: 'AI' }, expect.anything());
      expect(analystExecute).toHaveBeenCalledWith({ data: 'AI findings' }, expect.anything());

      const toolResults = getRunToolCodeResults(prompt as any);
      expect(toolResults).toHaveLength(1);
      expect(toolResults[0].output.value).toEqual({
        success: true,
        result: {
          research: { findings: ['fact-1', 'fact-2'] },
          analysis: { summary: 'Looks good', score: 91 }
        }
      });

      const researcherStep = researcherModel.steps()[0];
      const researcherSystem = researcherStep.prompt?.find((message: any) => message.role === 'system');
      expect(researcherSystem).toBeDefined();
      const researcherSystemText = getMessageText(researcherSystem?.content);
      expect(researcherSystemText).toContain('Research system prompt');
      expect(researcherSystemText).toContain('valid JSON');
      expect(researcherSystemText).toContain('trace:research');

      const analystStep = analystModel.steps()[0];
      const analystSystem = analystStep.prompt?.find((message: any) => message.role === 'system');
      expect(analystSystem).toBeDefined();
      const analystSystemText = getMessageText(analystSystem?.content);
      expect(analystSystemText).toContain('Analysis system prompt');
      expect(analystSystemText).toContain('valid JSON');
      expect(analystSystemText).toContain('trace:analysis');
    });
  });

  describe('defFunctionAgent - callbacks', () => {
    it('should execute beforeCall callback', async () => {
      const beforeCallFn = vi.fn(async (input) => undefined);
      const childMockModel = createMockModel([
        { type: 'text', text: '{"summary": "Test", "score": 90}' }
      ]);

      const mockModel = createMockModel([
        { type: 'text', text: 'Analyzing...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await analyzer({ data: "test" });\nreturn result;' }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunctionAgent, $ }) => {
        defFunctionAgent('analyzer', 'Analyze data',
          z.object({ data: z.string() }),
          async ({ data }, childPrompt) => {
            childPrompt.$`Analyze: ${data}`;
          },
          {
            responseSchema: z.object({ summary: z.string(), score: z.number() }),
            beforeCall: beforeCallFn,
            model: childMockModel as any
          }
        );

        $`Analyze test`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;
      expect(beforeCallFn).toHaveBeenCalledWith({ data: 'test' }, undefined);

      // Snapshot the execution steps
      const steps = (prompt as any).steps;
      expect(steps).toMatchSnapshot('agent-beforeCall-callback-steps');
    });

    it('should allow beforeCall to short-circuit execution', async () => {
      const beforeCallFn = vi.fn(async (input) => ({ summary: 'Cached', score: 100 }));
      const executeFn = vi.fn(async ({ data }, prompt) => {
        prompt.$`Analyze: ${data}`;
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Analyzing...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await analyzer({ data: "test" });\nreturn result;' }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunctionAgent, $ }) => {
        defFunctionAgent('analyzer', 'Analyze data',
          z.object({ data: z.string() }),
          executeFn,
          {
            responseSchema: z.object({ summary: z.string(), score: z.number() }),
            beforeCall: beforeCallFn
          }
        );

        $`Analyze test`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;
      expect(beforeCallFn).toHaveBeenCalled();
      expect(executeFn).not.toHaveBeenCalled(); // Should be skipped

      // Snapshot the execution steps for short-circuit behavior
      const steps = (prompt as any).steps;
      expect(steps).toMatchSnapshot('agent-beforeCall-shortcircuit-steps');
    });
  });

  describe('defFunction + defFunctionAgent - mixed usage', () => {
    it('should allow functions and agents to work together in the same registry', async () => {
      const calculateFn = vi.fn(async ({ a, b }) => ({ sum: a + b }));
      const childMockModel = createMockModel([
        { type: 'text', text: '{"analysis": "Numbers are positive", "recommendation": "Use addition"}' }
      ]);

      const mockModel = createMockModel([
        { type: 'text', text: 'Let me analyze and calculate...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: {
            code: `
              const analysis = await analyzer({ data: "5 and 3" });
              const result = await calculate({ a: 5, b: 3 });
              return { analysis, result };
            `
          }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defFunction, defFunctionAgent, $ }) => {
        // Register a regular function
        defFunction('calculate', 'Add two numbers',
          z.object({ a: z.number(), b: z.number() }),
          calculateFn,
          { responseSchema: z.object({ sum: z.number() }) }
        );

        // Register an agent
        defFunctionAgent('analyzer', 'Analyze data',
          z.object({ data: z.string() }),
          async ({ data }, childPrompt) => {
            childPrompt.$`Analyze: ${data}`;
          },
          {
            responseSchema: z.object({
              analysis: z.string(),
              recommendation: z.string()
            }),
            model: childMockModel as any
          }
        );

        $`Use both the analyzer and calculator`;
      }, {
        model: mockModel as any,
        plugins: [functionPlugin]
      });

      await result.text;

      // Verify both were called
      expect(calculateFn).toHaveBeenCalledWith({ a: 5, b: 3 });

      // Check system prompt includes both
      const systems = (prompt as any).systems;
      const functionsPrompt = systems['available_functions'];
      expect(functionsPrompt).toContain('calculate');
      expect(functionsPrompt).toContain('analyzer (agent)');

      // Snapshot the execution steps
      const steps = (prompt as any).steps;
      expect(steps).toMatchSnapshot('mixed-function-agent-execution-steps');
    });
  });
});
