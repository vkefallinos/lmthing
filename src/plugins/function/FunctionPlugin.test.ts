import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { runPrompt } from '../../runPrompt';
import { functionPlugin, func } from './index';
import { createMockModel } from '../../test/createMockModel';

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

      await result.text;
      // Validation should fail before execution
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

      await result.text;
      // Validation should fail before execution
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

      const { result } = await runPrompt(async ({ defFunction, $ }) => {
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

      const { result } = await runPrompt(async ({ defFunction, $ }) => {
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
      const executeFn = vi.fn(async ({ a, b }) => ({ sum: a + b }));

      const mockModel = createMockModel([
        { type: 'text', text: 'Calculating...' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'runToolCode',
          args: { code: 'const result = await calculate({ a: "invalid", b: 3 });' } // Invalid input
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defFunction, $ }) => {
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
      // onError should be called due to validation failure
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

      const { result } = await runPrompt(async ({ defFunction, $ }) => {
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
      // Should fail due to security restrictions
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

      const { result } = await runPrompt(async ({ defFunction, $ }) => {
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
      // Should fail due to security restrictions
    });
  });
});
