/**
 * Tests for createMockModel utility
 */
import { describe, it, expect } from 'vitest';
import { stepCountIs, streamText } from 'ai';
import { z } from 'zod';
import { createMockModel } from './createMockModel';

describe('createMockModel', () => {
  it('should create a mock model with text response', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello, world!' }
    ]);

    expect(mockModel).toBeDefined();
  });

  it('should create a mock model with tool call', async () => {
    const mockModel = createMockModel([
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'calculator',
        args: { a: 5, b: 3 }
      }
    ]);

    expect(mockModel).toBeDefined();
  });

  it('should stream responses', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const result = await mockModel.doStream({
      prompt: []
    });

    const chunks: any[] = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[chunks.length - 1].type).toBe('finish');
  });

  it('should accept configuration options', async () => {
    const mockModel = createMockModel(
      [{ type: 'text', text: 'Response' }],
      {
        usage: {
          inputTokens: 50,
          outputTokens: 100
        }
      }
    );

    expect(mockModel).toBeDefined();
  });

  describe('streamText compatibility', () => {
    it('should work with streamText for simple text responses', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello from mock model!' }
      ]);

      const result = streamText({
        model: mockModel,
        prompt: 'Say hello',
      });

      const text = await result.text;
      expect(text).toBe('Hello from mock model!');
    });

    it('should work with streamText text streaming', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Streaming response' }
      ]);

      const result = streamText({
        stopWhen: stepCountIs(100),
        model: mockModel,
        prompt: 'Test streaming',
      });

      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
      }

      expect(chunks.join('')).toBe('Streaming response');
    });

    it('should work with streamText and tool calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Let me calculate that.' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'add',
          args: { a: 5, b: 3 }
        },
        { type: 'text', text: 'The result is 8.' }
      ]);

      const result = streamText({
        model: mockModel,
        prompt: 'What is 5 + 3?',
        stopWhen: stepCountIs(100),
        tools: {
          add: {
            description: 'Add two numbers',
            inputSchema: z.object({
              a: z.number().describe('First number'),
              b: z.number().describe('Second number')
            }),
            execute: async ({ a, b }) => {
              return { result: a + b };
            }
          }
        }
      });

      const text = await result.text;
      expect(text).toContain('The result is 8.');
    });

    it('should work with streamText and multiple tool calls', async () => {
      const mockModel = createMockModel([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'multiply',
          args: { a: 2, b: 3 }
        },
        {
          type: 'tool-call',
          toolCallId: 'call_2',
          toolName: 'add',
          args: { a: 6, b: 4 }
        },
        { type: 'text', text: 'First 2*3=6, then 6+4=10' }
      ]);

      const result = streamText({
        model: mockModel,
        stopWhen: stepCountIs(100),
        prompt: 'Calculate 2*3 then add 4',
        tools: {
          multiply: {
            description: 'Multiply two numbers',
            inputSchema: z.object({
              a: z.number(),
              b: z.number()
            }),
            execute: async ({ a, b }) => {
              return { result: a * b };
            }
          },
          add: {
            description: 'Add two numbers',
            inputSchema: z.object({
              a: z.number(),
              b: z.number()
            }),
            execute: async ({ a, b }) => {
              return { result: a + b };
            }
          }
        }
      });

      const text = await result.text;
      expect(text).toBe('First 2*3=6, then 6+4=10');
    });

    it('should provide usage information', async () => {
      const mockModel = createMockModel(
        [{ type: 'text', text: 'Response' }],
        {
          usage: {
            inputTokens: 25,
            outputTokens: 50
          }
        }
      );

      const result = streamText({
        model: mockModel,
        prompt: 'Test usage',
        stopWhen: stepCountIs(100)
      });

      await result.text;
      const usage = await result.usage;
      
      // The usage object uses inputTokens and outputTokens (not promptTokens/completionTokens)
      expect(usage.inputTokens).toBe(25);
      expect(usage.outputTokens).toBe(50);
      expect(usage.totalTokens).toBe(75);
    });

    it('should work with streamText fullStream', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Full stream test' }
      ]);

      const result = streamText({
        model: mockModel,
        prompt: 'Test full stream',
        stopWhen: stepCountIs(100)

      });

      const parts: any[] = [];
      for await (const part of result.fullStream) {
        parts.push(part);
      }

      expect(parts.length).toBeGreaterThan(0);
      expect(parts.some(p => p.type === 'text-delta')).toBe(true);
      expect(parts.some(p => p.type === 'finish')).toBe(true);
    });
  });
});
