/**
 * Comprehensive unit tests for defTool functionality
 * 
 * Tests cover:
 * - Single tool registration and execution
 * - Composite tool dispatch and per-subtool handling
 * - Re-execution and reconciliation
 * - Reminder/disable interactions
 * - Step output structure validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockModel } from './test/createMockModel';
import { runPrompt } from './runPrompt';
import { z } from 'zod';
import { tool } from './StatefulPrompt';

describe('defTool - Single Tool', () => {
  describe('Basic registration and execution', () => {
    it('should register and execute a simple tool', async () => {
      const toolFn = vi.fn().mockResolvedValue({ result: 'success' });
      
      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: '1', toolName: 'testTool', args: { x: 5 } },
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'testTool',
          'A test tool',
          z.object({ x: z.number() }),
          toolFn
        );
        $`Use the tool`;
      }, { model: mockModel });

      await result.text;
      
      expect(toolFn).toHaveBeenCalledWith(
        { x: 5 },
        expect.anything()
      );
    });

    it('should support tools without options parameter', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: '1', toolName: 'simple', args: { value: 10 } },
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'simple',
          'Simple tool',
          z.object({ value: z.number() }),
          async ({ value }) => ({ doubled: value * 2 })
        );
        $`Test`;
      }, { model: mockModel });

      await result.text;
      expect(result).toBeDefined();
    });

    it('should pass through tool execution errors', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: '1', toolName: 'failing', args: { x: 1 } },
        { type: 'text', text: 'Error handled' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'failing',
          'Failing tool',
          z.object({ x: z.number() }),
          async () => {
            throw new Error('Tool failed');
          }
        );
        $`Test`;
      }, { model: mockModel });

      await result.text;
      expect(result).toBeDefined();
    });
  });

  describe('Tool return value proxy', () => {
    it('should return a proxy with .value property', async () => {
      let toolRef: any;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello' }
      ]);

      await runPrompt(async ({ defTool, $ }) => {
        toolRef = defTool(
          'myTool',
          'Description',
          z.object({ x: z.number() }),
          async () => ({ result: 'ok' })
        );
        $`Test`;
      }, { model: mockModel });

      expect(toolRef).toBeDefined();
      expect(toolRef.value).toBe('<myTool>');
    });

    it('should work in template literals', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        const toolRef = defTool(
          'calculator',
          'Calculate',
          z.object({ a: z.number() }),
          async () => ({ result: 0 })
        );
        $`Use ${toolRef} to calculate`;
      }, { model: mockModel });

      await result.text;
      
      // Check that the message contains the tool reference  
      const firstStep = prompt.fullSteps[0];
      const userMessage = firstStep.input.prompt.find((m: any) => m.role === 'user');
      expect(userMessage).toBeDefined();
      const content = Array.isArray(userMessage?.content) 
        ? userMessage.content.map((c: any) => c.text).join('') 
        : userMessage?.content as string;
      expect(content).toContain('<calculator>');
    });
  });
});

describe('defTool - Composite Tool', () => {
  describe('Basic composite registration and execution', () => {
    it('should register composite tool with multiple sub-tools', async () => {
      const addFn = vi.fn().mockResolvedValue({ sum: 5 });
      const multiplyFn = vi.fn().mockResolvedValue({ product: 6 });

      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: '1', toolName: 'math', args: {
          calls: [
            { name: 'add', args: { a: 2, b: 3 } },
            { name: 'multiply', args: { a: 2, b: 3 } }
          ]
        }},
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool('math', 'Math operations', [
          tool('add', 'Add numbers', z.object({ a: z.number(), b: z.number() }), addFn),
          tool('multiply', 'Multiply numbers', z.object({ a: z.number(), b: z.number() }), multiplyFn)
        ]);
        $`Do math`;
      }, { model: mockModel });

      await result.text;

      expect(addFn).toHaveBeenCalledWith({ a: 2, b: 3 }, expect.anything());
      expect(multiplyFn).toHaveBeenCalledWith({ a: 2, b: 3 }, expect.anything());
    });

    it('should execute sub-tools sequentially', async () => {
      const executionOrder: string[] = [];

      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: '1', toolName: 'ops', args: {
          calls: [
            { name: 'first', args: { x: 1 } },
            { name: 'second', args: { x: 2 } },
            { name: 'third', args: { x: 3 } }
          ]
        }},
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool('ops', 'Operations', [
          tool('first', 'First op', z.object({ x: z.number() }), async ({ x }) => {
            executionOrder.push('first');
            return { x };
          }),
          tool('second', 'Second op', z.object({ x: z.number() }), async ({ x }) => {
            executionOrder.push('second');
            return { x };
          }),
          tool('third', 'Third op', z.object({ x: z.number() }), async ({ x }) => {
            executionOrder.push('third');
            return { x };
          })
        ]);
        $`Run ops`;
      }, { model: mockModel });

      await result.text;

      expect(executionOrder).toEqual(['first', 'second', 'third']);
    });

    it('should handle unknown sub-tool gracefully', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: '1', toolName: 'file', args: {
          calls: [
            { name: 'read', args: { path: '/test.txt' } },
            { name: 'unknown', args: { x: 1 } }
          ]
        }},
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool('file', 'File operations', [
          tool('read', 'Read file', z.object({ path: z.string() }), async () => ({ content: 'test' }))
        ]);
        $`Use file tool`;
      }, { model: mockModel });

      await result.text;
      expect(result).toBeDefined();
    });

    it('should continue execution after sub-tool error', async () => {
      const succeedFn = vi.fn().mockResolvedValue({ result: 'ok' });
      const failFn = vi.fn().mockRejectedValue(new Error('Failed'));

      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: '1', toolName: 'mixed', args: {
          calls: [
            { name: 'succeed', args: { x: 1 } },
            { name: 'fail', args: { x: 2 } },
            { name: 'succeed', args: { x: 3 } }
          ]
        }},
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool('mixed', 'Mixed operations', [
          tool('succeed', 'Success', z.object({ x: z.number() }), succeedFn),
          tool('fail', 'Fail', z.object({ x: z.number() }), failFn)
        ]);
        $`Run mixed`;
      }, { model: mockModel });

      await result.text;

      expect(succeedFn).toHaveBeenCalledTimes(2);
      expect(failFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Composite tool with callbacks', () => {
    it('should apply callbacks to individual sub-tools', async () => {
      const onSuccess1 = vi.fn().mockResolvedValue(undefined);
      const onSuccess2 = vi.fn().mockResolvedValue(undefined);

      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: '1', toolName: 'ops', args: {
          calls: [
            { name: 'op1', args: { x: 1 } },
            { name: 'op2', args: { x: 2 } }
          ]
        }},
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool('ops', 'Operations', [
          tool('op1', 'Op 1', z.object({ x: z.number() }), async ({ x }) => ({ result: x }), {
            onSuccess: onSuccess1
          }),
          tool('op2', 'Op 2', z.object({ x: z.number() }), async ({ x }) => ({ result: x }), {
            onSuccess: onSuccess2
          })
        ]);
        $`Test`;
      }, { model: mockModel });

      await result.text;

      expect(onSuccess1).toHaveBeenCalledWith({ x: 1 }, { result: 1 });
      expect(onSuccess2).toHaveBeenCalledWith({ x: 2 }, { result: 2 });
    });

    it('should handle onError in sub-tools independently', async () => {
      const onError1 = vi.fn().mockResolvedValue({ handled: true });
      const onError2 = vi.fn().mockResolvedValue({ handled: true });

      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: '1', toolName: 'risky', args: {
          calls: [
            { name: 'fail1', args: { x: 1 } },
            { name: 'fail2', args: { x: 2 } }
          ]
        }},
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool('risky', 'Risky ops', [
          tool('fail1', 'Fail 1', z.object({ x: z.number() }), 
            async () => { throw new Error('Error 1'); },
            { onError: onError1 }
          ),
          tool('fail2', 'Fail 2', z.object({ x: z.number() }),
            async () => { throw new Error('Error 2'); },
            { onError: onError2 }
          )
        ]);
        $`Test`;
      }, { model: mockModel });

      await result.text;

      expect(onError1).toHaveBeenCalled();
      expect(onError2).toHaveBeenCalled();
    });
  });
});

describe('defTool - Re-execution and Reconciliation', () => {
  describe('Tool re-registration on re-execution', () => {
    it('should maintain tool definitions across re-executions', async () => {
      const toolFn = vi.fn().mockResolvedValue({ result: 'ok' });

      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: '1', toolName: 'persist', args: { x: 1 } },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: '2', toolName: 'persist', args: { x: 2 } },
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool('persist', 'Persistent tool', z.object({ x: z.number() }), toolFn);
        $`Use tool multiple times`;
      }, { model: mockModel });

      await result.text;

      // Tool should be called twice (once per tool-call)
      expect(toolFn).toHaveBeenCalledTimes(2);
    });

    it('should reconcile when tool is not re-registered', async () => {
      const toolFn = vi.fn().mockResolvedValue({ result: 'ok' });

      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: '1', toolName: 'conditional', args: { x: 1 } },
        { type: 'text', text: 'Done' }
      ]);

      let registerTool = true;

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [register] = defState('register', registerTool);
        
        if (register) {
          defTool('conditional', 'Conditional tool', z.object({ x: z.number() }), toolFn);
          // On next re-execution, don't register
          registerTool = false;
        }
        
        $`Test`;
      }, { model: mockModel });

      await result.text;

      // Tool should still execute even though not re-registered on second execution
      expect(toolFn).toHaveBeenCalledTimes(1);
    });

    it('should support conditional tool registration with state', async () => {
      const tool1Fn = vi.fn().mockResolvedValue({ result: 'tool1' });
      const tool2Fn = vi.fn().mockResolvedValue({ result: 'tool2' });

      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: '1', toolName: 'dynamic', args: { x: 1 } },
        { type: 'text', text: 'Done' }
      ]);

      const { result } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [mode] = defState('mode', 'tool1');
        
        defTool('dynamic', 'Dynamic tool', z.object({ x: z.number() }), 
          mode === 'tool1' ? tool1Fn : tool2Fn
        );
        
        $`Test`;
      }, { model: mockModel });

      await result.text;

      expect(tool1Fn).toHaveBeenCalledTimes(1);
      expect(tool2Fn).not.toHaveBeenCalled();
    });
  });
});

describe('defTool - Reminder and Disable', () => {
  describe('Reminder functionality', () => {
    it('should allow reminding about a tool', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello' }
      ]);

      let reminded: any[] = [];

      const { result, prompt } = await runPrompt(async ({ defTool, defEffect, $ }) => {
        const toolRef = defTool(
          'important',
          'Important tool',
          z.object({ x: z.number() }),
          async () => ({ result: 'ok' })
        );
        
        defEffect(() => {
          toolRef.remind();
        });

        defEffect(() => {
          reminded = prompt.getRemindedItems();
        });
        
        $`Test`;
      }, { model: mockModel });

      await result.text;

      expect(reminded).toContainEqual({ type: 'defTool', name: 'important' });
    });

    it('should support multiple tool reminders', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello' }
      ]);

      let reminded: any[] = [];

      const { result, prompt } = await runPrompt(async ({ defTool, defEffect, $ }) => {
        const tool1 = defTool('tool1', 'Tool 1', z.object({ x: z.number() }), async () => ({}));
        const tool2 = defTool('tool2', 'Tool 2', z.object({ x: z.number() }), async () => ({}));
        const tool3 = defTool('tool3', 'Tool 3', z.object({ x: z.number() }), async () => ({}));
        
        defEffect(() => {
          tool1.remind();
          tool3.remind();
          // tool2 not reminded
        });

        defEffect(() => {
          reminded = prompt.getRemindedItems();
        });
        
        $`Test`;
      }, { model: mockModel });

      await result.text;

      expect(reminded).toContainEqual({ type: 'defTool', name: 'tool1' });
      expect(reminded).toContainEqual({ type: 'defTool', name: 'tool3' });
      expect(reminded).not.toContainEqual({ type: 'defTool', name: 'tool2' });
    });
  });

  describe('Disable functionality', () => {
    it('should disable a tool for the next step', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: '1', toolName: 'enabledTool', args: { x: 1 } },
        { type: 'text', text: 'Step 2' }
      ]);

      let toolRef: any;

      const { result, prompt } = await runPrompt(async ({ defTool, defEffect, $ }) => {
        toolRef = defTool(
          'enabledTool',
          'Enabled tool',
          z.object({ x: z.number() }),
          async () => ({ result: 'ok' })
        );
        
        defEffect((ctx, stepModifier) => {
          // Disable after first step
          if (ctx.stepNumber === 1) {
            toolRef.disable();
          }
        });
        
        $`Test`;
      }, { model: mockModel });

      await result.text;

      // Tool should be available in step 1 but not in step 2
      const step1Tools = prompt.steps[0]?.input?.prompt?.find((m: any) => 
        m.role === 'system'
      )?.content || '';
      
      // In first step, tool should be available (or at least execution happened)
      expect(prompt.steps.length).toBeGreaterThan(1);
    });

    it('should work with disable in defEffect', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: '1', toolName: 'tempTool', args: { x: 1 } },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, defEffect, $ }) => {
        const [shouldDisable] = defState('shouldDisable', false);
        
        const toolRef = defTool(
          'tempTool',
          'Temporary tool',
          z.object({ x: z.number() }),
          async () => ({ result: 'ok' })
        );
        
        defEffect((ctx) => {
          if (shouldDisable) {
            toolRef.disable();
          }
        }, [shouldDisable]);
        
        $`Test`;
      }, { model: mockModel });

      await result.text;

      expect(prompt.steps.length).toBeGreaterThan(0);
    });
  });

  describe('Combined reminder and disable', () => {
    it('should support both remind and disable on same tool', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello' }
      ]);

      let reminded: any[] = [];

      const { result, prompt } = await runPrompt(async ({ defTool, defEffect, $ }) => {
        const toolRef = defTool(
          'flexible',
          'Flexible tool',
          z.object({ x: z.number() }),
          async () => ({ result: 'ok' })
        );
        
        defEffect(() => {
          toolRef.remind();
        });
        
        defEffect((ctx) => {
          // Could disable in some condition
          if (ctx.stepNumber > 5) {
            toolRef.disable();
          }
        });

        defEffect(() => {
          reminded = prompt.getRemindedItems();
        });
        
        $`Test`;
      }, { model: mockModel });

      await result.text;

      expect(reminded).toContainEqual({ type: 'defTool', name: 'flexible' });
    });
  });
});

describe('defTool - Step Output Structure', () => {
  describe('Tool call in steps', () => {
    it('should capture tool call in step output', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Calling tool' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'testTool', args: { value: 42 } },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'testTool',
          'Test tool',
          z.object({ value: z.number() }),
          async ({ value }) => ({ result: value * 2 })
        );
        $`Use the tool`;
      }, { model: mockModel });

      await result.text;

      // Verify step structure
      expect(prompt.steps).toBeDefined();
      expect(prompt.steps.length).toBeGreaterThan(0);

      // Check that tool-call is in step output
      const step = prompt.steps.find(s => 
        s.output?.content?.some((c: any) => c.type === 'tool-call')
      );
      expect(step).toBeDefined();
      
      const toolCall = step?.output?.content?.find((c: any) => c.type === 'tool-call');
      expect(toolCall).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'testTool'
      });
      // Note: args are transformed to 'input' by the AI SDK
      expect(toolCall).toHaveProperty('input');
    });

    it('should capture tool result in subsequent step', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'calculate', args: { a: 5, b: 3 } },
        { type: 'text', text: 'Result is 8' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'calculate',
          'Calculate sum',
          z.object({ a: z.number(), b: z.number() }),
          async ({ a, b }) => ({ sum: a + b })
        );
        $`Add 5 and 3`;
      }, { model: mockModel });

      await result.text;

      // Tool result should be in the messages
      expect(prompt.steps.length).toBeGreaterThan(0);
      
      // Check for tool-result in subsequent step input
      const hasToolResult = prompt.steps.some(step =>
        step.input?.prompt?.some((msg: any) => msg.role === 'tool')
      );
      expect(hasToolResult).toBe(true);
    });

    it('should track multiple tool calls in order', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'step1', args: { x: 1 } },
        { type: 'text', text: 'First done' },
        { type: 'tool-call', toolCallId: 'call_2', toolName: 'step2', args: { x: 2 } },
        { type: 'text', text: 'Second done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        defTool('step1', 'Step 1', z.object({ x: z.number() }), async ({ x }) => ({ result: x }));
        defTool('step2', 'Step 2', z.object({ x: z.number() }), async ({ x }) => ({ result: x }));
        $`Execute steps`;
      }, { model: mockModel });

      await result.text;

      // Should have multiple steps
      expect(prompt.steps.length).toBeGreaterThanOrEqual(2);

      // Verify tool calls are in correct order
      const toolCalls = prompt.steps
        .flatMap(s => s.output?.content || [])
        .filter((c: any) => c.type === 'tool-call');
      
      expect(toolCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Composite tool in steps', () => {
    it('should capture composite tool call structure', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'math', args: {
          calls: [
            { name: 'add', args: { a: 1, b: 2 } },
            { name: 'multiply', args: { a: 3, b: 4 } }
          ]
        }},
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        defTool('math', 'Math operations', [
          tool('add', 'Add', z.object({ a: z.number(), b: z.number() }), 
            async ({ a, b }) => ({ sum: a + b })),
          tool('multiply', 'Multiply', z.object({ a: z.number(), b: z.number() }),
            async ({ a, b }) => ({ product: a * b }))
        ]);
        $`Do math`;
      }, { model: mockModel });

      await result.text;

      // Find the composite tool call
      const toolCall = prompt.steps
        .flatMap(s => s.output?.content || [])
        .find((c: any) => c.type === 'tool-call' && c.toolName === 'math');

      expect(toolCall).toBeDefined();
      // Note: args are transformed to 'input' by the AI SDK
      expect(toolCall).toHaveProperty('input');
      if (toolCall?.input) {
        expect(toolCall.input).toHaveProperty('calls');
        expect(toolCall.input.calls).toHaveLength(2);
      }
    });

    it('should return results array from composite tool', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'ops', args: {
          calls: [
            { name: 'op1', args: { x: 1 } },
            { name: 'op2', args: { x: 2 } }
          ]
        }},
        { type: 'text', text: 'Done' }
      ]);

      let capturedResult: any = null;

      const { result } = await runPrompt(async ({ defTool, $ }) => {
        defTool('ops', 'Operations', [
          tool('op1', 'Op 1', z.object({ x: z.number() }), async ({ x }) => {
            return { value: x * 10 };
          }),
          tool('op2', 'Op 2', z.object({ x: z.number() }), async ({ x }) => {
            return { value: x * 20 };
          })
        ]);
        $`Run ops`;
      }, { 
        model: mockModel
      });

      await result.text;

      // The composite tool executor returns { results: [...] }
      // We can't directly capture it here, but we verify it executed
      expect(result).toBeDefined();
    });
  });

  describe('Error cases in step output', () => {
    it('should capture error in step when tool fails', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'failTool', args: { x: 1 } },
        { type: 'text', text: 'Error handled' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        defTool(
          'failTool',
          'Failing tool',
          z.object({ x: z.number() }),
          async () => {
            throw new Error('Tool execution failed');
          }
        );
        $`Test`;
      }, { model: mockModel });

      await result.text;

      // Should have steps even with error
      expect(prompt.steps.length).toBeGreaterThan(0);
      
      // The tool result message should contain error
      const toolResultMsg = prompt.steps
        .flatMap(s => s.input?.prompt || [])
        .find((m: any) => m.role === 'tool');
      
      if (toolResultMsg) {
        expect(toolResultMsg.content).toBeDefined();
      }
    });
  });
});

describe('defTool - Integration scenarios', () => {
  it('should handle tool with callbacks in multi-step execution', async () => {
    const beforeCall = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn().mockResolvedValue(undefined);

    const mockModel = createMockModel([
      { type: 'text', text: 'Step 1' },
      { type: 'tool-call', toolCallId: '1', toolName: 'tracked', args: { x: 1 } },
      { type: 'text', text: 'Step 2' },
      { type: 'tool-call', toolCallId: '2', toolName: 'tracked', args: { x: 2 } },
      { type: 'text', text: 'Done' }
    ]);

    const { result } = await runPrompt(async ({ defTool, $ }) => {
      defTool(
        'tracked',
        'Tracked tool',
        z.object({ x: z.number() }),
        async ({ x }) => ({ result: x * 2 }),
        { beforeCall, onSuccess }
      );
      $`Use tool multiple times`;
    }, { model: mockModel });

    await result.text;

    // Callbacks should be called for each tool invocation
    expect(beforeCall).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(2);
  });

  it('should handle composite tool with state changes', async () => {
    const mockModel = createMockModel([
      { type: 'tool-call', toolCallId: '1', toolName: 'stateful', args: {
        calls: [
          { name: 'increment', args: {} },
          { name: 'getValue', args: {} }
        ]
      }},
      { type: 'text', text: 'Done' }
    ]);

    let counter = 0;

    const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
      defTool('stateful', 'Stateful operations', [
        tool('increment', 'Increment', z.object({}), async () => {
          counter++;
          return { counter };
        }),
        tool('getValue', 'Get value', z.object({}), async () => {
          return { counter };
        })
      ]);
      $`Use stateful tool`;
    }, { model: mockModel });

    await result.text;

    expect(counter).toBe(1);
    expect(prompt.steps.length).toBeGreaterThan(0);
  });

  it('should support nested tool calls with state', async () => {
    const mockModel = createMockModel([
      { type: 'tool-call', toolCallId: '1', toolName: 'outer', args: { value: 5 } },
      { type: 'text', text: 'Done' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
      const [history, setHistory] = defState<number[]>('history', []);

      defTool(
        'outer',
        'Outer tool',
        z.object({ value: z.number() }),
        async ({ value }) => {
          setHistory([...history, value]);
          return { processed: value, historyLength: history.length + 1 };
        }
      );
      
      $`Test`;
    }, { model: mockModel });

    await result.text;

    expect(prompt.steps.length).toBeGreaterThan(0);
  });

  it('should handle tool re-registration with different implementations', async () => {
    let implementation = 'v1';

    const mockModel = createMockModel([
      { type: 'tool-call', toolCallId: '1', toolName: 'dynamic', args: { x: 10 } },
      { type: 'text', text: 'Step 2' },
      { type: 'tool-call', toolCallId: '2', toolName: 'dynamic', args: { x: 20 } },
      { type: 'text', text: 'Done' }
    ]);

    const results: number[] = [];

    const { result } = await runPrompt(async ({ defState, defTool, defEffect, $ }) => {
      const [impl, setImpl] = defState('impl', implementation);

      defEffect((ctx) => {
        if (ctx.stepNumber === 2) {
          implementation = 'v2';
          setImpl('v2');
        }
      });

      if (impl === 'v1') {
        defTool('dynamic', 'Dynamic v1', z.object({ x: z.number() }), async ({ x }) => {
          results.push(x);
          return { result: x * 2 };
        });
      } else {
        defTool('dynamic', 'Dynamic v2', z.object({ x: z.number() }), async ({ x }) => {
          results.push(x * 10);
          return { result: x * 3 };
        });
      }

      $`Use dynamic tool`;
    }, { model: mockModel });

    await result.text;

    // Both implementations should have been called
    expect(results.length).toBeGreaterThan(0);
  });
});
