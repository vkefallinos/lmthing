import { describe, it, expect, vi } from 'vitest';
import { Prompt, tool, agent } from './Prompt';
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
    expect(systemContent).toContain('<role>');
    expect(systemContent).toContain('You are a professional database assistant.');
    expect(systemContent).toContain('</role>');
    expect(systemContent).toContain('<guidelines>');
    expect(systemContent).toContain('Always verify data integrity');
    expect(systemContent).toContain('</guidelines>');
    
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

  it('should handle composite tools with defTool array syntax', async () => {
    // Create a mock model that calls a composite tool with multiple sub-tool calls
    const mockModel = createMockModel([
      { type: 'text', text: 'I will perform multiple file operations.' },
      {
        type: 'tool-call',
        toolCallId: 'call_composite_1',
        toolName: 'file',
        args: {
          calls: [
            { name: 'write', args: { path: '/tmp/test.txt', content: 'Hello World' } },
            { name: 'append', args: { path: '/tmp/test.txt', content: '\nAppended line' } },
            { name: 'read', args: { path: '/tmp/test.txt' } }
          ]
        }
      },
      { type: 'text', text: 'All file operations completed successfully!' }
    ]);

    // Mock sub-tool implementations
    const writeFn = vi.fn().mockResolvedValue({ success: true, bytesWritten: 11 });
    const appendFn = vi.fn().mockResolvedValue({ success: true, bytesWritten: 14 });
    const readFn = vi.fn().mockResolvedValue({ content: 'Hello World\nAppended line' });

    const prompt = new Prompt(mockModel);

    // Define a composite tool using array syntax
    prompt.defTool('file', 'File system operations', [
      tool('write', 'Write content to a file', z.object({
        path: z.string().describe('File path'),
        content: z.string().describe('Content to write')
      }), writeFn),
      tool('append', 'Append content to a file', z.object({
        path: z.string().describe('File path'),
        content: z.string().describe('Content to append')
      }), appendFn),
      tool('read', 'Read content from a file', z.object({
        path: z.string().describe('File path')
      }), readFn)
    ]);

    prompt.defMessage('user', 'Please write, append, and then read the file.');

    const result = prompt.run();
    const finalText = await result.text;

    // Verify all sub-tools were called
    expect(writeFn).toHaveBeenCalledWith(
      { path: '/tmp/test.txt', content: 'Hello World' },
      expect.anything()
    );
    expect(appendFn).toHaveBeenCalledWith(
      { path: '/tmp/test.txt', content: '\nAppended line' },
      expect.anything()
    );
    expect(readFn).toHaveBeenCalledWith(
      { path: '/tmp/test.txt' },
      expect.anything()
    );

    // Verify the text was generated
    expect(finalText).toContain('completed');

    // Verify the steps structure
    const steps = prompt.steps;
    expect(steps.length).toBeGreaterThanOrEqual(1);

    // Find the composite tool call
    const toolCalls = steps.flatMap((step: any) =>
      step.output?.content?.filter((c: any) =>
        c.type === 'tool-call' && c.toolName === 'file'
      ) || []
    );
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].input.calls).toHaveLength(3);

    expect(steps).toMatchSnapshot();
  });

  it('should handle errors in composite tool sub-calls gracefully', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Executing operations...' },
      {
        type: 'tool-call',
        toolCallId: 'call_error_1',
        toolName: 'operations',
        args: {
          calls: [
            { name: 'success', args: { value: 1 } },
            { name: 'fail', args: { value: 2 } },
            { name: 'success', args: { value: 3 } }
          ]
        }
      },
      { type: 'text', text: 'Operations finished with some errors.' }
    ]);

    const successFn = vi.fn().mockResolvedValue({ result: 'ok' });
    const failFn = vi.fn().mockRejectedValue(new Error('Intentional failure'));

    const prompt = new Prompt(mockModel);

    prompt.defTool('operations', 'Test operations', [
      tool('success', 'Always succeeds', z.object({ value: z.number() }), successFn),
      tool('fail', 'Always fails', z.object({ value: z.number() }), failFn)
    ]);

    prompt.defMessage('user', 'Run the operations.');

    const result = prompt.run();
    await result.text;

    // Verify success function was called twice
    expect(successFn).toHaveBeenCalledTimes(2);
    expect(successFn).toHaveBeenCalledWith({ value: 1 }, expect.anything());
    expect(successFn).toHaveBeenCalledWith({ value: 3 }, expect.anything());
    // Verify fail function was called (even though it throws)
    expect(failFn).toHaveBeenCalledWith({ value: 2 }, expect.anything());

    // The steps should contain the tool result with error info
    const steps = prompt.steps;
    expect(steps).toMatchSnapshot();
  });

  it('should work with single sub-tool in array (edge case)', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Using single tool...' },
      {
        type: 'tool-call',
        toolCallId: 'call_single_1',
        toolName: 'wrapper',
        args: {
          calls: [
            { name: 'inner', args: { data: 'test' } }
          ]
        }
      },
      { type: 'text', text: 'Done!' }
    ]);

    const innerFn = vi.fn().mockResolvedValue({ processed: true });

    const prompt = new Prompt(mockModel);

    // Edge case: composite tool with only one sub-tool
    prompt.defTool('wrapper', 'Wrapper tool', [
      tool('inner', 'Inner operation', z.object({ data: z.string() }), innerFn)
    ]);

    prompt.defMessage('user', 'Run the wrapper.');

    const result = prompt.run();
    await result.text;

    expect(innerFn).toHaveBeenCalledWith({ data: 'test' }, expect.anything());
  });

  it('should handle composite agents with defAgent array syntax', async () => {
    // Main model calls the composite agent
    const mainModel = createMockModel([
      { type: 'text', text: 'I will delegate to multiple specialist agents.' },
      {
        type: 'tool-call',
        toolCallId: 'call_agents_1',
        toolName: 'specialists',
        args: {
          calls: [
            { name: 'researcher', args: { topic: 'quantum computing' } },
            { name: 'analyst', args: { data: 'quantum data' } }
          ]
        }
      },
      { type: 'text', text: 'Both agents have completed their tasks.' }
    ]);

    // Sub-agent models
    const researcherModel = createMockModel([
      { type: 'text', text: 'Researching quantum computing...' },
      { type: 'text', text: 'Quantum computing uses qubits for computation.' }
    ]);

    const analystModel = createMockModel([
      { type: 'text', text: 'Analyzing quantum data...' },
      { type: 'text', text: 'Analysis shows promising results.' }
    ]);

    const prompt = new Prompt(mainModel);

    // Track agent executions
    const researcherFn = vi.fn(async ({ topic }: any, agentPrompt: Prompt) => {
      agentPrompt.defSystem('role', 'You are a researcher.');
      agentPrompt.$`Research: ${topic}`;
    });

    const analystFn = vi.fn(async ({ data }: any, agentPrompt: Prompt) => {
      agentPrompt.defSystem('role', 'You are an analyst.');
      agentPrompt.$`Analyze: ${data}`;
    });

    // Define a composite agent using array syntax
    prompt.defAgent('specialists', 'Specialist agents for research and analysis', [
      agent('researcher', 'Research topics in depth', z.object({
        topic: z.string().describe('Topic to research')
      }), researcherFn, { model: researcherModel }),
      agent('analyst', 'Analyze data', z.object({
        data: z.string().describe('Data to analyze')
      }), analystFn, { model: analystModel })
    ]);

    prompt.defMessage('user', 'Research quantum computing and analyze the data.');

    const result = prompt.run();
    const finalText = await result.text;

    // Verify both agent functions were called
    expect(researcherFn).toHaveBeenCalledWith(
      { topic: 'quantum computing' },
      expect.any(Prompt)
    );
    expect(analystFn).toHaveBeenCalledWith(
      { data: 'quantum data' },
      expect.any(Prompt)
    );

    // Verify the final text
    expect(finalText).toContain('completed');

    // Verify steps
    const steps = prompt.steps;
    expect(steps.length).toBeGreaterThanOrEqual(1);

    // Find the composite agent call
    const agentCalls = steps.flatMap((step: any) =>
      step.output?.content?.filter((c: any) =>
        c.type === 'tool-call' && c.toolName === 'specialists'
      ) || []
    );
    expect(agentCalls.length).toBe(1);
    expect(agentCalls[0].input.calls).toHaveLength(2);

    expect(steps).toMatchSnapshot();
  });

  it('should handle errors in composite agent sub-calls gracefully', async () => {
    const mainModel = createMockModel([
      { type: 'text', text: 'Delegating to agents...' },
      {
        type: 'tool-call',
        toolCallId: 'call_agents_error_1',
        toolName: 'agents',
        args: {
          calls: [
            { name: 'working', args: { input: 'test' } },
            { name: 'failing', args: { input: 'fail' } }
          ]
        }
      },
      { type: 'text', text: 'Agent tasks completed with some errors.' }
    ]);

    const workingModel = createMockModel([
      { type: 'text', text: 'Working agent response.' }
    ]);

    const prompt = new Prompt(mainModel);

    const workingFn = vi.fn(async ({ input }: any, agentPrompt: Prompt) => {
      agentPrompt.$`Process: ${input}`;
    });

    const failingFn = vi.fn(async () => {
      throw new Error('Agent execution failed');
    });

    prompt.defAgent('agents', 'Test agents', [
      agent('working', 'A working agent', z.object({ input: z.string() }), workingFn, { model: workingModel }),
      agent('failing', 'A failing agent', z.object({ input: z.string() }), failingFn, { model: workingModel })
    ]);

    prompt.defMessage('user', 'Run the agents.');

    const result = prompt.run();
    await result.text;

    // Verify working function was called
    expect(workingFn).toHaveBeenCalledWith({ input: 'test' }, expect.any(Prompt));
    // Verify failing function was called (even though it throws)
    expect(failingFn).toHaveBeenCalledWith({ input: 'fail' }, expect.any(Prompt));

    // The steps should contain the results
    const steps = prompt.steps;
    expect(steps).toMatchSnapshot();
  });

  it('should allow composite agents to inherit parent model', async () => {
    // Single model used by parent and agents
    const sharedModel = createMockModel([
      { type: 'text', text: 'Using shared model...' },
      {
        type: 'tool-call',
        toolCallId: 'call_shared_1',
        toolName: 'agents',
        args: {
          calls: [
            { name: 'helper', args: { task: 'help' } }
          ]
        }
      },
      { type: 'text', text: 'Done!' }
    ]);

    // This model will be used by the sub-agent when it inherits
    const inheritedModel = createMockModel([
      { type: 'text', text: 'Helper agent using inherited model.' }
    ]);

    const prompt = new Prompt(sharedModel);

    const helperFn = vi.fn(async ({ task }: any, agentPrompt: Prompt) => {
      agentPrompt.$`Help with: ${task}`;
    });

    // Define composite agent without specifying model (should inherit)
    // Note: We use inheritedModel here to simulate what would be inherited
    prompt.defAgent('agents', 'Helper agents', [
      agent('helper', 'A helper agent', z.object({ task: z.string() }), helperFn, { model: inheritedModel })
    ]);

    prompt.defMessage('user', 'Get help.');

    const result = prompt.run();
    await result.text;

    expect(helperFn).toHaveBeenCalled();
  });

  it('should support activeSystems and activeVariables in defHook', async () => {
    // Create a mock model
    const mockModel = createMockModel([
      { type: 'text', text: 'Processing with filtered context...' }
    ]);

    const prompt = new Prompt(mockModel);

    // Define multiple system parts
    prompt.defSystem('role', 'You are a helpful assistant.');
    prompt.defSystem('guidelines', 'Always be polite and professional.');
    prompt.defSystem('expertise', 'You are an expert in TypeScript and Node.js.');

    // Define multiple variables
    prompt.def('userName', 'Alice');
    prompt.def('userRole', 'developer');
    prompt.defData('config', {
      theme: 'dark',
      language: 'en'
    });
    prompt.defData('preferences', {
      notifications: true,
      autoSave: false
    });

    // Track what the hook receives
    const hookSpy = vi.fn().mockImplementation(({ system, variableValues }) => {
      // Verify the hook receives the system and variables objects
      expect(system).toBeDefined();
      expect(variableValues).toBeDefined();
      expect(system.role).toBe('You are a helpful assistant.');
      expect(system.guidelines).toBe('Always be polite and professional.');
      expect(system.expertise).toBe('You are an expert in TypeScript and Node.js.');
      expect(variableValues.userName).toEqual({ type: 'string', value: 'Alice' });
      expect(variableValues.userRole).toEqual({ type: 'string', value: 'developer' });

      // Return only specific systems and variables to activate
      return {
        activeSystems: ['role', 'expertise'], // Exclude 'guidelines'
        activeVariables: ['userName', 'config'] // Exclude 'userRole' and 'preferences'
      };
    });

    prompt.defHook(hookSpy);

    prompt.defMessage('user', 'Hello!');

    // Run the prompt
    const result = prompt.run();
    await result.text;

    // Verify the hook was called
    expect(hookSpy).toHaveBeenCalled();

    // Get the first step to check the system prompt
    const steps = prompt.steps;
    expect(steps.length).toBeGreaterThan(0);

    const firstStep = steps[0];
    const systemMessage = firstStep.input.prompt?.find((msg: any) => msg.role === 'system');
    expect(systemMessage).toBeDefined();

    const systemContent = systemMessage?.content as string;

    // Verify only the active systems are included
    expect(systemContent).toContain('<role>');
    expect(systemContent).toContain('You are a helpful assistant.');
    expect(systemContent).toContain('</role>');
    expect(systemContent).toContain('<expertise>');
    expect(systemContent).toContain('You are an expert in TypeScript and Node.js.');
    expect(systemContent).toContain('</expertise>');

    // Verify the excluded system is NOT included
    expect(systemContent).not.toContain('<guidelines>');
    expect(systemContent).not.toContain('Always be polite and professional.');

    // Verify only the active variables are included
    expect(systemContent).toContain('<userName>');
    expect(systemContent).toContain('Alice');
    expect(systemContent).toContain('</userName>');
    expect(systemContent).toContain('<config>');
    expect(systemContent).toContain('theme: dark');
    expect(systemContent).toContain('language: en');
    expect(systemContent).toContain('</config>');

    // Verify the excluded variables are NOT included
    expect(systemContent).not.toContain('userRole');
    expect(systemContent).not.toContain('developer');
    expect(systemContent).not.toContain('preferences');
    expect(systemContent).not.toContain('notifications');
    expect(systemContent).not.toContain('autoSave');

    expect(steps).toMatchSnapshot();
  });

  it('should allow defHook to filter different systems/variables per step', async () => {
    // Create a mock model with multiple steps
    const mockModel = createMockModel([
      { type: 'text', text: 'Step 1 response' },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'continue',
        args: {}
      },
      { type: 'text', text: 'Step 2 response' }
    ]);

    const prompt = new Prompt(mockModel);

    prompt.defSystem('system1', 'First system part');
    prompt.defSystem('system2', 'Second system part');
    prompt.def('var1', 'value1');
    prompt.def('var2', 'value2');

    const continueFn = vi.fn().mockResolvedValue({ continued: true });
    prompt.defTool('continue', 'Continue processing', z.object({}), continueFn);

    // Hook that changes filtering based on step number
    const hookSpy = vi.fn().mockImplementation(({ stepNumber }) => {
      if (stepNumber === 0) {
        // First step (steps[0])
        return {
          activeSystems: ['system1'],
          activeVariables: ['var1']
        };
      } else if (stepNumber === 1) {
        // Second step (steps[1])
        return {
          activeSystems: ['system2'],
          activeVariables: ['var2']
        };
      }
      return {};
    });

    prompt.defHook(hookSpy);
    prompt.defMessage('user', 'Process this');

    const result = prompt.run();
    await result.text;

    // Verify the hook was called multiple times
    expect(hookSpy).toHaveBeenCalledTimes(2);

    const steps = prompt.steps;
    expect(steps.length).toBe(2);

    // Check step 1 - should have system1 and var1
    const step1SystemMsg = steps[0].input.prompt?.find((msg: any) => msg.role === 'system');
    const step1Content = step1SystemMsg?.content as string;
    expect(step1Content).toContain('system1');
    expect(step1Content).toContain('First system part');
    expect(step1Content).toContain('var1');
    expect(step1Content).toContain('value1');
    expect(step1Content).not.toContain('system2');
    expect(step1Content).not.toContain('var2');

    // Check step 2 - should have system2 and var2
    const step2SystemMsg = steps[1].input.prompt?.find((msg: any) => msg.role === 'system');
    const step2Content = step2SystemMsg?.content as string;
    expect(step2Content).toContain('system2');
    expect(step2Content).toContain('Second system part');
    expect(step2Content).toContain('var2');
    expect(step2Content).toContain('value2');
    expect(step2Content).not.toContain('system1');
    expect(step2Content).not.toContain('var1');

    expect(steps).toMatchSnapshot();
  });

  it('should reset filters between steps when hook does not return them', async () => {
    // Create a mock model with multiple steps
    const mockModel = createMockModel([
      { type: 'text', text: 'Step 1 response' },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'continue',
        args: {}
      },
      { type: 'text', text: 'Step 2 response' }
    ]);

    const prompt = new Prompt(mockModel);

    prompt.defSystem('system1', 'First system part');
    prompt.defSystem('system2', 'Second system part');
    prompt.def('var1', 'value1');
    prompt.def('var2', 'value2');

    const continueFn = vi.fn().mockResolvedValue({ continued: true });
    prompt.defTool('continue', 'Continue processing', z.object({}), continueFn);

    // Hook that only sets filters for step 0, returns empty object for step 1
    const hookSpy = vi.fn().mockImplementation(({ stepNumber }) => {
      if (stepNumber === 0) {
        // Set filters for first step only
        return {
          activeSystems: ['system1'],
          activeVariables: ['var1']
        };
      }
      // Return empty object - filters should reset, not persist
      return {};
    });

    prompt.defHook(hookSpy);
    prompt.defMessage('user', 'Process this');

    const result = prompt.run();
    await result.text;

    const steps = prompt.steps;
    expect(steps.length).toBe(2);

    // Check step 0 - should have only system1 and var1 (filtered)
    const step0SystemMsg = steps[0].input.prompt?.find((msg: any) => msg.role === 'system');
    const step0Content = step0SystemMsg?.content as string;
    expect(step0Content).toContain('system1');
    expect(step0Content).not.toContain('system2');
    expect(step0Content).toContain('var1');
    expect(step0Content).not.toContain('var2');

    // Check step 1 - should have ALL systems and variables (filters reset)
    const step1SystemMsg = steps[1].input.prompt?.find((msg: any) => msg.role === 'system');
    const step1Content = step1SystemMsg?.content as string;
    expect(step1Content).toContain('system1');
    expect(step1Content).toContain('system2'); // Should be included - filters reset!
    expect(step1Content).toContain('var1');
    expect(step1Content).toContain('var2'); // Should be included - filters reset!

    expect(steps).toMatchSnapshot();
  });

  it('should provide correct system object to hooks', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    // Define multiple systems
    prompt.defSystem('role', 'You are a helpful assistant.');
    prompt.defSystem('guidelines', 'Be concise and clear.');
    prompt.defSystem('expertise', 'Expert in TypeScript.');

    let receivedSystem: Record<string, string> | undefined;

    prompt.defHook(({ system }) => {
      // Capture the system object
      receivedSystem = system;
      return {};
    });

    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    // Verify the hook received the correct system object
    expect(receivedSystem).toBeDefined();
    expect(receivedSystem).toEqual({
      role: 'You are a helpful assistant.',
      guidelines: 'Be concise and clear.',
      expertise: 'Expert in TypeScript.'
    });
  });

  it('should provide correct variables object to hooks', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    // Define various types of variables
    prompt.def('userName', 'Alice');
    prompt.def('userRole', 'developer');
    prompt.defData('config', { theme: 'dark', lang: 'en' });
    prompt.defData('settings', { notifications: true });

    let receivedVariables: Record<string, any> | undefined;

    prompt.defHook(({ variableValues }) => {
      // Capture the variables object
      receivedVariables = variableValues;
      return {};
    });

    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    // Verify the hook received the correct variables object
    expect(receivedVariables).toBeDefined();
    expect(receivedVariables).toEqual({
      userName: { type: 'string', value: 'Alice' },
      userRole: { type: 'string', value: 'developer' },
      config: { type: 'data', value: { theme: 'dark', lang: 'en' } },
      settings: { type: 'data', value: { notifications: true } }
    });
  });

  it('should handle empty activeSystems array (exclude all systems)', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    prompt.defSystem('role', 'You are a helpful assistant.');
    prompt.defSystem('guidelines', 'Be concise.');
    prompt.def('userName', 'Alice');

    prompt.defHook(() => {
      return {
        activeSystems: [] // Empty array should exclude all systems
      };
    });

    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    const steps = prompt.steps;
    const systemMsg = steps[0].input.prompt?.find((msg: any) => msg.role === 'system');
    const systemContent = systemMsg?.content as string;

    // No system parts should be included
    expect(systemContent).not.toContain('<role>');
    expect(systemContent).not.toContain('<guidelines>');
    expect(systemContent).not.toContain('You are a helpful assistant');

    // But variables should still be there
    expect(systemContent).toContain('<userName>');
    expect(systemContent).toContain('Alice');
  });

  it('should handle empty activeVariables array (exclude all variables)', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    prompt.defSystem('role', 'You are a helpful assistant.');
    prompt.def('userName', 'Alice');
    prompt.def('userRole', 'developer');

    prompt.defHook(() => {
      return {
        activeVariables: [] // Empty array should exclude all variables
      };
    });

    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    const steps = prompt.steps;
    const systemMsg = steps[0].input.prompt?.find((msg: any) => msg.role === 'system');
    expect(systemMsg).toBeDefined();
    const systemContent = systemMsg?.content as string;
    expect(systemContent).toBeDefined();

    // System parts should still be included
    expect(systemContent).toContain('<role>');
    expect(systemContent).toContain('You are a helpful assistant');

    // But no variables should be there
    expect(systemContent).not.toContain('<userName>');
    expect(systemContent).not.toContain('<userRole>');
    expect(systemContent).not.toContain('Alice');
    expect(systemContent).not.toContain('developer');
  });

  it('should silently ignore non-existent system names in activeSystems', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    prompt.defSystem('role', 'You are a helpful assistant.');
    prompt.defSystem('guidelines', 'Be concise.');

    prompt.defHook(() => {
      return {
        // Include valid and invalid system names
        activeSystems: ['role', 'nonexistent', 'anotherFake']
      };
    });

    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    const steps = prompt.steps;
    const systemMsg = steps[0].input.prompt?.find((msg: any) => msg.role === 'system');
    expect(systemMsg).toBeDefined();
    const systemContent = systemMsg?.content as string;
    expect(systemContent).toBeDefined();

    // Only the valid system should be included
    expect(systemContent).toContain('<role>');
    expect(systemContent).toContain('You are a helpful assistant');
    expect(systemContent).not.toContain('<guidelines>');
    expect(systemContent).not.toContain('Be concise');

    // Non-existent names should just be ignored (no error)
    expect(systemContent).not.toContain('nonexistent');
    expect(systemContent).not.toContain('anotherFake');
  });

  it('should silently ignore non-existent variable names in activeVariables', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    prompt.def('userName', 'Alice');
    prompt.def('userRole', 'developer');

    prompt.defHook(() => {
      return {
        // Include valid and invalid variable names
        activeVariables: ['userName', 'nonexistent', 'fakeVar']
      };
    });

    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    const steps = prompt.steps;
    const systemMsg = steps[0].input.prompt?.find((msg: any) => msg.role === 'system');
    const systemContent = systemMsg?.content as string;

    // Only the valid variable should be included
    expect(systemContent).toContain('<userName>');
    expect(systemContent).toContain('Alice');
    expect(systemContent).not.toContain('<userRole>');
    expect(systemContent).not.toContain('developer');

    // Non-existent names should just be ignored (no error)
    expect(systemContent).not.toContain('nonexistent');
    expect(systemContent).not.toContain('fakeVar');
  });

  it('should allow using DefHookResult type for type-safe hooks', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    prompt.defSystem('role', 'You are a helpful assistant.');
    prompt.def('userName', 'Alice');

    // Type-safe hook function using DefHookResult
    const typedHook = ({ stepNumber, system, variables }: {
      stepNumber: number;
      system: Record<string, string>;
      variables: Record<string, any>;
    }): import('./Prompt').DefHookResult => {
      // TypeScript should validate this return type
      return {
        activeSystems: ['role'],
        activeVariables: ['userName'],
        activeTools: undefined, // Optional fields
        system: undefined,
        messages: undefined,
        variables: undefined
      };
    };

    prompt.defHook(typedHook);
    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    const steps = prompt.steps;
    expect(steps.length).toBeGreaterThan(0);

    // Verify the hook was applied
    const systemMsg = steps[0].input.prompt?.find((msg: any) => msg.role === 'system');
    const systemContent = systemMsg?.content as string;
    expect(systemContent).toContain('<role>');
    expect(systemContent).toContain('<userName>');
  });

  it('should handle multiple hooks with conflicting filters (last one wins)', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    prompt.defSystem('system1', 'First system');
    prompt.defSystem('system2', 'Second system');
    prompt.defSystem('system3', 'Third system');

    // First hook filters to system1 and system2
    prompt.defHook(() => {
      return {
        activeSystems: ['system1', 'system2']
      };
    });

    // Second hook filters to only system3
    // This should override the first hook's activeSystems
    prompt.defHook(() => {
      return {
        activeSystems: ['system3']
      };
    });

    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    const steps = prompt.steps;
    const systemMsg = steps[0].input.prompt?.find((msg: any) => msg.role === 'system');
    expect(systemMsg).toBeDefined();
    const systemContent = systemMsg?.content as string;
    expect(systemContent).toBeDefined();

    // Only system3 should be included (second hook wins)
    expect(systemContent).not.toContain('system1');
    expect(systemContent).not.toContain('system2');
    expect(systemContent).toContain('system3');
    expect(systemContent).toContain('Third system');
  });

  it('should preserve variable modifications across hooks in same step', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    prompt.def('original', 'value1');

    // First hook adds a variable
    prompt.defHook(() => {
      return {
        variables: {
          added: { type: 'string', value: 'value2' }
        }
      };
    });

    // Second hook should see both variables
    let secondHookVariables: Record<string, any> | undefined;
    prompt.defHook(({ variableValues }) => {
      secondHookVariables = variableValues;
      return {};
    });

    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    // Second hook should have seen both variables
    expect(secondHookVariables).toBeDefined();
    expect(secondHookVariables!.original).toEqual({ type: 'string', value: 'value1' });
    expect(secondHookVariables!.added).toEqual({ type: 'string', value: 'value2' });

    // Both variables should appear in the system prompt
    const steps = prompt.steps;
    const systemMsg = steps[0].input.prompt?.find((msg: any) => msg.role === 'system');
    const systemContent = systemMsg?.content as string;
    expect(systemContent).toContain('<original>');
    expect(systemContent).toContain('value1');
    expect(systemContent).toContain('<added>');
    expect(systemContent).toContain('value2');
  });

  it('should pass arrays of system, variable, and tool names to hooks', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    // Define systems, variables, and tools
    prompt.defSystem('role', 'You are a helpful assistant.');
    prompt.defSystem('guidelines', 'Be concise.');
    prompt.defSystem('expertise', 'Expert in TypeScript.');

    prompt.def('userName', 'Alice');
    prompt.def('userRole', 'developer');
    prompt.defData('config', { theme: 'dark' });

    const searchFn = vi.fn().mockResolvedValue({ results: [] });
    const calcFn = vi.fn().mockResolvedValue({ result: 0 });
    prompt.defTool('search', 'Search tool', z.object({ query: z.string() }), searchFn);
    prompt.defTool('calculator', 'Calculator tool', z.object({ expr: z.string() }), calcFn);

    let receivedSystems: string[] | undefined;
    let receivedVariables: string[] | undefined;
    let receivedTools: string[] | undefined;

    prompt.defHook(({ systems, variables, tools }) => {
      // Capture the name arrays
      receivedSystems = systems;
      receivedVariables = variables;
      receivedTools = tools;
      return {};
    });

    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    // Verify the arrays were passed correctly
    expect(receivedSystems).toBeDefined();
    expect(receivedVariables).toBeDefined();
    expect(receivedTools).toBeDefined();

    // Check system names array
    expect(receivedSystems).toEqual(expect.arrayContaining(['role', 'guidelines', 'expertise']));
    expect(receivedSystems?.length).toBe(3);

    // Check variable names array
    expect(receivedVariables).toEqual(expect.arrayContaining(['userName', 'userRole', 'config']));
    expect(receivedVariables?.length).toBe(3);

    // Check tool names array
    expect(receivedTools).toEqual(expect.arrayContaining(['search', 'calculator']));
    expect(receivedTools?.length).toBe(2);
  });

  it('should allow filtering based on name arrays', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Response' }
    ]);

    const prompt = new Prompt(mockModel);

    prompt.defSystem('system1', 'First');
    prompt.defSystem('system2', 'Second');
    prompt.defSystem('system3', 'Third');

    prompt.def('var1', 'value1');
    prompt.def('var2', 'value2');
    prompt.def('var3', 'value3');

    // Use the name arrays to dynamically filter
    prompt.defHook(({ systems, variables }) => {
      // Include only the first 2 systems
      const firstTwoSystems = systems.slice(0, 2);
      // Include only variables that don't include '3'
      const filteredVars = variables.filter(v => !v.includes('3'));

      return {
        activeSystems: firstTwoSystems,
        activeVariables: filteredVars
      };
    });

    prompt.defMessage('user', 'Hello');

    const result = prompt.run();
    await result.text;

    const steps = prompt.steps;
    const systemMsg = steps[0].input.prompt?.find((msg: any) => msg.role === 'system');
    const systemContent = systemMsg?.content as string;

    // Should include system1 and system2, exclude system3
    expect(systemContent).toContain('system1');
    expect(systemContent).toContain('system2');
    expect(systemContent).not.toContain('system3');

    // Should include var1 and var2, exclude var3
    expect(systemContent).toContain('var1');
    expect(systemContent).toContain('var2');
    expect(systemContent).not.toContain('var3');
  });
});
