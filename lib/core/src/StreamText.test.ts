import { describe, it, expect, vi } from 'vitest';
import { StreamTextBuilder } from './StreamText';
import { createMockModel } from './test/createMockModel';
import { z } from 'zod';

describe('StreamTextBuilder', () => {
  describe('Integration Test', () => {
    it('should handle all features in a comprehensive workflow', async () => {
      // Setup: Create a mock model with tool calls and text responses
      const mockModel = createMockModel([
        { type: 'text', text: 'Let me help you with that calculation. ' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'calculator',
          args: { operation: 'add', a: 25, b: 17 }
        },
        { type: 'text', text: 'The sum of 25 and 17 is 42. ' },
        {
          type: 'tool-call',
          toolCallId: 'call_2',
          toolName: 'formatter',
          args: { value: 42, format: 'currency' }
        },
        { type: 'text', text: 'Formatted as currency: $42.00' }
      ]);

      // Setup tools
      const calculatorTool = {
        description: 'Performs mathematical operations',
        inputSchema: z.object({
          operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
          a: z.number(),
          b: z.number(),
        }),
        execute: vi.fn().mockImplementation(async ({ operation, a, b }) => {
          const ops: Record<string, (x: number, y: number) => number> = {
            add: (x, y) => x + y,
            subtract: (x, y) => x - y,
            multiply: (x, y) => x * y,
            divide: (x, y) => x / y,
          };
          return { result: ops[operation](a, b) };
        }),
      };

      const formatterTool = {
        description: 'Formats values according to specified format',
        inputSchema: z.object({
          value: z.number(),
          format: z.enum(['currency', 'percentage', 'decimal']),
        }),
        execute: vi.fn().mockImplementation(async ({ value, format }) => {
          const formats: Record<string, (v: number) => string> = {
            currency: (v) => `$${v.toFixed(2)}`,
            percentage: (v) => `${v}%`,
            decimal: (v) => v.toFixed(2),
          };
          return { formatted: formats[format](value) };
        }),
      };

      // Setup hooks
      const onFinishSpy = vi.fn();
      const onStepFinishSpy = vi.fn();
      const prepareStepSpy = vi.fn(async ({ messages, steps, ...args }) => {
        // Add context based on step number
        if (steps.length === 0) {
          return {
            system: 'Remember to use the tools wisely to assist the user effectively.',
            activeTools: ['calculator'],
          };
        }
        return {};
      });

      // Setup conversation history
      const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: 'Hello, I need help with some calculations.' },
        { role: 'assistant', content: 'Of course! I\'d be happy to help with calculations.' },
        { role: 'user', content: 'Can you add 25 and 17, then format the result as currency?' },
      ];

      // Build the complete request using all features
      const builder = new StreamTextBuilder();

      builder
        // Model configuration
        .withModel(mockModel)

        // System prompt (multiple parts)
        .addSystem('You are an expert mathematical assistant.')
        .addSystem('Always explain your calculations clearly.')
        .addSystem('Use the tools available to you for accuracy.')

        // Conversation history
        .addMessages(conversationHistory)

        // Tools
        .addTool('calculator', calculatorTool)
        .addTool('formatter', formatterTool)

        // Options
        .withOption('temperature', 0.7)
        .withOption('maxOutputTokens', 500)

        // Hooks
        .addOnFinish(onFinishSpy)
        .addOnStepFinish(onStepFinishSpy)
        .addPrepareStep(prepareStepSpy);

      // Execute
      const result = await builder.execute();

      expect(await result.text).toContain('$42.00');
      const steps = builder.steps;
      // Collect and verify steps
      expect(steps.length).toBe(3);
      expect(steps[0].input.prompt[0].content).toEqual('Remember to use the tools wisely to assist the user effectively.');
      expect(steps[1].input.prompt[0].content).not.toEqual('Remember to use the tools wisely to assist the user effectively.');
      expect(steps).toMatchSnapshot();

      // Verify tool executions
      expect(calculatorTool.execute).toHaveBeenCalled();
      expect(calculatorTool.execute).toHaveBeenCalledWith(
        { operation: 'add', a: 25, b: 17 },
        expect.anything()
      );

      expect(formatterTool.execute).toHaveBeenCalled();
      expect(formatterTool.execute).toHaveBeenCalledWith(
        { value: 42, format: 'currency' },
        expect.anything()
      );

      // Verify hooks were called
      expect(onFinishSpy).toHaveBeenCalled();
      expect(onFinishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.any(String),
          steps: expect.any(Array),
          totalUsage: expect.objectContaining({
            inputTokens: expect.any(Number),
            outputTokens: expect.any(Number),
          }),
        })
      );

      expect(onStepFinishSpy).toHaveBeenCalled();
      expect(onStepFinishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.any(String),
          usage: expect.any(Object),
        })
      );

      expect(prepareStepSpy).toHaveBeenCalled();
      expect(prepareStepSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: expect.any(Array),
          stepNumber: expect.any(Number),
          model: expect.any(Object),
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.any(String),
            }),
          ]),
        })
      );



      // Verify usage statistics
      const usage = await result.usage;
      expect(usage.inputTokens).toBeGreaterThan(0);
      expect(usage.outputTokens).toBeGreaterThan(0);
      if (usage.inputTokens && usage.outputTokens) {
        expect(usage.totalTokens).toBe(usage.inputTokens + usage.outputTokens);
      }
    });

    it('should track activeTools in steps', async () => {
      // Setup: Create a mock model with tool calls
      const mockModel = createMockModel([
        { type: 'text', text: 'Using calculator. ' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'calculator',
          args: { a: 5, b: 3 }
        },
        { type: 'text', text: 'Result is 8. ' },
      ]);

      // Setup tools
      const calculatorTool = {
        description: 'Add two numbers',
        inputSchema: z.object({
          a: z.number(),
          b: z.number(),
        }),
        execute: vi.fn().mockResolvedValue({ result: 8 }),
      };

      const searchTool = {
        description: 'Search the web',
        inputSchema: z.object({
          query: z.string(),
        }),
        execute: vi.fn().mockResolvedValue({ results: [] }),
      };

      // Test 1: With activeTools set via prepareStep
      const builder1 = new StreamTextBuilder();
      builder1
        .withModel(mockModel)
        .addMessage({ role: 'user', content: 'Calculate 5 + 3' })
        .addTool('calculator', calculatorTool)
        .addTool('search', searchTool)
        .addPrepareStep(async ({ steps }) => {
          if (steps.length === 0) {
            return { activeTools: ['calculator'] };
          }
          return {};
        });

      const result1 = await builder1.execute();
      await result1.text;
      const steps1 = builder1.steps;

      expect(steps1.length).toBeGreaterThan(0);
      expect(steps1[0].activeTools).toEqual(['calculator']);

      // Test 2: Without activeTools set (should default to all tools)
      const mockModel2 = createMockModel([
        { type: 'text', text: 'Using tools. ' },
      ]);

      const builder2 = new StreamTextBuilder();
      builder2
        .withModel(mockModel2)
        .addMessage({ role: 'user', content: 'Help me' })
        .addTool('calculator', calculatorTool)
        .addTool('search', searchTool);

      const result2 = await builder2.execute();
      await result2.text;
      const steps2 = builder2.steps;

      expect(steps2.length).toBeGreaterThan(0);
      expect(steps2[0].activeTools).toEqual(['calculator', 'search']);

      // Test 3: Verify activeTools changes across steps
      const mockModel3 = createMockModel([
        { type: 'text', text: 'Step 1. ' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'calculator',
          args: { a: 1, b: 2 }
        },
        { type: 'text', text: 'Step 2. ' },
      ]);

      const builder3 = new StreamTextBuilder();
      builder3
        .withModel(mockModel3)
        .addMessage({ role: 'user', content: 'Calculate' })
        .addTool('calculator', calculatorTool)
        .addTool('search', searchTool)
        .addPrepareStep(async ({ steps }) => {
          if (steps.length === 0) {
            return { activeTools: ['calculator'] };
          } else if (steps.length === 1) {
            return { activeTools: ['search'] };
          }
          return {};
        });

      const result3 = await builder3.execute();
      await result3.text;
      const steps3 = builder3.steps;

      expect(steps3.length).toBeGreaterThan(1);
      expect(steps3[0].activeTools).toEqual(['calculator']);
      expect(steps3[1].activeTools).toEqual(['search']);
    });
  });
});
