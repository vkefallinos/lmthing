import { PrepareStepOptions, StreamTextBuilder } from "./StreamText";
import yaml from 'js-yaml';
import { z } from 'zod';
import { type ModelInput } from "./providers/resolver";
import {
  PromptContext,
  LastToolInfo,
  StepModifier,
  StepModifications,
  Plugin,
  ToolOptions,
  AgentOptions
} from './types';
import { StateManager } from './state';
import { EffectsManager } from './effects';
import { DefinitionTracker } from './definitions';
import { createToolCollection, createSystemCollection, createVariableCollection } from './collections';

/**
 * Definition for a sub-tool used within a composite tool.
 */
export interface SubToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  execute: Function;
  options?: ToolOptions;
}

/**
 * Helper function to create a sub-tool definition for use with defTool arrays.
 *
 * @example
 * defTool('file', 'File operations', [
 *   tool('write', 'Write to file', z.object({ path: z.string(), content: z.string() }), writeFile),
 *   tool('append', 'Append to file', z.object({ path: z.string(), content: z.string() }), appendFile),
 * ]);
 *
 * @example
 * // With response schema and callbacks
 * tool('calculate', 'Calculate numbers', z.object({ a: z.number(), b: z.number() }), calculateFn, {
 *   responseSchema: z.object({ result: z.number() }),
 *   onSuccess: async (input, output) => { console.log('Success:', output); return undefined; }
 * })
 */
export function tool(
  name: string,
  description: string,
  inputSchema: z.ZodType<any>,
  execute: Function,
  options?: ToolOptions
): SubToolDefinition {
  return { name, description, inputSchema, execute, options };
}

/**
 * Definition for a sub-agent used within a composite agent.
 */
export interface SubAgentDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  execute: Function;
  options?: AgentOptions;
}

/**
 * Helper function to create a sub-agent definition for use with defAgent arrays.
 *
 * @example
 * defAgent('specialists', 'Specialist agents', [
 *   agent('researcher', 'Research topics', z.object({ topic: z.string() }), researchFn, { model: 'openai:gpt-4o' }),
 *   agent('analyst', 'Analyze data', z.object({ data: z.string() }), analyzeFn),
 * ]);
 *
 * @example
 * // With response schema
 * agent('analyst', 'Analyze data', z.object({ data: z.string() }), analyzeFn, {
 *   responseSchema: z.object({ summary: z.string(), score: z.number() })
 * })
 */
export function agent(
  name: string,
  description: string,
  inputSchema: z.ZodType<any>,
  execute: Function,
  options?: AgentOptions
): SubAgentDefinition {
  return { name, description, inputSchema, execute, options };
}

/**
 * Result object for step modifications via prepareStep hooks.
 * Used by defEffect with stepModifier to modify step behavior.
 *
 * @property system - Override the system prompt for this step
 * @property activeTools - Limit which tools are available for this step
 * @property activeSystems - Filter which system parts to include (by name)
 * @property activeVariables - Filter which variables to include (by name)
 * @property messages - Override or modify the messages array
 * @property variables - Add or update variables (will be merged with existing)
 */
export interface DefHookResult {
  system ?: string;
  activeTools ?: string[];
  activeSystems ?: string[];
  activeVariables ?: string[];
  messages ?: any[];
  variables ?: Record<string, any>;
}

/**
 * StatefulPrompt extends StreamTextBuilder with React-like hooks functionality
 *
 * This class implements all base Prompt functionality plus:
 * - defState: For managing state across prompt re-executions
 * - defEffect: For running effects based on dependency changes
 * - Re-execution of promptFn on each step
 * - Definition reconciliation
 */
export class StatefulPrompt extends StreamTextBuilder {
  protected variables: Record<string, {
    type: 'string' | 'data';
    value: any;

  }> = {};
  protected systems: Record<string, string> = {};
  protected activeSystems?: string[];
  protected activeVariables?: string[];
  protected activeTools?: string[];
  protected _remindedItems: Array<{ type: 'def' | 'defData' | 'defSystem' | 'defTool' | 'defAgent', name: string }> = [];
  protected _definitionsToDisable?: Set<{ type: string; name: string }>;

  // Stateful properties
  private _stateManager = new StateManager();
  private _effectsManager = new EffectsManager();
  private _definitionTracker = new DefinitionTracker();
  private _promptFn?: (args: any) => any;
  private _stepModifications: StepModifications = {};
  private _lastTool: LastToolInfo | null = null;
  private _executedOnce: boolean = false;

