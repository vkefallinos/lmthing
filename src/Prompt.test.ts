import { describe, it, expect, vi } from 'vitest';
import { Prompt } from './Prompt';
import { createMockModel } from './test/createMockModel';
import { z } from 'zod';

describe('Prompt', () => {
  it('should handle a complete workflow testing all Prompt class features', async () => {
    // Create a mock model that simulates a multi-step conversation with tool calls
    const mockModel = createMockModel([
      { type: 'text', text: 'Let me help you with the database query.' },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'database',
        args: { query: 'getUserById', id: 123 }
      },
      { type: 'text', text: 'Found the user! Now formatting the result.' },
      {
        type: 'tool-call',
        toolCallId: 'call_2',
        toolName: 'formatter',
        args: { data: { name: 'Alice' }, format: 'pretty' }
      },
      { type: 'text', text: 'Here is the formatted user information.' }
    ]);

    // Mock tool implementations
    const dbExecute = vi.fn().mockResolvedValue({
      user: { id: 123, name: 'Alice', email: 'alice@example.com' }
    });
    
    const formatExecute = vi.fn().mockResolvedValue({
      formatted: 'User: Alice (alice@example.com)'
    });

    // Create a Prompt instance
    const prompt = new Prompt(mockModel);
    
    // Test 1: defSystem - Define system parts that guide the AI's behavior
    prompt.defSystem('role', 'You are a professional database assistant.');
    prompt.defSystem('guidelines', 'Always verify data integrity before returning results.');
    
    // Test 2: def - Define string variables
    const userIdPlaceholder = prompt.def('userId', '123');
    expect(userIdPlaceholder).toBe('<userId>');
    
    const envPlaceholder = prompt.def('environment', 'production');
    expect(envPlaceholder).toBe('<environment>');
    
    // Test 3: defData - Define structured data variables (will be serialized as YAML)
    const configPlaceholder = prompt.defData('config', {
      database: 'main_db',
      timeout: 5000,
      retries: 3,
      features: {
        caching: true,
        logging: {
          level: 'info',
          destination: 'file'
        }
      }
    });
    expect(configPlaceholder).toBe('<config>');
    
    const userDataPlaceholder = prompt.defData('expectedUser', {
      id: 123,
      permissions: ['read', 'write']
    });
    expect(userDataPlaceholder).toBe('<expectedUser>');
    
    // Test 4: defTool - Define multiple tools with schemas and executors
    prompt.defTool(
      'database',
      'Query the database for user information',
      z.object({
        query: z.string(),
        id: z.number().optional()
      }),
      dbExecute
    );
    
    prompt.defTool(
      'formatter',
      'Format data for display',
      z.object({
        data: z.any(),
        format: z.enum(['pretty', 'json', 'table'])
      }),
      formatExecute
    );
    
    // Test 5: defMessage - Add conversation history
    prompt.defMessage('user', 'I need information about user 123');
    
    // Test 6: defHook - Add hooks that can dynamically modify the prompt
    const hookSpy = vi.fn().mockImplementation(({ stepNumber, variables }) => {
      if (stepNumber === 1) {
        // First step: limit to database tool
        return {
          activeTools: ['database'],
          variables: {
            stepInfo: { type: 'string', value: 'Step 1: Querying database' }
          }
        };
      } else if (stepNumber === 2) {
        // Second step: switch to formatter tool
        return {
          activeTools: ['formatter'],
          variables: {
            stepInfo: { type: 'string', value: 'Step 2: Formatting results' }
          }
        };
      }
      return {};
    });
    
    prompt.defHook(hookSpy);
    
    // Test 7: run - Execute the prompt and verify all components work together
    const result = prompt.run();
    const finalText = await result.text;
    
    // Verify the text was generated
    expect(finalText).toBeTruthy();
    expect(finalText).toContain('formatted');
    
    // Verify tools were executed
    expect(dbExecute).toHaveBeenCalled();
    expect(formatExecute).toHaveBeenCalled();
    
    // Verify tool was called with correct arguments
    const dbCallArgs = dbExecute.mock.calls[0];
    expect(dbCallArgs[0]).toMatchObject({
      query: 'getUserById',
      id: 123
    });
    
    const formatCallArgs = formatExecute.mock.calls[0];
    expect(formatCallArgs[0]).toMatchObject({
      data: { name: 'Alice' },
      format: 'pretty'
    });
    
    // Verify hooks were called
    expect(hookSpy).toHaveBeenCalled();
    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stepNumber: 1,
        variables: expect.any(Object)
      })
    );
    
    // Get the steps to verify the system prompt was constructed correctly
    const steps = prompt.steps;
    expect(steps.length).toBeGreaterThan(0);
    
    const firstStep = steps[0];
    expect(firstStep.input.prompt).toBeDefined();
    
    // Verify system message structure
    const systemMessage = firstStep.input.prompt?.find((msg: any) => msg.role === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage?.content).toBeTruthy();
    
    const systemContent = systemMessage?.content as string;
    
    // Verify system parts were included
    expect(systemContent).toContain('role:');
    expect(systemContent).toContain('You are a professional database assistant.');
    expect(systemContent).toContain('guidelines:');
    expect(systemContent).toContain('Always verify data integrity');
    
    // Verify variables section was created
    expect(systemContent).toContain('<variables>');
    expect(systemContent).toContain('</variables>');
    
    // Verify string variables were included with XML tags
    expect(systemContent).toContain('<userId>');
    expect(systemContent).toContain('123');
    expect(systemContent).toContain('</userId>');
    expect(systemContent).toContain('<environment>');
    expect(systemContent).toContain('production');
    expect(systemContent).toContain('</environment>');
    
    // Verify data variables were serialized as YAML
    expect(systemContent).toContain('<config>');
    expect(systemContent).toContain('database: main_db');
    expect(systemContent).toContain('timeout: 5000');
    expect(systemContent).toContain('retries: 3');
    expect(systemContent).toContain('caching: true');
    expect(systemContent).toContain('level: info');
    expect(systemContent).toContain('</config>');
    
    expect(systemContent).toContain('<expectedUser>');
    expect(systemContent).toContain('id: 123');
    expect(systemContent).toContain('permissions:');
    expect(systemContent).toContain('- read');
    expect(systemContent).toContain('- write');
    expect(systemContent).toContain('</expectedUser>');
    
    // Verify user message was included
    const userMessage = firstStep.input.prompt?.find((msg: any) => {
      if (msg.role !== 'user') return false;
      if (Array.isArray(msg.content)) {
        return msg.content.some((part: any) => 
          part.type === 'text' && part.text === 'I need information about user 123'
        );
      }
      return msg.content === 'I need information about user 123';
    });
    expect(userMessage).toBeDefined();
    expect(steps).toMatchSnapshot();
    // Verify the complete workflow executed correctly with multiple steps
    expect(steps.length).toBeGreaterThanOrEqual(2); // Should have at least 2 steps (tool calls)
  });

  it('should handle defAgent to create a sub-prompt with its own model', async () => {
    // Create a main model that will call the agent
    const mainModel = createMockModel([
      { type: 'text', text: 'Let me delegate this task to a specialist agent.' },
      {
        type: 'tool-call',
        toolCallId: 'call_agent_1',
        toolName: 'researchAgent',
        args: { topic: 'quantum computing', depth: 'detailed' }
      },
      { type: 'text', text: 'The research agent has completed the analysis.' }
    ]);

    // Create a separate model for the agent (simulating a different AI model)
    const agentModel = createMockModel([
      { type: 'text', text: 'Analyzing quantum computing in depth...' },
      { type: 'text', text: 'Quantum computing uses qubits and superposition principles for computation.' }
    ]);

    // Create the main prompt
    const prompt = new Prompt(mainModel);

    // Define a research agent with its own model and behavior
    const agentExecuteSpy = vi.fn(async ({ topic, depth }: any, agentPrompt: Prompt) => {
      // The agent sets up its own prompt structure
      agentPrompt.defSystem('role', 'You are a research specialist.');
      agentPrompt.defSystem('expertise', 'Your expertise is in technical topics.');
      
      const topicVar = agentPrompt.def('researchTopic', topic);
      const depthVar = agentPrompt.def('researchDepth', depth);
      
      agentPrompt.defMessage(
        'user',
        `Please research ${topicVar} with ${depthVar} level of detail.`
      );
    });

    prompt.defAgent(
      'researchAgent',
      'A specialist agent that performs in-depth research on technical topics',
      z.object({
        topic: z.string().describe('The topic to research'),
        depth: z.enum(['brief', 'detailed', 'comprehensive']).describe('Level of detail')
      }),
      agentExecuteSpy,
      { model: agentModel, maxSteps: 5 }
    );

    // Add a user message that will trigger the agent
    prompt.defMessage('user', 'I need detailed research on quantum computing.');

    // Run the main prompt
    const result = prompt.run();
    const finalText = await result.text;

    // Verify the agent execute function was called
    expect(agentExecuteSpy).toHaveBeenCalled();
    expect(agentExecuteSpy).toHaveBeenCalledWith(
      { topic: 'quantum computing', depth: 'detailed' },
      expect.any(Prompt)
    );

    // Verify the agent prompt was configured correctly
    const agentPromptInstance = agentExecuteSpy.mock.calls[0][1] as Prompt;
    expect(agentPromptInstance).toBeInstanceOf(Prompt);

    // Verify the main prompt executed and received the agent's response
    expect(finalText).toContain('research agent');
    expect(finalText).toContain('completed');

    // Verify the workflow in steps
    const steps = prompt.steps;
    expect(steps.length).toBeGreaterThanOrEqual(1);

    // Find the tool call for the research agent
    const agentToolCalls = steps.flatMap((step: any) => 
      step.output?.content?.filter((c: any) => 
        c.type === 'tool-call' && c.toolName === 'researchAgent'
      ) || []
    );
    expect(agentToolCalls.length).toBeGreaterThanOrEqual(1);
    expect(steps).toMatchSnapshot();
  });
});
