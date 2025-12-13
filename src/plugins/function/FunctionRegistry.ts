import type { FunctionDefinition, CompositeFunctionDefinition, FunctionAgentDefinition, CompositeFunctionAgentDefinition } from './types';

/**
 * Registry for storing and managing function definitions
 */
export class FunctionRegistry {
  private functions: Map<string, FunctionDefinition | FunctionAgentDefinition | Record<string, FunctionDefinition | FunctionAgentDefinition>>;

  constructor() {
    this.functions = new Map();
  }

  /**
   * Register a single function
   */
  register(definition: FunctionDefinition): void {
    if (!definition.options?.responseSchema) {
      throw new Error(
        `Function '${definition.name}' is missing required responseSchema in options. ` +
        `All functions must specify a responseSchema for output validation.`
      );
    }
    this.functions.set(definition.name, definition);
  }

  /**
   * Register a composite function (multiple sub-functions under a namespace)
   */
  registerComposite(
    name: string,
    description: string,
    subFunctions: CompositeFunctionDefinition[]
  ): void {
    const composite: Record<string, FunctionDefinition> = {};

    for (const subFunc of subFunctions) {
      if (!subFunc.options?.responseSchema) {
        throw new Error(
          `Sub-function '${name}.${subFunc.name}' is missing required responseSchema in options. ` +
          `All functions must specify a responseSchema for output validation.`
        );
      }

      composite[subFunc.name] = {
        name: `${name}.${subFunc.name}`,
        description: subFunc.description,
        inputSchema: subFunc.inputSchema,
        responseSchema: subFunc.options.responseSchema,
        execute: subFunc.execute,
        options: subFunc.options,
      };
    }

    this.functions.set(name, composite);
  }

  /**
   * Register a single function agent
   */
  registerAgent(definition: FunctionAgentDefinition): void {
    if (!definition.options?.responseSchema) {
      throw new Error(
        `Function agent '${definition.name}' is missing required responseSchema in options. ` +
        `All function agents must specify a responseSchema for output validation.`
      );
    }
    this.functions.set(definition.name, definition);
  }

  /**
   * Register a composite function agent (multiple sub-agents under a namespace)
   */
  registerCompositeAgent(
    name: string,
    description: string,
    subAgents: CompositeFunctionAgentDefinition[]
  ): void {
    const composite: Record<string, FunctionAgentDefinition> = {};

    for (const subAgent of subAgents) {
      if (!subAgent.options?.responseSchema) {
        throw new Error(
          `Sub-agent '${name}.${subAgent.name}' is missing required responseSchema in options. ` +
          `All function agents must specify a responseSchema for output validation.`
        );
      }

      composite[subAgent.name] = {
        name: `${name}.${subAgent.name}`,
        description: subAgent.description,
        inputSchema: subAgent.inputSchema,
        responseSchema: subAgent.options.responseSchema,
        execute: subAgent.execute,
        options: subAgent.options,
        isAgent: true,
      };
    }

    this.functions.set(name, composite);
  }

  /**
   * Get a function or agent by name
   * For composite functions/agents, use "namespace.functionName"
   */
  get(name: string): FunctionDefinition | FunctionAgentDefinition | undefined {
    if (name.includes('.')) {
      const [namespace, funcName] = name.split('.');
      const composite = this.functions.get(namespace);
      if (composite && typeof composite === 'object' && !('execute' in composite)) {
        return composite[funcName];
      }
      return undefined;
    }

    const func = this.functions.get(name);
    if (func && 'execute' in func) {
      return func as FunctionDefinition | FunctionAgentDefinition;
    }
    return undefined;
  }

  /**
   * Get all registered functions and agents
   */
  getAll(): Map<string, FunctionDefinition | FunctionAgentDefinition | Record<string, FunctionDefinition | FunctionAgentDefinition>> {
    return this.functions;
  }

  /**
   * Check if a function exists
   */
  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  /**
   * Get all function names (flattened for composite functions)
   */
  getAllNames(): string[] {
    const names: string[] = [];
    for (const [key, value] of this.functions.entries()) {
      if ('execute' in value) {
        names.push(key);
      } else {
        for (const subName of Object.keys(value)) {
          names.push(`${key}.${subName}`);
        }
      }
    }
    return names;
  }
}
