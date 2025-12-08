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
 * Result object returned by defHook callbacks to modify step behavior.
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
  private variables: Record<string, {
    type: 'string' | 'data';
    value: any;

  }> = {};
  private systems: Record<string, string> = {};
  private activeSystems?: string[];
  private activeVariables?: string[];
  private addVariable(name: string, value: any, type: 'string' | 'data') {
    this.variables[name] = { type, value };
  }

  private addSystemPart(name: string, part: string): void {
    this.systems[name] = part;
  }
  def(name: string, value: string) {
    this.addVariable(name, value, 'string');
    return `<${name}>`;
  }

  defData(name: string, value: any) {
    this.addVariable(name, value, 'data');
    return `<${name}>`;
  }
  defSystem(name: string, value: string) {
    this.addSystemPart(name, value);
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
  }

  /**
   * Creates and registers a composite tool from an array of sub-tool definitions.
   */
  private _registerCompositeTool(name: string, description: string, subTools: SubToolDefinition[]) {
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
   * Define a hook that runs before each step, allowing dynamic modification of the prompt context.
   *
   * Hooks receive the current step context including messages, model, steps history, stepNumber,
   * variables, system parts, and lists of available names. They can return modifications to apply for that step.
   *
   * @param hookFn - Function called before each step with context and returns modifications
   *
   * @example
   * // Basic usage - limit tools per step
   * prompt.defHook(({ stepNumber, tools }) => {
   *   console.log('Available tools:', tools); // ['search', 'calculator']
   *   if (stepNumber === 0) {
   *     return { activeTools: ['search'] };
   *   }
   *   return { activeTools: ['format'] };
   * });
   *
   * @example
   * // Access system and variable names
   * prompt.defHook(({ systems, variables }) => {
   *   console.log('System names:', systems); // ['role', 'guidelines', 'expertise']
   *   console.log('Variable names:', variables); // ['userName', 'config']
   *
   *   // Only include specific system parts for this step
   *   return {
   *     activeSystems: ['role', 'guidelines'] // Excludes 'expertise'
   *   };
   * });
   *
   * @example
   * // Access full system values
   * prompt.defHook(({ system, stepNumber }) => {
   *   console.log(system.role); // Access system parts by name
   *
   *   // Only include specific variables for this step
   *   return {
   *     activeVariables: ['userName', 'config'] // Excludes other defined variables
   *   };
   * });
   *
   * @example
   * // Modify variables per step
   * prompt.defHook(({ stepNumber }) => {
   *   return {
   *     variables: {
   *       currentStep: { type: 'string', value: `Step ${stepNumber}` }
   *     }
   *   };
   * });
   *
   * @remarks
   * - Hook is called once per step (stepNumber starts at 0)
   * - activeSystems/activeVariables filters reset each step (no persistence)
   * - If activeSystems is not returned, all defined systems are included
   * - If activeVariables is not returned, all defined variables are included
   * - Multiple hooks can be defined and will execute sequentially
   */
  defHook(hookFn: (opts: PrepareStepOptions<any> & {
    system: Record<string, string>,
    systems: string[],
    variables: string[],
    tools: string[]
  })=>DefHookResult) {
    this.addPrepareStep(({messages, model, steps, stepNumber})=>{
      // Reset filters at the start of each step to prevent persistence
      this.activeSystems = undefined;
      this.activeVariables = undefined;

      const updates: DefHookResult = hookFn({
        messages,
        model,
        steps,
        stepNumber,
        system: this.systems,
        systems: Object.keys(this.systems),
        variables: Object.keys(this.variables),
        tools: Object.keys(this._tools)
      });
      if (updates.variables) {
        this.variables = { ...this.variables, ...updates.variables };
      }
      if (updates.activeSystems !== undefined) {
        this.activeSystems = updates.activeSystems;
      }
      if (updates.activeVariables !== undefined) {
        this.activeVariables = updates.activeVariables;
      }
      return updates;
    })
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
        const prompt = new Prompt(model || this.getModel());
        prompt.withOptions(options || this.getOptions());
        await execute!({ ...args}, prompt);
        const result = await prompt.run();
        const lastResponse = await result.text;
        return { response: lastResponse, steps: prompt.steps };
      }});
    }
  }

  /**
   * Creates and registers a composite agent from an array of sub-agent definitions.
   */
  private _registerCompositeAgent(name: string, description: string, subAgents: SubAgentDefinition[]) {
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
          const prompt = new Prompt(agentModel || this.getModel());
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
      return acc + str + (values[i] !== undefined ? values[i] : '');
    }, '');
    this.addMessage({ role: 'user', content });
  }

  run() {
    this.setLastPrepareStep(()=>{
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
}