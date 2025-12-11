import { PrepareStepOptions, StreamTextBuilder } from "./StreamText";
import yaml from 'js-yaml';
import { z } from 'zod';
import { type ModelInput } from "./providers/resolver";
import {
  PromptContext,
  LastToolInfo,
  StepModifier,
  StepModifications,
  Plugin
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
}

/**
 * Helper function to create a sub-tool definition for use with defTool arrays.
 *
 * @example
 * defTool('file', 'File operations', [
 *   tool('write', 'Write to file', z.object({ path: z.string(), content: z.string() }), writeFile),
 *   tool('append', 'Append to file', z.object({ path: z.string(), content: z.string() }), appendFile),
 * ]);
 */
export function tool(
  name: string,
  description: string,
  inputSchema: z.ZodType<any>,
  execute: Function
): SubToolDefinition {
  return { name, description, inputSchema, execute };
}

/**
 * Definition for a sub-agent used within a composite agent.
 */
export interface SubAgentDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  execute: Function;
  options?: { model?: ModelInput } & Record<string, any>;
}

/**
 * Helper function to create a sub-agent definition for use with defAgent arrays.
 *
 * @example
 * defAgent('specialists', 'Specialist agents', [
 *   agent('researcher', 'Research topics', z.object({ topic: z.string() }), researchFn, { model: 'openai:gpt-4o' }),
 *   agent('analyst', 'Analyze data', z.object({ data: z.string() }), analyzeFn),
 * ]);
 */
export function agent(
  name: string,
  description: string,
  inputSchema: z.ZodType<any>,
  execute: Function,
  options?: { model?: ModelInput } & Record<string, any>
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
  private _plugins: Plugin[] = [];
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
  setPlugins(plugins: Plugin[]): void {
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
   * @overload Single tool: defTool(name, description, inputSchema, execute)
   * @overload Composite tool: defTool(name, description, subTools[])
   *
   * When an array of sub-tools is provided, creates a composite tool that allows
   * the LLM to invoke multiple sub-tools in a single tool call.
   *
   * @example
   * // Single tool
   * defTool('search', 'Search the web', z.object({ query: z.string() }), searchFn);
   *
   * // Composite tool
   * defTool('file', 'File operations', [
   *   tool('write', 'Write to file', z.object({ path: z.string(), content: z.string() }), writeFn),
   *   tool('read', 'Read a file', z.object({ path: z.string() }), readFn),
   * ]);
   */
  defTool(name: string, description: string, inputSchemaOrSubTools: any, execute?: Function) {
    this._definitionTracker.mark('defTool', name);
    // Check if this is a composite tool (array of sub-tools)
    if (Array.isArray(inputSchemaOrSubTools)) {
      const subTools = inputSchemaOrSubTools as SubToolDefinition[];
      this._registerCompositeTool(name, description, subTools);
    } else {
      // Standard single tool
      this.addTool(name, { description, inputSchema: inputSchemaOrSubTools, execute });
    }
    const tag = `<${name}>`;
    return this.createProxy(tag, 'defTool', name);
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
          const result = await subTool.execute(call.args, options);
          results.push({ name: call.name, result });
        } catch (error: any) {
          results.push({
            name: call.name,
            result: { error: error.message || String(error) }
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
    {model, ...options}: {model?: ModelInput} & any = {}
  ) {
    this._definitionTracker.mark('defAgent', name);
    // Check if this is a composite agent (array of sub-agents)
    if (Array.isArray(inputSchemaOrSubAgents)) {
      const subAgents = inputSchemaOrSubAgents as SubAgentDefinition[];
      this._registerCompositeAgent(name, description, subAgents);
    } else {
      // Standard single agent
      this.addTool(name, { description, inputSchema: inputSchemaOrSubAgents, execute: async (args:any)=>{
        const prompt = StatefulPrompt.create(model || this.getModel() as ModelInput);
        prompt.withOptions(options || this.getOptions());
        await execute!({ ...args}, prompt);
        const result = prompt.run();
        const lastResponse = await result.text;
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
      const results: Array<{ name: string; response: string; steps?: any[] }> = [];

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
          const { model: agentModel, ...agentOptions } = subAgent.options || {};
          const prompt = StatefulPrompt.create(agentModel || this.getModel() as ModelInput);
          prompt.withOptions(agentOptions || this.getOptions());
          await subAgent.execute(call.args, prompt);
          const result = await prompt.run();
          const lastResponse = await result.text;
          results.push({ name: call.name, response: lastResponse, steps: prompt.steps });
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

    // Apply disabled definitions if any
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

    // Process effects via the manager
    this._effectsManager.process(context, stepModifier);
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
    }

    if (this._stepModifications.systems) {
      const systemNames = this._stepModifications.systems.map((s: any) => s.name);
      result.activeSystems = systemNames;
      // Also set on instance for Prompt.run() to use
      this.activeSystems = systemNames;
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