import type { FunctionDefinition, CompositeFunctionDefinition } from './types';

/**
 * Registry for storing and managing function definitions
 */
export class FunctionRegistry {
  private functions: Map<string, FunctionDefinition | Record<string, FunctionDefinition>>;

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
   * Get a function by name
   * For composite functions, use "namespace.functionName"
   */
  get(name: string): FunctionDefinition | undefined {
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
      return func as FunctionDefinition;
    }
    return undefined;
  }

  /**
   * Get all registered functions
   */
  getAll(): Map<string, FunctionDefinition | Record<string, FunctionDefinition>> {
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
