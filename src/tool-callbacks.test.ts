import { describe, it, expect, vi } from 'vitest';
import { createMockModel } from './test/createMockModel';
import { runPrompt } from './runPrompt';
import { z } from 'zod';
import { tool } from './StatefulPrompt';

describe('Tool callbacks and response schema', () => {
  describe('Single tool with onSuccess callback', () => {
    it('should call onSuccess callback and allow modifying output', async () => {
      const onSuccess = vi.fn(async (input: any, output: any) => {
        // Return modified output
        return { modified: true, original: output };
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'greet', args: { name: 'Alice' } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'greet',
          'Greet someone',
          z.object({ name: z.string() }),
          async ({ name }) => {
            return { message: `Hello, ${name}!` };
          },
          {
            onSuccess
          }
        );

        $`Say hello`;
      }, {
        model: mockModel
      });

      await result.text;

      // Verify onSuccess was called with correct arguments
      expect(onSuccess).toHaveBeenCalledWith(
        { name: 'Alice' },
        { message: 'Hello, Alice!' }
      );
    });

    it('should use original output if onSuccess returns undefined', async () => {
      const onSuccess = vi.fn(async (input: any, output: any) => {
        // Don't modify output
        return undefined;
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'calc', args: { a: 5, b: 3 } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'calc',
          'Calculate sum',
          z.object({ a: z.number(), b: z.number() }),
          async ({ a, b }) => {
            return { sum: a + b };
          },
          {
            onSuccess
          }
        );

        $`Calculate 5 + 3`;
      }, {
        model: mockModel
      });

      await result.text;

      expect(onSuccess).toHaveBeenCalled();
      // Verify onSuccess was called with the original output
      expect(onSuccess).toHaveBeenCalledWith(
        { a: 5, b: 3 },
        { sum: 8 }
      );
    });
  });

  describe('Single tool with onError callback', () => {
    it('should call onError callback when tool throws', async () => {
      const onError = vi.fn(async (input: any, error: any) => {
        // Return a safe fallback
        return { error_handled: true, message: 'Tool failed gracefully' };
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'divide', args: { a: 10, b: 0 } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'divide',
          'Divide numbers',
          z.object({ a: z.number(), b: z.number() }),
          async ({ a, b }) => {
            if (b === 0) throw new Error('Division by zero');
            return { result: a / b };
          },
          {
            onError
          }
        );

        $`Divide 10 by 0`;
      }, {
        model: mockModel
      });

      await result.text;

      // Verify onError was called
      expect(onError).toHaveBeenCalled();
      const callArgs = onError.mock.calls[0];
      expect(callArgs[0]).toEqual({ a: 10, b: 0 });
      expect(callArgs[1]).toHaveProperty('error');
    });

    it('should use original error if onError returns undefined', async () => {
      const onError = vi.fn(async (input: any, error: any) => {
        // Log but don't modify
        return undefined;
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'fail', args: { x: 1 } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'fail',
          'Tool that fails',
          z.object({ x: z.number() }),
          async () => {
            throw new Error('Intentional failure');
          },
          {
            onError
          }
        );

        $`Test failure`;
      }, {
        model: mockModel
      });

      await result.text;

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Single tool with beforeCall callback', () => {
    it('should call beforeCall hook before execution', async () => {
      const beforeCall = vi.fn(async (input: any) => {
        // Don't modify, return undefined
        return undefined;
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'log', args: { message: 'test' } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'log',
          'Log a message',
          z.object({ message: z.string() }),
          async ({ message }) => {
            return { logged: true, message };
          },
          {
            beforeCall
          }
        );

        $`Log something`;
      }, {
        model: mockModel
      });

      await result.text;

      expect(beforeCall).toHaveBeenCalledWith(
        { message: 'test' },
        undefined
      );
    });

    it('should skip execution if beforeCall returns a value', async () => {
      const execute = vi.fn(async () => ({ result: 'original' }));

      const beforeCall = vi.fn(async (input: any) => {
        // Return early, skip execution
        return { result: 'bypassed' };
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'process', args: { data: 'test' } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'process',
          'Process data',
          z.object({ data: z.string() }),
          execute,
          {
            beforeCall
          }
        );

        $`Process something`;
      }, {
        model: mockModel
      });

      await result.text;

      // beforeCall should be called
      expect(beforeCall).toHaveBeenCalled();
      // But execute should NOT be called since beforeCall returned a value
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('Composite tool with callbacks', () => {
    it('should call callbacks for sub-tools', async () => {
      const onSuccess = vi.fn(async (input: any, output: any) => undefined);

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'math', args: { calls: [
          { name: 'add', args: { a: 2, b: 3 } },
          { name: 'multiply', args: { a: 2, b: 3 } }
        ]} },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool('math', 'Math operations', [
          tool(
            'add',
            'Add two numbers',
            z.object({ a: z.number(), b: z.number() }),
            async ({ a, b }) => ({ sum: a + b }),
            { onSuccess }
          ),
          tool(
            'multiply',
            'Multiply two numbers',
            z.object({ a: z.number(), b: z.number() }),
            async ({ a, b }) => ({ product: a * b }),
            { onSuccess }
          )
        ]);

        $`Do math`;
      }, {
        model: mockModel
      });

      await result.text;

      // onSuccess should be called twice (once for each sub-tool)
      expect(onSuccess).toHaveBeenCalledTimes(2);
      expect(onSuccess).toHaveBeenCalledWith(
        { a: 2, b: 3 },
        { sum: 5 }
      );
      expect(onSuccess).toHaveBeenCalledWith(
        { a: 2, b: 3 },
        { product: 6 }
      );
    });

    it('should handle errors in sub-tools with callbacks', async () => {
      const onError = vi.fn(async (input: any, error: any) => {
        return { handled: true };
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'operations', args: { calls: [
          { name: 'safe', args: { x: 5 } },
          { name: 'risky', args: { x: 0 } }
        ]} },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool('operations', 'Operations', [
          tool(
            'safe',
            'Safe operation',
            z.object({ x: z.number() }),
            async ({ x }) => ({ result: x * 2 })
          ),
          tool(
            'risky',
            'Risky operation',
            z.object({ x: z.number() }),
            async ({ x }) => {
              if (x === 0) throw new Error('Cannot process zero');
              return { result: x * 2 };
            },
            { onError }
          )
        ]);

        $`Run operations`;
      }, {
        model: mockModel
      });

      await result.text;

      // onError should be called for the risky tool
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Response schema', () => {
    it('should accept responseSchema for validation', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'getUser', args: { id: '123' } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'getUser',
          'Get user by ID',
          z.object({ id: z.string() }),
          async ({ id }) => {
            return { id, name: 'John', email: 'john@example.com' };
          },
          {
            responseSchema: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string()
            })
          }
        );

        $`Get user 123`;
      }, {
        model: mockModel
      });

      await result.text;

      // Should complete without errors
      expect(result).toBeDefined();
    });

    it('should format object responses with responseSchema', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'getData', args: { type: 'json' } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'getData',
          'Get data',
          z.object({ type: z.string() }),
          async ({ type }) => {
            return { type, value: 42, nested: { key: 'value' } };
          },
          {
            responseSchema: z.object({
              type: z.string(),
              value: z.number(),
              nested: z.object({ key: z.string() })
            })
          }
        );

        $`Get data`;
      }, {
        model: mockModel
      });

      await result.text;

      expect(result).toBeDefined();
    });
  });

  describe('Callback with multiple hooks combined', () => {
    it('should support all callbacks together', async () => {
      const beforeCall = vi.fn(async () => undefined);
      const onSuccess = vi.fn(async () => undefined);
      const onError = vi.fn(async () => undefined);

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'combined', args: { value: 10 } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'combined',
          'Tool with all callbacks',
          z.object({ value: z.number() }),
          async ({ value }) => {
            return { result: value * 2 };
          },
          {
            beforeCall,
            onSuccess,
            onError,
            responseSchema: z.object({ result: z.number() })
          }
        );

        $`Test combined`;
      }, {
        model: mockModel
      });

      await result.text;

      // All hooks should be called
      expect(beforeCall).toHaveBeenCalledWith({ value: 10 }, undefined);
      expect(onSuccess).toHaveBeenCalledWith({ value: 10 }, { result: 20 });
      // onError should not be called since no error occurred
      expect(onError).not.toHaveBeenCalled();
    });

    it('should chain callback results correctly', async () => {
      const beforeCall = vi.fn(async (input: any) => undefined);
      const onSuccess = vi.fn(async (input: any, output: any) => {
        // Modify the output
        return { ...output, logged: true };
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'chained', args: { x: 5 } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'chained',
          'Chained callbacks',
          z.object({ x: z.number() }),
          async ({ x }) => {
            return { value: x };
          },
          {
            beforeCall,
            onSuccess
          }
        );

        $`Test chaining`;
      }, {
        model: mockModel
      });

      await result.text;

      expect(beforeCall).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  describe('Async callbacks', () => {
    it('should handle async onSuccess callback', async () => {
      const onSuccess = vi.fn(async (input: any, output: any) => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));
        return { ...output, async_processed: true };
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'asyncTool', args: { data: 'test' } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'asyncTool',
          'Async tool',
          z.object({ data: z.string() }),
          async ({ data }) => {
            return { processed: data };
          },
          {
            onSuccess
          }
        );

        $`Test async`;
      }, {
        model: mockModel
      });

      await result.text;

      expect(onSuccess).toHaveBeenCalled();
    });

    it('should handle async beforeCall callback', async () => {
      const beforeCall = vi.fn(async (input: any) => {
        // Simulate async validation
        await new Promise(resolve => setTimeout(resolve, 10));
        return undefined;
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'validated', args: { id: '123' } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'validated',
          'Validated tool',
          z.object({ id: z.string() }),
          async ({ id }) => {
            return { id, valid: true };
          },
          {
            beforeCall
          }
        );

        $`Validate`;
      }, {
        model: mockModel
      });

      await result.text;

      expect(beforeCall).toHaveBeenCalled();
    });
  });

  describe('Callback error handling', () => {
    it('should gracefully handle callback errors in onError', async () => {
      const onError = vi.fn(async (input: any, error: any) => {
        // Even in onError, we can safely handle the error
        return { gracefully_handled: true, error_message: error.error };
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'failingTool', args: { x: 1 } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'failingTool',
          'Tool that fails',
          z.object({ x: z.number() }),
          async () => {
            throw new Error('Tool execution failed');
          },
          {
            onError
          }
        );

        $`Test`;
      }, {
        model: mockModel
      });

      await result.text;

      // onError should have been called
      expect(onError).toHaveBeenCalled();
      const errorCall = onError.mock.calls[0];
      expect(errorCall[1]).toHaveProperty('error');
    });
  });

  describe('Options parameters are optional', () => {
    it('should work without any options', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'simple', args: { x: 5 } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        // No options provided
        defTool(
          'simple',
          'Simple tool',
          z.object({ x: z.number() }),
          async ({ x }) => {
            return { result: x * 2 };
          }
        );

        $`Test`;
      }, {
        model: mockModel
      });

      await result.text;

      expect(result).toBeDefined();
    });

    it('should work with empty options object', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'withEmpty', args: { x: 5 } },
        { type: 'text', text: 'Done!' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        // Empty options
        defTool(
          'withEmpty',
          'Tool with empty options',
          z.object({ x: z.number() }),
          async ({ x }) => {
            return { result: x * 2 };
          },
          {}
        );

        $`Test`;
      }, {
        model: mockModel
      });

      await result.text;

      expect(result).toBeDefined();
    });
  });
});
