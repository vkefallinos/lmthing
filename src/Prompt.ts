import { PrepareStepOptions, StreamTextBuilder } from "./StreamText";
import yaml from 'js-yaml';
import { z } from 'zod';
import { type ModelInput } from "./providers/resolver";

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
export class Prompt extends StreamTextBuilder {
  protected variables: Record<string, {
    type: 'string' | 'data';
    value: any;

  }> = {};
  protected systems: Record<string, string> = {};
  protected activeSystems?: string[];
  protected activeVariables?: string[];
  protected activeTools?: string[];
  protected _remindedItems: Array<{ type: 'def' | 'defData' | 'defSystem' | 'defTool' | 'defAgent', name: string }> = [];

  /**
   * Factory method to create a Prompt instance.
   * This can be overridden by subclasses to return a different type.
   */
  static create(model: ModelInput): Prompt {
    return new Prompt(model);
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
        if (prop === 'toString' || prop === 'valueOf') {
          return () => tag;
        }
        if (typeof prop === 'symbol' && prop === Symbol.toPrimitive) {
          return () => tag;
        }
        return tag;
      },
      has(_target: any, prop: string | symbol) {
        return prop === 'value' || prop === 'remind' || prop === 'toString' || prop === 'valueOf' || prop === Symbol.toPrimitive;
      },
      ownKeys() {
        return ['value', 'remind'];
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
    this.addVariable(name, value, 'string');
    const tag = `<${name}>`;
    return this.createProxy(tag, 'def', name);
  }

  defData(name: string, value: any) {
    this.addVariable(name, value, 'data');
    const tag = `<${name}>`;
    return this.createProxy(tag, 'defData', name);
  }
  defSystem(name: string, value: string) {
    this.addSystemPart(name, value);
    const tag = `<${name}>`;
    return this.createProxy(tag, 'defSystem', name);
  }
  defMessage(role: 'user' | 'assistant', content: string) {
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
    // Check if this is a composite agent (array of sub-agents)
    if (Array.isArray(inputSchemaOrSubAgents)) {
      const subAgents = inputSchemaOrSubAgents as SubAgentDefinition[];
      this._registerCompositeAgent(name, description, subAgents);
    } else {
      // Standard single agent
      this.addTool(name, { description, inputSchema: inputSchemaOrSubAgents, execute: async (args:any)=>{
        const prompt = Prompt.create(model || this.getModel() as ModelInput);
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
          const prompt = Prompt.create(agentModel || this.getModel() as ModelInput);
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
    this.addMessage({ role: 'user', content });
  }

  run() {
    // Add onStepFinish hook to reset reminded items after each step
    this.addOnStepFinish(async () => {
      // After each step, clear the reminded items
      this._remindedItems = [];
    });

    this.setLastPrepareStep((_options: any)=>{
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


    // After all steps are done, add a final message with reminder if there are any reminded items
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

      this.addMessage({
        role: 'assistant',
        content: `\n\n[Reminder: Remember to use the following items in your response:\n${reminderText}]`
      });
    }
    return this.execute();

  }

  /**
   * Get the list of reminded items that had their .remind() method called.
   * Returns an array of { type, name } objects where type is 'def', 'defData', 'defSystem', 'defTool', or 'defAgent'.
   */
  getRemindedItems() {
    return [...this._remindedItems];
  }
}