  // Plugin support
  private _plugins: readonly Plugin[] = [];
  private _boundPluginMethods: Record<string, Function> = {};

  /**
   * Factory method to create a StatefulPrompt instance.
   */
  static create(model: ModelInput): StatefulPrompt {
    return new StatefulPrompt(model);
  }

  constructor(model: ModelInput) {
    super(model);
  }

  /**
   * Set the prompt function for re-execution
   */
  setPromptFn(fn: (args: any) => any): void {
    this._promptFn = fn;
  }

  /**
   * Set plugins for this prompt instance.
   * Plugin methods will be bound to this instance and available during re-execution.
   *
   * @param plugins - Array of plugin objects containing methods to bind
   */
  setPlugins(plugins: readonly Plugin[]): void {
    this._plugins = plugins;
    this._boundPluginMethods = {};

    // Pre-bind all plugin methods to this instance
    for (const plugin of plugins) {
      for (const [methodName, method] of Object.entries(plugin)) {
        if (typeof method === 'function') {
          this._boundPluginMethods[methodName] = method.bind(this);
        }
      }
    }
  }

  /**
   * Define state that persists across prompt re-executions
   *
   * @param key - Unique identifier for the state
   * @param initialValue - Initial value for the state
   * @returns Tuple of [stateProxy, setterFunction]
   */
  defState<T>(key: string, initialValue: T): [T, (newValue: T | ((prev: T) => T)) => void] {
    return this._stateManager.createStateAccessor(key, initialValue);
  }

  /**
   * Define an effect that runs based on dependency changes
   *
   * @param callback - Function to run when dependencies change
   * @param dependencies - Optional array of dependencies to track
   */
  defEffect(
    callback: (prompt: PromptContext, step: StepModifier) => void,
    dependencies?: any[]
  ): void {
    this._effectsManager.register(callback, dependencies);
  }

  private createProxy(tag: string, type: 'def' | 'defData' | 'defSystem' | 'defTool' | 'defAgent', name: string) {
    const self = this;
    const handler = {
      get(_target: any, prop: string | symbol) {
        if (prop === 'value') {
          return tag;
        }
        if (prop === 'remind') {
          return () => {
            self._remindedItems.push({ type, name });
            return tag;
          };
        }
        if (prop === 'disable') {
          return () => {
            // This should only be called within a defEffect
            // Mark this definition to be disabled for the next step
            if (!self._definitionsToDisable) {
              self._definitionsToDisable = new Set();
            }
            self._definitionsToDisable.add({ type, name });
            return tag;
          };
        }
        if (prop === 'toString' || prop === 'valueOf') {
          return () => tag;
        }
        if (typeof prop === 'symbol' && prop === Symbol.toPrimitive) {
          return () => tag;
        }
        return tag;
      },
      has(_target: any, prop: string | symbol) {
        return prop === 'value' || prop === 'remind' || prop === 'disable' || prop === 'toString' || prop === 'valueOf' || prop === Symbol.toPrimitive;
      },
      ownKeys() {
        return ['value', 'remind', 'disable'];
      },
      getOwnPropertyDescriptor(_target: any, prop: string) {
        if (prop === 'value') {
          return { enumerable: true, configurable: true, value: tag };
        }
        if (prop === 'remind') {
          return { enumerable: true, configurable: true, value: () => {
            self._remindedItems.push({ type, name });
            return tag;
          }};
        }
        if (prop === 'disable') {
          return { enumerable: true, configurable: true, value: () => {
            // This should only be called within a defEffect
            // Mark this definition to be disabled for the next step
            if (!self._definitionsToDisable) {
              self._definitionsToDisable = new Set();
            }
            self._definitionsToDisable.add({ type, name });
            return tag;
          }};
        }
        return undefined;
      }
    };
    return new Proxy({}, handler);
  }

  protected addVariable(name: string, value: any, type: 'string' | 'data') {
    this.variables[name] = { type, value };
  }

  protected addSystemPart(name: string, part: string): void {
    this.systems[name] = part;
  }

  def(name: string, value: string) {
    this._definitionTracker.mark('def', name);
    this.addVariable(name, value, 'string');
    const tag = `<${name}>`;
    return this.createProxy(tag, 'def', name);
  }

