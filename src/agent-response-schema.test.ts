import { describe, it, expect } from 'vitest';
import { runPrompt } from './runPrompt';
import { createMockModel } from './test/createMockModel';
import { agent } from './StatefulPrompt';
import { z } from 'zod';

describe('Agent Response Schema', () => {
  describe('Single agent with response schema', () => {
    it('should accept and validate response schema for single agent', async () => {
      // Mock model that returns JSON response
      const mockModel = createMockModel([
        { type: 'text', text: 'Analyzing data...' },
        { type: 'tool-call', toolCallId: '1', toolName: 'analyst', args: { data: 'sample data' } },
        { type: 'text', text: 'Analysis complete!' }
      ]);

      // Mock agent model that returns valid JSON
      const agentMockModel = createMockModel([
        { type: 'text', text: '{"summary": "Analysis shows positive trends", "score": 85}' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent(
          'analyst',
          'Analyze data with structured output',
          z.object({ data: z.string() }),
          async (args, childPrompt) => {
            childPrompt.$`Analyze: ${args.data}`;
          },
          {
            model: agentMockModel,
            responseSchema: z.object({
              summary: z.string().describe('Summary of the analysis'),
              score: z.number().describe('Score from 0-100')
            }),
            system: 'You are a data analyst.'
          }
        );

        $`Please analyze the sample data`;
      }, {
        model: mockModel
      });

      await result.text;

      // Check that the agent was called
      const steps = prompt.steps;
      expect(steps.length).toBeGreaterThan(0);

      // The agent should have been executed
      expect(steps.some(step =>
        step.output?.content?.some((c: any) => c.type === 'tool-call' && c.toolName === 'analyst')
      )).toBe(true);

      // Snapshot test
      expect(prompt.steps).toMatchSnapshot();
    });

    it('should include validation error when response does not match schema', async () => {
      // Mock model that calls the agent
      const mockModel = createMockModel([
        { type: 'text', text: 'Analyzing...' },
        { type: 'tool-call', toolCallId: '1', toolName: 'analyst', args: { data: 'test' } },
        { type: 'text', text: 'Done!' }
      ]);

      // Mock agent model that returns invalid JSON (missing required field)
      const agentMockModel = createMockModel([
        { type: 'text', text: '{"summary": "Test summary"}' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent(
          'analyst',
          'Analyze data',
          z.object({ data: z.string() }),
          async (args, childPrompt) => {
            childPrompt.$`Analyze: ${args.data}`;
          },
          {
            model: agentMockModel,
            responseSchema: z.object({
              summary: z.string(),
              score: z.number() // Required field missing in response
            })
          }
        );

        $`Analyze test data`;
      }, {
        model: mockModel
      });

      await result.text;

      // The agent should still execute but return validation error
      const steps = prompt.steps;
      expect(steps.length).toBeGreaterThan(0);

      // Snapshot test
      expect(prompt.steps).toMatchSnapshot();
    });

    it('should add schema instruction to agent system prompt', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Calling agent...' },
        { type: 'tool-call', toolCallId: '1', toolName: 'formatter', args: { text: 'hello' } },
        { type: 'text', text: 'Formatted!' }
      ]);

      const agentMockModel = createMockModel([
        { type: 'text', text: '{"formatted": "HELLO", "length": 5}' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent(
          'formatter',
          'Format text with metadata',
          z.object({ text: z.string() }),
          async (args, childPrompt) => {
            childPrompt.$`Format: ${args.text}`;
          },
          {
            model: agentMockModel,
            responseSchema: z.object({
              formatted: z.string().describe('The formatted text'),
              length: z.number().describe('Length of original text')
            })
          }
        );

        $`Format hello`;
      }, {
        model: mockModel
      });

      await result.text;
      expect(prompt.steps.length).toBeGreaterThan(0);

      // Snapshot test
      expect(prompt.steps).toMatchSnapshot();
    });
  });

  describe('Composite agent with response schema', () => {
    it('should validate response schema for each sub-agent independently', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Delegating tasks...' },
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'team',
          args: {
            calls: [
              { name: 'researcher', args: { topic: 'AI' } },
              { name: 'analyst', args: { data: 'research data' } }
            ]
          }
        },
        { type: 'text', text: 'Team completed tasks!' }
      ]);

      const researcherMock = createMockModel([
        { type: 'text', text: '{"findings": ["Finding 1", "Finding 2"], "confidence": 0.9}' }
      ]);

      const analystMock = createMockModel([
        { type: 'text', text: '{"summary": "Analysis complete", "score": 92}' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent('team', 'Research and analysis team', [
          agent(
            'researcher',
            'Research topics',
            z.object({ topic: z.string() }),
            async (args, childPrompt) => {
              childPrompt.$`Research: ${args.topic}`;
            },
            {
              model: researcherMock,
              responseSchema: z.object({
                findings: z.array(z.string()),
                confidence: z.number()
              })
            }
          ),
          agent(
            'analyst',
            'Analyze data',
            z.object({ data: z.string() }),
            async (args, childPrompt) => {
              childPrompt.$`Analyze: ${args.data}`;
            },
            {
              model: analystMock,
              responseSchema: z.object({
                summary: z.string(),
                score: z.number()
              })
            }
          )
        ]);

        $`Research AI and analyze the results`;
      }, {
        model: mockModel
      });

      await result.text;
      expect(prompt.steps.length).toBeGreaterThan(0);

      // Snapshot test
      expect(prompt.steps).toMatchSnapshot();
    });

    it('should handle validation errors in composite agents', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Executing...' },
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'team',
          args: {
            calls: [
              { name: 'validator', args: { input: 'test' } }
            ]
          }
        },
        { type: 'text', text: 'Done!' }
      ]);

      // Agent returns invalid response (missing required field)
      const validatorMock = createMockModel([
        { type: 'text', text: '{"status": "ok"}' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent('team', 'Validation team', [
          agent(
            'validator',
            'Validate input',
            z.object({ input: z.string() }),
            async (args, childPrompt) => {
              childPrompt.$`Validate: ${args.input}`;
            },
            {
              model: validatorMock,
              responseSchema: z.object({
                status: z.string(),
                errors: z.array(z.string()) // Required but missing
              })
            }
          )
        ]);

        $`Validate the input`;
      }, {
        model: mockModel
      });

      await result.text;
      // Should complete despite validation error
      expect(prompt.steps.length).toBeGreaterThan(0);

      // Snapshot test
      expect(prompt.steps).toMatchSnapshot();
    });

    it('should combine system prompt with schema instruction', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Processing...' },
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'processor',
          args: { data: 'test data' }
        },
        { type: 'text', text: 'Processed!' }
      ]);

      const agentMock = createMockModel([
        { type: 'text', text: '{"result": "processed", "timestamp": 1234567890}' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent(
          'processor',
          'Process data',
          z.object({ data: z.string() }),
          async (args, childPrompt) => {
            childPrompt.$`Process: ${args.data}`;
          },
          {
            model: agentMock,
            system: 'You are a data processor. Be precise and accurate.',
            responseSchema: z.object({
              result: z.string(),
              timestamp: z.number()
            })
          }
        );

        $`Process the test data`;
      }, {
        model: mockModel
      });

      await result.text;
      expect(prompt.steps.length).toBeGreaterThan(0);

      // Snapshot test
      expect(prompt.steps).toMatchSnapshot();
    });
  });

  describe('Response schema instruction formatting', () => {
    it('should create proper JSON schema instruction', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Working...' },
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'structured',
          args: { query: 'test' }
        },
        { type: 'text', text: 'Complete!' }
      ]);

      const agentMock = createMockModel([
        { type: 'text', text: '{"name": "Test", "age": 25, "active": true}' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent(
          'structured',
          'Get structured data',
          z.object({ query: z.string() }),
          async (args, childPrompt) => {
            childPrompt.$`Query: ${args.query}`;
          },
          {
            model: agentMock,
            responseSchema: z.object({
              name: z.string().describe('Person name'),
              age: z.number().describe('Person age'),
              active: z.boolean().describe('Whether person is active')
            })
          }
        );

        $`Get user data`;
      }, {
        model: mockModel
      });

      await result.text;
      expect(prompt.steps.length).toBeGreaterThan(0);

      // Snapshot test
      expect(prompt.steps).toMatchSnapshot();
    });
  });
});
