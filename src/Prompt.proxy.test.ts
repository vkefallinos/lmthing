import { describe, it, expect } from 'vitest';
import { runPrompt } from '../src/runPrompt';
import { createMockModel } from '../src/test/createMockModel';
import { z } from 'zod';

describe('Proxy functionality', () => {
  it('should return proxies with value property and remind function', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello World!' }
    ]);

    const { result, prompt } = await runPrompt(
      async ({ def, defData, defSystem, defTool, defAgent, $ }) => {
        const name = def('NAME', 'World');
        const config = defData('CONFIG', { key: 'value' });
        const role = defSystem('ROLE', 'assistant');

        // Test that proxies have value property
        expect(name.value).toBe('<NAME>');
        expect(config.value).toBe('<CONFIG>');
        expect(role.value).toBe('<ROLE>');

        // Test that proxies have remind function
        expect(typeof name.remind).toBe('function');
        expect(typeof config.remind).toBe('function');
        expect(typeof role.remind).toBe('function');

        // Test that proxies convert to string properly
        expect(String(name)).toBe('<NAME>');
        expect(String(config)).toBe('<CONFIG>');
        expect(String(role)).toBe('<ROLE>');

        // Call remind on some items
        name.remind();
        config.remind();

        $`Hello ${name}!`;
      },
      { model: mockModel }
    );

    await result.text;

    // Check that the reminder was added by looking at the messages
    // We need to check the _messages array since that's where addMessage stores them
    const messages = (prompt as any)._messages;
    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');

    // Find the reminder message
    const reminderMessage = assistantMessages.find((m: any) =>
      m.content && m.content.includes('[Reminder: Remember to use the following items in your response:')
    );

    expect(reminderMessage).toBeDefined();
    expect(reminderMessage.content).toContain('- NAME (variable)');
    expect(reminderMessage.content).toContain('- CONFIG (data variable)');
  });

  it('should handle proxies correctly in template literals', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Processed templates' }
    ]);

    const { result, prompt } = await runPrompt(
      async ({ def, defTool, $ }) => {
        const greeting = def('GREETING', 'Hello');
        const toolRef = defTool('calculator', 'Add numbers',
          z.object({ a: z.number(), b: z.number() }),
          async ({ a, b }) => ({ sum: a + b })
        );

        // Template literals should use the .value property automatically
        $`Message: ${greeting} and ${toolRef}`;
      },
      { model: mockModel }
    );

    await result.text;

    // Verify the message was processed correctly
    expect(prompt.fullSteps).toBeDefined();
  });

  it('should handle tools and agents with proxies', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response with tool and agent' }
    ]);

    const { result, prompt } = await runPrompt(
      async ({ defTool, defAgent, $ }) => {
        const searchTool = defTool('search', 'Search web',
          z.object({ query: z.string() }),
          async ({ query }) => ({ results: [`Result for ${query}`] })
        );

        const researcherAgent = defAgent('researcher', 'Research topics',
          z.object({ topic: z.string() }),
          async ({ topic }, childPrompt) => {
            childPrompt.$`Researching ${topic}`;
          }
        );

        // Test remind on tools and agents
        searchTool.remind();
        researcherAgent.remind();

        $`Use ${searchTool} and ${researcherAgent}`;
      },
      { model: mockModel }
    );

    await result.text;

    // Check that the reminder was added
    const messages = (prompt as any)._messages;
    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');

    // Find the reminder message
    const reminderMessage = assistantMessages.find((m: any) =>
      m.content && m.content.includes('[Reminder: Remember to use the following items in your response:')
    );

    expect(reminderMessage).toBeDefined();
    expect(reminderMessage.content).toContain('- search (tool)');
    expect(reminderMessage.content).toContain('- researcher (agent)');
  });
});