  defData(name: string, value: any) {
    this._definitionTracker.mark('defData', name);
    this.addVariable(name, value, 'data');
    const tag = `<${name}>`;
    return this.createProxy(tag, 'defData', name);
  }

  defSystem(name: string, value: string) {
    this._definitionTracker.mark('defSystem', name);
    this.addSystemPart(name, value);
    const tag = `<${name}>`;
    return this.createProxy(tag, 'defSystem', name);
  }

  defMessage(role: 'user' | 'assistant', content: string) {
    // Prevent duplicate user messages
    if (role === 'user' && this._executedOnce) {
      return undefined;
    }
    this.addMessage({ role, content });
  }

  /**
   * Define a tool for the LLM to use.
   *
   * @overload Single tool: defTool(name, description, inputSchema, execute, options?)
   * @overload Composite tool: defTool(name, description, subTools[])
   *
   * When an array of sub-tools is provided, creates a composite tool that allows
   * the LLM to invoke multiple sub-tools in a single tool call.
   *
   * @example
   * // Single tool
   * defTool('search', 'Search the web', z.object({ query: z.string() }), searchFn);
   *
   * // Single tool with response schema and callbacks
   * defTool('calculate', 'Calculate numbers', z.object({ a: z.number(), b: z.number() }), calculateFn, {
   *   responseSchema: z.object({ result: z.number() }),
   *   onSuccess: async (input, output) => { console.log('Success'); return undefined; }
   * });
   *
   * // Composite tool
   * defTool('file', 'File operations', [
   *   tool('write', 'Write to file', z.object({ path: z.string(), content: z.string() }), writeFn),
   *   tool('read', 'Read a file', z.object({ path: z.string() }), readFn),
   * ]);
   */
  defTool(name: string, description: string, inputSchemaOrSubTools: any, execute?: Function, options?: ToolOptions) {
    this._definitionTracker.mark('defTool', name);
    // Check if this is a composite tool (array of sub-tools)
    if (Array.isArray(inputSchemaOrSubTools)) {
      const subTools = inputSchemaOrSubTools as SubToolDefinition[];
      this._registerCompositeTool(name, description, subTools);
    } else {
      // Standard single tool with options support
      const wrappedExecute = options ? this._wrapToolExecute(execute!, options) : execute;
      this.addTool(name, { description, inputSchema: inputSchemaOrSubTools, execute: wrappedExecute });
    }
    const tag = `<${name}>`;
    return this.createProxy(tag, 'defTool', name);
  }

  /**
   * Wraps a tool's execute function to handle callbacks and response schema.
   */
  protected _wrapToolExecute(execute: Function, options: ToolOptions): Function {
    return async (input: any, toolOptions?: any) => {
      try {
        // Call beforeCall hook if present
        if (options.beforeCall) {
          const beforeResult = await options.beforeCall(input, undefined);
          // If hook returns undefined, continue with normal execution
          // Otherwise, return the hook result
          if (beforeResult !== undefined) {
            return this._formatToolOutput(beforeResult, options);
          }
        }

        // Execute the tool
        let output = await execute(input, toolOptions);

        // Call onSuccess hook if present
        if (options.onSuccess) {
          const successResult = await options.onSuccess(input, output);
          // If hook returns undefined, use original output
          // Otherwise, use the returned value
          if (successResult !== undefined) {
            output = successResult;
          }
        }

        // Format output according to responseSchema if present
        output = this._formatToolOutput(output, options);
        return output;
      } catch (error: any) {
        let errorOutput: any = { error: error.message || String(error) };

        // Call onError hook if present
        if (options.onError) {
          const errorResult = await options.onError(input, errorOutput);
          // If hook returns undefined, use original error output
          // Otherwise, use the returned value
          if (errorResult !== undefined) {
            errorOutput = errorResult;
          }
        }

        errorOutput = this._formatToolOutput(errorOutput, options);
        return errorOutput;
      }
    };
  }

  /**
   * Creates and registers a composite tool from an array of sub-tool definitions.
   */
  protected _registerCompositeTool(name: string, description: string, subTools: SubToolDefinition[]) {
    // Build the discriminated union schema for calls
    // Each call is: { name: 'subToolName', args: { ...subToolArgs } }
    const callSchemas = subTools.map(subTool => {
      return z.object({
        name: z.literal(subTool.name).describe(`Call the "${subTool.name}" sub-tool`),
        args: subTool.inputSchema.describe(subTool.description)
      });
    });

    // Create the composite input schema
    const compositeSchema = z.object({
      calls: z.array(z.union(callSchemas as any as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]))
        .describe('Array of sub-tool calls to execute')
    });

