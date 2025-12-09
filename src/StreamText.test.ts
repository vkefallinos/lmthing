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

  describe('compressedSteps', () => {
    it('should compress steps by deduplicating messages', async () => {
      // Setup: Create a mock model with multi-step tool calls
      const mockModel = createMockModel([
        { type: 'text', text: 'Let me search for that. ' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'search',
          args: { query: 'test' }
        },
        { type: 'text', text: 'Found some results. ' },
        {
          type: 'tool-call',
          toolCallId: 'call_2',
          toolName: 'search',
          args: { query: 'more info' }
        },
        { type: 'text', text: 'Here is the information you requested.' }
      ]);

      const searchTool = {
        description: 'Searches for information',
        inputSchema: z.object({
          query: z.string(),
        }),
        execute: vi.fn().mockResolvedValue({ results: ['result1', 'result2'] }),
      };

      const builder = new StreamTextBuilder();
      builder
        .withModel(mockModel)
        .addSystem('You are a helpful search assistant.')
        .addMessage({ role: 'user', content: 'Search for test information' })
        .addTool('search', searchTool);

      const result = await builder.execute();
      await result.text; // Wait for stream to complete

      // Get compressed steps
      const compressed = builder.compressedSteps;
      const stats = compressed.getStats();

      // Verify compression stats
      expect(stats.stepCount).toBe(3);
      expect(stats.uniqueMessages).toBeLessThan(stats.totalUncompressedMessages);
      expect(stats.savingsRatio).toBeGreaterThan(0);

      // Verify we can reconstruct full steps
      for (let i = 0; i < stats.stepCount; i++) {
        const reconstructed = compressed.getStep(i);
        const original = builder.steps[i];

        expect(reconstructed.input.prompt.length).toBe(original.input.prompt.length);
        expect(reconstructed.output).toEqual(original.output);
      }

      // Snapshot the compressed steps structure
      expect({
        messagePool: compressed.messagePool,
        steps: compressed.steps,
        stats: compressed.getStats()
      }).toMatchSnapshot();
    });

    it('should correctly track delta messages between steps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response 1 ' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'tool1',
          args: { value: 1 }
        },
        { type: 'text', text: 'Response 2' }
      ]);

      const tool1 = {
        description: 'Test tool',
        inputSchema: z.object({ value: z.number() }),
        execute: vi.fn().mockResolvedValue({ success: true }),
      };

      const builder = new StreamTextBuilder();
      builder
        .withModel(mockModel)
        .addSystem('System prompt')
        .addMessage({ role: 'user', content: 'User message' })
        .addTool('tool1', tool1);

      const result = await builder.execute();
      await result.text; // Wait for stream to complete

      const compressed = builder.compressedSteps;

      // Step 0: all messages are new
      const delta0 = compressed.getDeltaMessages(0);
      expect(delta0.length).toBe(compressed.getStep(0).input.prompt.length);

      // Step 1: should have new messages (assistant response + tool result)
      const delta1 = compressed.getDeltaMessages(1);
      expect(delta1.length).toBeGreaterThan(0);
      expect(delta1.length).toBeLessThan(compressed.getStep(1).input.prompt.length);

      // Snapshot delta messages for each step
      expect({
        step0Delta: delta0,
        step1Delta: delta1,
        messagePool: compressed.messagePool,
        steps: compressed.steps.map(s => ({
          stepIndex: s.stepIndex,
          messageRefs: s.messageRefs,
          deltaStart: s.deltaStart
        }))
      }).toMatchSnapshot();
    });

    it('should provide correct stats', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello!' }
      ]);

      const builder = new StreamTextBuilder();
      builder
        .withModel(mockModel)
        .addSystem('System prompt')
        .addMessage({ role: 'user', content: 'Hello' });

      const result = await builder.execute();
      await result.text; // Wait for stream to complete

      const compressed = builder.compressedSteps;
      const stats = compressed.getStats();

      expect(stats.stepCount).toBe(1);
      expect(stats.uniqueMessages).toBe(2); // system + user
      expect(stats.totalUncompressedMessages).toBe(2);
      expect(stats.savingsRatio).toBe(0); // No savings for single step
    });

    it('should handle system prompt changes between steps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'First response ' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'tool1',
          args: { value: 1 }
        },
        { type: 'text', text: 'Second response' }
      ]);

      const tool1 = {
        description: 'Test tool',
        inputSchema: z.object({ value: z.number() }),
        execute: vi.fn().mockResolvedValue({ success: true }),
      };

      const prepareStepHook = vi.fn(({ stepNumber }) => {
        if (stepNumber === 0) {
          return { system: 'System prompt version 1' };
        }
        return { system: 'System prompt version 2' };
      });

      const builder = new StreamTextBuilder();
      builder
        .withModel(mockModel)
        .addSystem('Default system')
        .addMessage({ role: 'user', content: 'User message' })
        .addTool('tool1', tool1)
        .addPrepareStep(prepareStepHook);

      const result = await builder.execute();
      await result.text; // Wait for stream to complete

      const compressed = builder.compressedSteps;

      // System messages should be different, so they should be stored separately
      const step0 = compressed.getStep(0);
      const step1 = compressed.getStep(1);

      // The system messages at index 0 should be different
      expect(step0.input.prompt[0].content).not.toBe(step1.input.prompt[0].content);

      // Both should still exist in the pool
      expect(compressed.messagePool.length).toBeGreaterThanOrEqual(2);

      // Snapshot to show how system prompt changes are handled
      expect({
        messagePool: compressed.messagePool,
        steps: compressed.steps.map(s => ({
          stepIndex: s.stepIndex,
          messageRefs: s.messageRefs,
          deltaStart: s.deltaStart
        })),
        stats: compressed.getStats()
      }).toMatchSnapshot();
    });

    it('should throw error for invalid step index', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello!' }
      ]);

      const builder = new StreamTextBuilder();
      builder
        .withModel(mockModel)
        .addMessage({ role: 'user', content: 'Hello' });

      const result = await builder.execute();
      await result.text; // Wait for stream to complete

      const compressed = builder.compressedSteps;

      expect(() => compressed.getStep(-1)).toThrow();
      expect(() => compressed.getStep(10)).toThrow();
      expect(() => compressed.getDeltaMessages(-1)).toThrow();
      expect(() => compressed.getState(-1)).toThrow();
    });

    it('should return empty state for non-stateful prompts', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello!' }
      ]);

      const builder = new StreamTextBuilder();
      builder
        .withModel(mockModel)
        .addMessage({ role: 'user', content: 'Hello' });

      const result = await builder.execute();
      await result.text; // Wait for stream to complete

      const compressed = builder.compressedSteps;
      const state = compressed.getState(0);

      expect(state).toEqual({});
    });
  });
});
