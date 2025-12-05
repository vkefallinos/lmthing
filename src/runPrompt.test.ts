import { describe, it, expect, vi } from 'vitest';
import { runPrompt } from './runPrompt';
import { createMockModel } from './test/createMockModel';
import { Prompt } from './Prompt';
import { z } from 'zod';
import { stepCountIs } from 'ai';

describe('runPrompt', () => {
  it('should execute a complete prompt workflow with all features', async () => {
    // Create a sophisticated mock model that simulates a real AI workflow
    const mockModel = createMockModel([
      { type: 'text', text: 'I understand you need help with weather and calculations.' },
      {
        type: 'tool-call',
        toolCallId: 'call_weather',
        toolName: 'getWeather',
        args: { city: 'San Francisco', unit: 'celsius' }
      },
      { type: 'text', text: 'The weather is 18°C. Let me calculate the Fahrenheit equivalent.' },
      {
        type: 'tool-call',
        toolCallId: 'call_convert',
        toolName: 'convertTemperature',
        args: { celsius: 18 }
      },
      { type: 'text', text: 'That is 64.4°F. Have a great day!' }
    ]);

    // Mock tool implementations
    const weatherTool = vi.fn(async ({ city, unit }: { city: string; unit: string }) => {
      return {
        temperature: 18,
        condition: 'Partly cloudy',
        humidity: 65
      };
    });

    const convertTool = vi.fn(async ({ celsius }: { celsius: number }) => {
      return {
        fahrenheit: 64.4
      };
    });

    // Execute the prompt with options
    const { result, prompt } = await runPrompt(
      async ({ defSystem, def, defData, defTool, defMessage, defHook, $ }) => {

      // 1. Define system instructions
      defSystem('role', 'You are a helpful weather and math assistant.');
      defSystem('guidelines', 'Always be precise with temperature conversions.');

      // 2. Define string variables
      const cityPlaceholder = def('city', 'San Francisco');
      const unitPlaceholder = def('unit', 'celsius');

      // 3. Define data variables (structured data)
      const configPlaceholder = defData('config', {
        precision: 1,
        includeHumidity: true,
        preferredUnit: 'metric'
      });

      // 4. Define tools
      defTool(
        'getWeather',
        'Get current weather for a city',
        z.object({
          city: z.string().describe('The city name'),
          unit: z.enum(['celsius', 'fahrenheit']).describe('Temperature unit')
        }),
        weatherTool
      );

      defTool(
        'convertTemperature',
        'Convert temperature from Celsius to Fahrenheit',
        z.object({
          celsius: z.number().describe('Temperature in Celsius')
        }),
        convertTool
      );

      // 5. Add user message with placeholders
      defMessage(
        'user',
        `What's the weather in ${cityPlaceholder} in ${unitPlaceholder}? ` +
        `Convert it to the other unit. My config is ${configPlaceholder}.`
      );

      // 6. Define a hook to modify behavior during execution
      defHook(({ messages, stepNumber, variables }) => {
        // Log or modify based on step
        if (stepNumber === 1) {
          // Could add a message or modify tools on first step
          return {
            activeTools: ['getWeather', 'convertTemperature']
          };
        }

        return {};
      });
      $`Please provide the weather details and conversion.`;
    }, 
    {
      model: mockModel,
      options: {
        stopWhen: stepCountIs(10),
      }
    });

    // Await the text to ensure execution completes
    const text = await result.text;
    
    // Verify the workflow executed correctly
    
    // 1. Check that tools were called with correct arguments
    expect(weatherTool).toHaveBeenCalled();
    expect(weatherTool).toHaveBeenCalledWith(
      { city: 'San Francisco', unit: 'celsius' },
      expect.anything()
    );
    
    expect(convertTool).toHaveBeenCalled();
    expect(convertTool).toHaveBeenCalledWith(
      { celsius: 18 },
      expect.anything()
    );

    // 2. Verify the result contains expected text responses
    // Note: result.text only contains the final step's text
    expect(text).toContain('64.4°F');
    expect(text).toContain('great day');

    // 3. Verify steps were executed (using the result's internal steps property)
    // This is a Prompt instance, so we access steps directly
    const steps = prompt.steps;
    expect(steps).toMatchSnapshot();
    expect(steps.length).toBeGreaterThanOrEqual(2); // Should have multiple steps with tool calls

    // 4. Verify tool calls occurred in the steps
    // Tool calls are recorded in the steps' output.content
    const allToolCallsInSteps = steps.flatMap((step: any) => 
      step.output?.content?.filter((c: any) => c.type === 'tool-call') || []
    );
    expect(allToolCallsInSteps.length).toBeGreaterThanOrEqual(2);

    // 5. Check that the first step has the system prompt with variables
    const firstStep = steps[0];
    expect(firstStep.input.prompt).toBeDefined();
    const systemMessage = firstStep.input.prompt?.find((msg: any) => msg.role === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage?.content).toContain('<variables>');
    expect(systemMessage?.content).toContain('<city>');
    expect(systemMessage?.content).toContain('San Francisco');
    expect(systemMessage?.content).toContain('<config>');

    // 6. Check usage information
    const usage = await result.usage;
    expect(usage).toBeDefined();
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });

  it('should handle errors gracefully when prompt function throws', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'This will not be reached.' }
    ]);

    const failingPromptFunction = async (prompt: Prompt) => {
      throw new Error('Prompt setup failed');
    };

    const config = { model: mockModel };

    await expect(runPrompt(failingPromptFunction, config)).rejects.toThrow('Prompt setup failed');
  });

  it('should work with minimal configuration', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Simple response without tools.' }
    ]);

    const simplePromptFunction = async (prompt: Prompt) => {
      prompt.defMessage('user', 'Hello, world!');
    };

    const config = { model: mockModel };

    const {result} = await runPrompt(simplePromptFunction, config);

    const text = await result.text;
    expect(text).toBe('Simple response without tools.');
    
    const toolCalls = await result.toolCalls;
    expect(toolCalls).toHaveLength(0);
    
    const toolResults = await result.toolResults;
    expect(toolResults).toHaveLength(0);
  });

  it('should support defAgent for creating hierarchical agent workflows', async () => {
    // Main orchestrator model
    const orchestratorModel = createMockModel([
      { type: 'text', text: 'I will coordinate with specialized agents to solve this.' },
      {
        type: 'tool-call',
        toolCallId: 'call_validator',
        toolName: 'validationAgent',
        args: { data: { email: 'test@example.com', age: 25 } }
      },
      { type: 'text', text: 'Validation complete. Now processing...' },
      {
        type: 'tool-call',
        toolCallId: 'call_processor',
        toolName: 'processingAgent',
        args: { operation: 'transform', input: 'validated_data' }
      },
      { type: 'text', text: 'All agent tasks completed successfully!' }
    ]);

    // Validation agent model (different behavior)
    const validationModel = createMockModel([
      { type: 'text', text: 'Validating email format...' },
      { type: 'text', text: 'Validating age range...' },
      { type: 'text', text: 'All validations passed.' }
    ]);

    // Processing agent model (different behavior)
    const processingModel = createMockModel([
      { type: 'text', text: 'Starting transformation process...' },
      { type: 'text', text: 'Data transformed successfully.' }
    ]);

    const validationAgentSpy = vi.fn(async ({ data }: any, agentPrompt: Prompt) => {
      agentPrompt.defSystem('role', 'You are a data validation specialist.');
      const dataVar = agentPrompt.defData('inputData', data);
      agentPrompt.$`Validate the following data: ${dataVar}`;
    });

    const processingAgentSpy = vi.fn(async ({ operation, input }: any, agentPrompt: Prompt) => {
      agentPrompt.defSystem('role', 'You are a data processing specialist.');
      agentPrompt.defSystem('capabilities', 'Transform, filter, and aggregate data.');
      const opVar = agentPrompt.def('operation', operation);
      const inputVar = agentPrompt.def('inputSource', input);
      agentPrompt.$`Execute ${opVar} on ${inputVar}`;
    });

    const { result, prompt } = await runPrompt(
      async ({ defSystem, defAgent, defMessage, $ }) => {
        defSystem('role', 'You are an orchestrator AI that coordinates multiple specialist agents.');

        // Define validation agent with its own model
        defAgent(
          'validationAgent',
          'Validates data integrity and format',
          z.object({
            data: z.any().describe('The data to validate')
          }),
          validationAgentSpy,
          { model: validationModel, maxSteps: 3 }
        );

        // Define processing agent with a different model
        defAgent(
          'processingAgent',
          'Processes and transforms data',
          z.object({
            operation: z.string().describe('The operation to perform'),
            input: z.string().describe('The input data reference')
          }),
          processingAgentSpy,
          { model: processingModel, maxSteps: 2 }
        );

        defMessage('user', 'Please validate and process user data for the new signup.');
        $`Coordinate the validation and processing agents to handle this request.`;
      },
      { model: orchestratorModel }
    );

    const text = await result.text;

    // Verify both agents were called
    expect(validationAgentSpy).toHaveBeenCalled();
    expect(validationAgentSpy).toHaveBeenCalledWith(
      { data: { email: 'test@example.com', age: 25 } },
      expect.any(Prompt)
    );

    expect(processingAgentSpy).toHaveBeenCalled();
    expect(processingAgentSpy).toHaveBeenCalledWith(
      { operation: 'transform', input: 'validated_data' },
      expect.any(Prompt)
    );

    // Verify each agent received a Prompt instance
    const validationPromptArg = validationAgentSpy.mock.calls[0][1];
    const processingPromptArg = processingAgentSpy.mock.calls[0][1];
    expect(validationPromptArg).toBeInstanceOf(Prompt);
    expect(processingPromptArg).toBeInstanceOf(Prompt);

    // Verify the orchestrator completed successfully
    expect(text).toContain('completed successfully');

    // Verify the workflow structure
    const steps = prompt.steps;
    expect(steps).toMatchSnapshot();
    expect(steps.length).toBeGreaterThanOrEqual(2);

    // Verify both agent tool calls are in the steps
    const agentToolCalls = steps.flatMap((step: any) =>
      step.output?.content?.filter((c: any) =>
        c.type === 'tool-call' && 
        (c.toolName === 'validationAgent' || c.toolName === 'processingAgent')
      ) || []
    );
    expect(agentToolCalls.length).toBe(2);
  });
});