    // Build enhanced description with sub-tool documentation
    const subToolDocs = subTools.map(st => `  - ${st.name}: ${st.description}`).join('\n');
    const enhancedDescription = `${description}\n\nAvailable sub-tools:\n${subToolDocs}`;

    // Create the composite execute function
    const compositeExecute = async (args: { calls: Array<{ name: string; args: any }> }, options?: any) => {
      const results: Array<{ name: string; result: any }> = [];

      for (const call of args.calls) {
        const subTool = subTools.find(st => st.name === call.name);
        if (!subTool) {
          results.push({
            name: call.name,
            result: { error: `Unknown sub-tool: ${call.name}` }
          });
          continue;
        }

        try {
          // Call beforeCall hook if present
          if (subTool.options?.beforeCall) {
            const beforeResult = await subTool.options.beforeCall(call.args, undefined);
            // If hook returns undefined, continue with normal execution
            // Otherwise, use the returned value
            if (beforeResult !== undefined) {
              results.push({ name: call.name, result: this._formatToolOutput(beforeResult, subTool.options) });
              continue;
            }
          }

          // Execute the sub-tool
          let result = await subTool.execute(call.args, options);

          // Call onSuccess hook if present
          if (subTool.options?.onSuccess) {
            const successResult = await subTool.options.onSuccess(call.args, result);
            // If hook returns undefined, use original result
            // Otherwise, use the returned value
            if (successResult !== undefined) {
              result = successResult;
            }
          }

          // Format output according to responseSchema if present
          result = this._formatToolOutput(result, subTool.options);
          results.push({ name: call.name, result });
        } catch (error: any) {
          let result: any = { error: error.message || String(error) };

          // Call onError hook if present
          if (subTool.options?.onError) {
            const errorResult = await subTool.options.onError(call.args, result);
            // If hook returns undefined, use original error result
            // Otherwise, use the returned value
            if (errorResult !== undefined) {
              result = errorResult;
            }
          }

          result = this._formatToolOutput(result, subTool.options);
          results.push({ name: call.name, result });
        }
      }

      return { results };
    };

