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
  });
});