    this.addTool(name, {
      description: enhancedDescription,
      inputSchema: compositeSchema,
      execute: compositeExecute
    });
  }

  /**
   * Format tool output according to responseSchema if present.
   * If output is an object and responseSchema exists, stringify it (or return as-is).
   * Otherwise return as-is.
   */
  protected _formatToolOutput(output: any, options?: ToolOptions): any {
    if (!options?.responseSchema) {
      return output;
    }

    // If output is an object/array, keep it as-is (will be stringified by AI SDK if needed)
    // The responseSchema is primarily for validation/documentation
    if (typeof output === 'object' && output !== null) {
      return output;
    }

    return output;
  }

  /**
   * Creates instruction text for response schema in agent system prompts.
   * Converts a Zod schema into a human-readable format description.
   */
  protected _createResponseSchemaInstruction(schema: z.ZodType<any>): string {
    try {
      // Try to get the schema description from Zod
      const schemaJson = this._zodToJsonSchema(schema);
      const formattedSchema = JSON.stringify(schemaJson, null, 2);

      return `You must respond with a valid JSON object that matches this schema:

${formattedSchema}

Return only the JSON object in your response, without any additional text or explanation.`;
    } catch (error) {
      // Fallback if schema parsing fails
      return 'You must respond with a valid JSON object that matches the expected schema.';
    }
  }

  /**
   * Converts a Zod schema to a simplified JSON schema representation.
   */
  protected _zodToJsonSchema(schema: z.ZodType<any>): any {
    // Basic conversion - handles common Zod types
    if (schema instanceof z.ZodObject) {
      const shape = schema._def.shape();
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this._zodToJsonSchema(value as z.ZodType<any>);
        // Check if field is not optional
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined
      };
    } else if (schema instanceof z.ZodString) {
      return { type: 'string', description: schema.description };
    } else if (schema instanceof z.ZodNumber) {
      return { type: 'number', description: schema.description };
    } else if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean', description: schema.description };
    } else if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this._zodToJsonSchema(schema._def.type)
      };
    } else if (schema instanceof z.ZodOptional) {
      return this._zodToJsonSchema(schema._def.innerType);
    } else if (schema instanceof z.ZodNullable) {
      return { ...this._zodToJsonSchema(schema._def.innerType), nullable: true };
    } else {
      // Fallback for unknown types
      return { type: 'any' };
    }
  }

  /**
   * Define an agent for the LLM to delegate tasks to.
   *
   * @overload Single agent: defAgent(name, description, inputSchema, execute, options)
   * @overload Composite agent: defAgent(name, description, subAgents[])
   *
   * When an array of sub-agents is provided, creates a composite agent that allows
   * the LLM to invoke multiple sub-agents in a single tool call.
   *
   * @example
   * // Single agent
   * defAgent('researcher', 'Research topics', z.object({ topic: z.string() }), researchFn);
   *
   * // Single agent with response schema
   * defAgent('analyst', 'Analyze data', z.object({ data: z.string() }), analyzeFn, {
   *   responseSchema: z.object({ summary: z.string(), score: z.number() }),
   *   system: 'You are a data analyst.'
   * });
   *
   * // Composite agent
   * defAgent('specialists', 'Specialist agents', [
   *   agent('researcher', 'Research topics', z.object({ topic: z.string() }), researchFn),
   *   agent('analyst', 'Analyze data', z.object({ data: z.string() }), analyzeFn),
   * ]);
   */
  defAgent(
    name: string,
    description: string,
    inputSchemaOrSubAgents: any,
    execute?: Function,
    options: AgentOptions = {}
  ) {
    this._definitionTracker.mark('defAgent', name);
    // Check if this is a composite agent (array of sub-agents)
    if (Array.isArray(inputSchemaOrSubAgents)) {
      const subAgents = inputSchemaOrSubAgents as SubAgentDefinition[];
      this._registerCompositeAgent(name, description, subAgents);
    } else {
      // Standard single agent
      this.addTool(name, { description, inputSchema: inputSchemaOrSubAgents, execute: async (args:any)=>{
        const { model, responseSchema, system, plugins, ...otherOptions } = options;
        const prompt = StatefulPrompt.create(model || this.getModel() as ModelInput);
        prompt.withOptions(otherOptions || this.getOptions());

        // Set plugins if provided
        if (plugins) {
          prompt.setPlugins(plugins);
        }

        // Add response schema instruction to system prompt if provided
        if (responseSchema) {
          const schemaInstruction = this._createResponseSchemaInstruction(responseSchema);
          const finalSystem = system ? `${system}\n\n${schemaInstruction}` : schemaInstruction;
          prompt.defSystem('responseFormat', finalSystem);
        } else if (system) {
          prompt.defSystem('agentSystem', system);
        }

        await execute!({ ...args}, prompt);
        const result = prompt.run();
        const lastResponse = await result.text;

        // Validate response against schema if provided
        if (responseSchema) {
          try {
            const parsedResponse = JSON.parse(lastResponse);
            responseSchema.parse(parsedResponse);
            return { response: lastResponse, steps: prompt.steps };
          } catch (error: any) {
            // If validation fails, return error information
            return {
              response: lastResponse,
              steps: prompt.steps,
              validationError: error.message || String(error)
            };
          }
        }

        return { response: lastResponse, steps: prompt.steps };
      }});
    }
    const tag = `<${name}>`;
    return this.createProxy(tag, 'defAgent', name);
  }

  /**
   * Creates and registers a composite agent from an array of sub-agent definitions.
   */
  protected _registerCompositeAgent(name: string, description: string, subAgents: SubAgentDefinition[]) {
    // Build the discriminated union schema for calls
    // Each call is: { name: 'subAgentName', args: { ...subAgentArgs } }
    const callSchemas = subAgents.map(subAgent => {
      return z.object({
        name: z.literal(subAgent.name).describe(`Delegate to the "${subAgent.name}" agent`),
        args: subAgent.inputSchema.describe(subAgent.description)
      });
    });

    // Create the composite input schema
    const compositeSchema = z.object({
      calls: z.array(z.union(callSchemas as any as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]))
        .describe('Array of sub-agent calls to execute')
    });

    // Build enhanced description with sub-agent documentation
    const subAgentDocs = subAgents.map(sa => `  - ${sa.name}: ${sa.description}`).join('\n');
    const enhancedDescription = `${description}\n\nAvailable sub-agents:\n${subAgentDocs}`;

    // Create the composite execute function
    const compositeExecute = async (args: { calls: Array<{ name: string; args: any }> }) => {
      const results: Array<{ name: string; response: string; steps?: any[]; validationError?: string }> = [];

      for (const call of args.calls) {
        const subAgent = subAgents.find(sa => sa.name === call.name);
        if (!subAgent) {
          results.push({
            name: call.name,
            response: `Error: Unknown sub-agent: ${call.name}`
          });
          continue;
        }

        try {
          const { model: agentModel, responseSchema, system, plugins, ...agentOptions } = subAgent.options || {};
          const prompt = StatefulPrompt.create(agentModel || this.getModel() as ModelInput);
          prompt.withOptions(agentOptions || this.getOptions());

          // Set plugins if provided
          if (plugins) {
            prompt.setPlugins(plugins);
          }

          // Add response schema instruction to system prompt if provided
          if (responseSchema) {
            const schemaInstruction = this._createResponseSchemaInstruction(responseSchema);
            const finalSystem = system ? `${system}\n\n${schemaInstruction}` : schemaInstruction;
            prompt.defSystem('responseFormat', finalSystem);
          } else if (system) {
            prompt.defSystem('agentSystem', system);
          }

          await subAgent.execute(call.args, prompt);
          const result = await prompt.run();
          const lastResponse = await result.text;

          // Validate response against schema if provided
          if (responseSchema) {
            try {
              const parsedResponse = JSON.parse(lastResponse);
              responseSchema.parse(parsedResponse);
              results.push({ name: call.name, response: lastResponse, steps: prompt.steps });
            } catch (error: any) {
              // If validation fails, include error information
              results.push({
                name: call.name,
                response: lastResponse,
                steps: prompt.steps,
                validationError: error.message || String(error)
              });
            }
          } else {
            results.push({ name: call.name, response: lastResponse, steps: prompt.steps });
          }
        } catch (error: any) {
          results.push({
            name: call.name,
            response: `Error: ${error.message || String(error)}`
          });
        }
      }

      return { results };
    };

    this.addTool(name, {
      description: enhancedDescription,
      inputSchema: compositeSchema,
      execute: compositeExecute
    });
  }

  $(strings: TemplateStringsArray, ...values: any[]) {
    const content = strings.reduce((acc, str, i) => {
      if (values[i] !== undefined) {
        // Check if value is a proxy with a 'value' property
        if (values[i] && typeof values[i] === 'object' && 'value' in values[i]) {
          return acc + str + values[i].value;
        }
        return acc + str + values[i];
      }
      return acc + str;
    }, '');

    // Only add user messages during the first execution
    if (!this._executedOnce) {
      this.addMessage({ role: 'user', content });
    }
  }

  run() {

    // Add hook to track last tool call
    this.addOnStepFinish(async (result: any) => {
      // Extract last tool call from result if exists
      const toolCalls = result.toolCalls;
      const toolResults = result.toolResults;

      if (toolCalls && toolCalls.length > 0) {
        const lastToolCall = toolCalls[toolCalls.length - 1];
        const lastToolResult = toolResults?.find(
          (r: any) => r.toolCallId === lastToolCall.toolCallId
        );

        this._lastTool = {
          toolName: lastToolCall.toolName,
          args: lastToolCall.input, // AI SDK uses 'input' for parsed args
          output: lastToolResult?.output ?? null
        };
      } else {
        // No tool calls in this step, keep previous value
        // (don't reset to null so effects can still access the last tool from previous step)
      }
    });

    // Set up prepare step hook
    this.setLastPrepareStep((_options: any) => {
      // Final preparation before run
      let systemParts: string[] = [];

      // Filter systems based on activeSystems if provided
      const systemEntries = Object.entries(this.systems);
      const filteredSystems = this.activeSystems
        ? systemEntries.filter(([name]) => this.activeSystems!.includes(name))
        : systemEntries;

      for (const [name, part] of filteredSystems) {
        systemParts.push(`<${name}>\n${part}\n</${name}>`);
      }
      const system = systemParts.length > 0 ? systemParts.join('\n') : undefined;

      let variableDefinitions: string[] = [];

      // Filter variables based on activeVariables if provided
      const variableEntries = Object.entries(this.variables);
      const filteredVariables = this.activeVariables
        ? variableEntries.filter(([name]) => this.activeVariables!.includes(name))
        : variableEntries;

      for (const [name, varDef] of filteredVariables) {
        if (varDef.type === 'string') {
          variableDefinitions.push(`  <${name}>\n ${varDef.value}\n  </${name}>`);
        } else if (varDef.type === 'data') {
          const yamlData = yaml.dump(varDef.value);
          variableDefinitions.push(`  <${name}>\n${yamlData}\n  </${name}>`);
        }
      }
      // Build the final system prompt
      if (variableDefinitions.length > 0) {
        const varsSystemPart = `<variables>\n${variableDefinitions.join('\n')}\n</variables>`;
        if (system) {
          return { system: `${system}\n${varsSystemPart}` };
        } else {
          return { system: varsSystemPart };
        }
      } else if (system) {
        // Return system parts even if there are no variables
        return { system };
      }
      // Return empty object if no system or variables
      return {};
    });

    return this.execute();
  }

  /**
   * Get the list of reminded items that had their .remind() method called.
   * Returns an array of { type, name } objects where type is 'def', 'defData', 'defSystem', 'defTool', or 'defAgent'.
   */
  getRemindedItems() {
    return [...this._remindedItems];
  }

  // Stateful-specific methods

  /**
   * Clear current definitions tracking for a new execution cycle
   */
  private _clearDefinitions(): void {
    this._definitionTracker.reset();
  }

  /**
   * Reconcile definitions after re-execution
   * Removes definitions that were not seen in the latest re-run
   */
  private _reconcileDefinitions(): void {
    this._definitionTracker.reconcile(this.variables, this.systems, this._tools);
  }

  /**
   * Get prompt methods for passing to promptFn.
   * Includes both core StatefulPrompt methods and bound plugin methods.
   */
  private _getPromptMethods() {
    return {
      // Core StatefulPrompt methods
      $: this.$.bind(this),
      def: this.def.bind(this),
      defData: this.defData.bind(this),
      defSystem: this.defSystem.bind(this),
      defTool: this.defTool.bind(this),
      defAgent: this.defAgent.bind(this),
      defState: this.defState.bind(this),
      defEffect: this.defEffect.bind(this),
      defMessage: this.defMessage.bind(this),
      // Plugin methods (already bound in setPlugins)
      ...this._boundPluginMethods,
    };
  }

  /**
   * Process effects and run those that have changed dependencies
   */
  private _processEffects(options: PrepareStepOptions<any>): void {
    // Create prompt context
    const context = this._createPromptContext(options);

    // Create step modifier function
    const stepModifier = this._createStepModifier();

    // Process effects FIRST - effects may call disable() which adds to _definitionsToDisable
    this._effectsManager.process(context, stepModifier);

    // Apply disabled definitions AFTER effects run so disable() takes effect immediately
    if (this._definitionsToDisable && this._definitionsToDisable.size > 0) {
      const disabledSystems: string[] = [];
      const disabledVariables: string[] = [];
      const disabledTools: string[] = [];

      // Collect all disabled items by type
      for (const { type, name } of this._definitionsToDisable) {
        switch (type) {
          case 'def':
          case 'defData':
            disabledVariables.push(name);
            break;
          case 'defSystem':
            disabledSystems.push(name);
            break;
          case 'defTool':
          case 'defAgent':
            disabledTools.push(name);
            break;
        }
      }

      // Set filters to exclude disabled items
      if (disabledSystems.length > 0) {
        // Keep all systems except the disabled ones
        const activeSystemNames = context.systems
          .map(s => s.name)
          .filter(name => !disabledSystems.includes(name));
        this.activeSystems = activeSystemNames;
      }

      if (disabledVariables.length > 0) {
        // Keep all variables except the disabled ones
        const activeVariableNames = context.variables
          .map(v => v.name)
          .filter(name => !disabledVariables.includes(name));
        this.activeVariables = activeVariableNames;
      }

      if (disabledTools.length > 0) {
        // Keep all tools except the disabled ones
        const activeToolNames = context.tools
          .map(t => t.name)
          .filter(name => !disabledTools.includes(name));
        this.activeTools = activeToolNames;
      }

      // Clear disabled definitions after applying
      this._definitionsToDisable.clear();
    }
  }

  /**
   * Create prompt context for effects
   */
  private _createPromptContext(options: PrepareStepOptions<any>): PromptContext {
    return {
      messages: options.messages,
      tools: createToolCollection(this._tools),
      systems: createSystemCollection(this.systems),
      variables: createVariableCollection(this.variables),
      lastTool: this._lastTool,
      stepNumber: options.stepNumber
    };
  }

  /**
   * Create step modifier function
   */
  private _createStepModifier(): StepModifier {
    return (aspect: 'messages' | 'tools' | 'systems' | 'variables', items: any[]) => {
      if (!this._stepModifications[aspect]) {
        this._stepModifications[aspect] = [];
      }
      this._stepModifications[aspect]!.push(...items);
    };
  }

  /**
   * Apply step modifications to the prepare step result.
   * Also updates instance properties (activeSystems, activeVariables) that are used by Prompt.run()
   */
  private _applyStepModifications(): DefHookResult {
    const result: DefHookResult = {};

    if (this._stepModifications.messages) {
      result.messages = this._stepModifications.messages;
    }

    if (this._stepModifications.tools) {
      const toolNames = this._stepModifications.tools.map((t: any) => t.name);
      result.activeTools = toolNames;
      // Also set on instance for consistency
      this.activeTools = toolNames;
    } else if (this.activeTools) {
      // Include activeTools set by disable() in _processEffects
      result.activeTools = this.activeTools;
    }

    if (this._stepModifications.systems) {
      const systemNames = this._stepModifications.systems.map((s: any) => s.name);
      result.activeSystems = systemNames;
      // Also set on instance for Prompt.run() to use
      this.activeSystems = systemNames;
    } else if (this.activeSystems) {
      // Include activeSystems set by disable() in _processEffects
      result.activeSystems = this.activeSystems;
    }

    if (this._stepModifications.variables) {
      result.variables = {};
      for (const variable of this._stepModifications.variables) {
        result.variables[variable.name] = {
          type: variable.type,
          value: variable.value
        };
      }
      // Also update instance variables
      this.variables = { ...this.variables, ...result.variables };
    } else if (this.activeVariables) {
      // Include activeVariables set by disable() in _processEffects
      // Note: This sets filter, not the variables themselves
    }

    return result;
  }

  /**
   * Override setLastPrepareStep to handle re-execution
   */
  setLastPrepareStep(prepareStepFn: (options: any) => any): void {
    // If we have a prompt function, enable re-execution logic
    if (this._promptFn) {
      this.addPrepareStep(async (options: PrepareStepOptions<any>) => {
        // Reset filters at the start of each step to prevent persistence
        this.activeSystems = undefined;
        this.activeVariables = undefined;
        this.activeTools = undefined;

        // Clear step modifications
        this._stepModifications = {};

        // Only re-execute after the first step
        if (this._executedOnce) {
          // Clear definition tracking for new execution cycle
          this._clearDefinitions();

          // Clear effects so they can be re-registered during re-execution
          this._effectsManager.clear();

          // Re-execute promptFn
          const promptMethods = this._getPromptMethods();
          await this._promptFn!(promptMethods);

          // Reconcile definitions after re-execution
          this._reconcileDefinitions();
        }

        this._executedOnce = true;

        // Process effects
        this._processEffects(options);

        // Apply step modifications
        const modifications = this._applyStepModifications();

        // Call the original prepareStep function
        const baseResult = prepareStepFn(options);

        // Add reminder if there are any reminded items
        if (this._remindedItems.length > 0) {
          const reminderText = this._remindedItems
            .map(item => {
              const tagMap = {
                'def': 'variable',
                'defData': 'data variable',
                'defSystem': 'system part',
                'defTool': 'tool',
                'defAgent': 'agent'
              };
              return `- ${item.name} (${tagMap[item.type] || item.type})`;
            })
            .join('\n');

          // Create the reminder message
          const reminderMessage = {
            role: 'assistant' as const,
            content: `\n\n[Reminder: Remember to use the following items in your response:\n${reminderText}]`
          };

          // Add the reminder message to the result for the AI SDK
          if (!baseResult.messages) {
            baseResult.messages = options.messages || [];
          }
          baseResult.messages.push(reminderMessage);


          // Clear reminded items after adding to reminder
          this._remindedItems = [];
        }

        // Merge results
        return { ...baseResult, ...modifications };
      });
    } else {
      // No prompt function, just set the prepare step directly
      super.setLastPrepareStep(prepareStepFn);
    }
  }
}

// Export an alias for backward compatibility
export { StatefulPrompt as Prompt };