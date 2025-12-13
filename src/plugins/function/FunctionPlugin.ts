import { z } from 'zod';
import type { StatefulPrompt } from '../../StatefulPrompt';
import type { FunctionOptions, CompositeFunctionDefinition } from './types';
import { FunctionRegistry } from './FunctionRegistry';
import { validateTypeScript } from './typeChecker';
import { executeSandbox } from './sandbox';

// Symbol to store registry on StatefulPrompt instance
const FUNCTION_REGISTRY = Symbol('functionRegistry');
const RUN_TOOL_CODE_REGISTERED = Symbol('runToolCodeRegistered');

/**
 * Gets or creates the function registry for a prompt instance
 */
function getRegistry(prompt: StatefulPrompt): FunctionRegistry {
  if (!(prompt as any)[FUNCTION_REGISTRY]) {
    (prompt as any)[FUNCTION_REGISTRY] = new FunctionRegistry();
  }
  return (prompt as any)[FUNCTION_REGISTRY];
}

/**
 * Checks if runToolCode has been registered
 */
function isRunToolCodeRegistered(prompt: StatefulPrompt): boolean {
  return !!(prompt as any)[RUN_TOOL_CODE_REGISTERED];
}

/**
 * Marks runToolCode as registered
 */
function markRunToolCodeRegistered(prompt: StatefulPrompt): void {
  (prompt as any)[RUN_TOOL_CODE_REGISTERED] = true;
}

/**
 * Generates human-readable function description for system prompt
 */
function generateFunctionDescription(registry: FunctionRegistry): string {
  const descriptions: string[] = [];

  descriptions.push('# Available Functions');
  descriptions.push('');
  descriptions.push('You can call these functions using TypeScript code via the runToolCode tool.');
  descriptions.push('All code is validated with TypeScript before execution.');
  descriptions.push('');

  for (const [name, value] of registry.getAll().entries()) {
    if ('execute' in value) {
      // Single function
      const inputType = value.inputSchema.description || 'any';
      const outputType = value.responseSchema.description || 'any';
      descriptions.push(`## ${name}`);
      descriptions.push(`${value.description}`);
      descriptions.push(`- Parameters: ${inputType}`);
      descriptions.push(`- Returns: ${outputType}`);
      descriptions.push('');
    } else {
      // Composite function (namespace)
      descriptions.push(`## ${name} (namespace)`);
      descriptions.push('');
      for (const [subName, definition] of Object.entries(value)) {
        const inputType = definition.inputSchema.description || 'any';
        const outputType = definition.responseSchema.description || 'any';
        descriptions.push(`### ${name}.${subName}`);
        descriptions.push(`${definition.description}`);
        descriptions.push(`- Parameters: ${inputType}`);
        descriptions.push(`- Returns: ${outputType}`);
        descriptions.push('');
      }
    }
  }

  return descriptions.join('\n');
}

/**
 * Registers the runToolCode tool if not already registered
 */
function ensureRunToolCodeRegistered(prompt: StatefulPrompt): void {
  if (isRunToolCodeRegistered(prompt)) {
    return;
  }

  const registry = getRegistry(prompt);

  prompt.defTool(
    'runToolCode',
    'Execute TypeScript code that calls available functions. Code is validated before execution.',
    z.object({
      code: z.string().describe('TypeScript code to execute. Can call any registered functions.')
    }),
    async ({ code }: { code: string }) => {
      // Validate TypeScript
      const validationResult = validateTypeScript(code, registry);

      if (!validationResult.valid) {
        return {
          success: false,
          errors: validationResult.errors,
          message: 'TypeScript validation failed. Fix the errors and try again.'
        };
      }

      // Execute in sandbox
      try {
        const result = await executeSandbox(code, registry);
        return {
          success: true,
          result
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || String(error),
          message: 'Runtime error during execution.'
        };
      }
    }
  );

  markRunToolCodeRegistered(prompt);
}

/**
 * Updates the system prompt with available functions
 */
function updateSystemPrompt(prompt: StatefulPrompt): void {
  const registry = getRegistry(prompt);
  const description = generateFunctionDescription(registry);
  prompt.defSystem('available_functions', description);
}

/**
 * Define a function that the LLM can call via code execution.
 *
 * @param this - The StatefulPrompt instance (automatically bound)
 * @param name - Function name
 * @param description - Function description
 * @param inputSchemaOrSubFunctions - Zod schema for input, or array of sub-functions for composite
 * @param execute - Function implementation (required for single functions)
 * @param options - Required options containing responseSchema and optional callbacks
 * @returns Proxy object with value, remind, and disable methods
 *
 * @example
 * // Single function
 * defFunction('calculate', 'Add two numbers', z.object({ a: z.number(), b: z.number() }),
 *   async ({ a, b }) => ({ sum: a + b }),
 *   { responseSchema: z.object({ sum: z.number() }) }
 * );
 *
 * @example
 * // Composite function
 * defFunction('math', 'Math operations', [
 *   func('add', 'Add numbers', z.object({ a: z.number(), b: z.number() }),
 *     async ({ a, b }) => ({ result: a + b }),
 *     { responseSchema: z.object({ result: z.number() }) }
 *   ),
 *   func('multiply', 'Multiply numbers', z.object({ a: z.number(), b: z.number() }),
 *     async ({ a, b }) => ({ result: a * b }),
 *     { responseSchema: z.object({ result: z.number() }) }
 *   )
 * ]);
 */
export function defFunction(
  this: StatefulPrompt,
  name: string,
  description: string,
  inputSchemaOrSubFunctions: z.ZodType<any> | CompositeFunctionDefinition[],
  execute?: (args: any) => any | Promise<any>,
  options?: FunctionOptions
) {
  const registry = getRegistry(this);

  // Check if this is a composite function
  if (Array.isArray(inputSchemaOrSubFunctions)) {
    const subFunctions = inputSchemaOrSubFunctions as CompositeFunctionDefinition[];
    registry.registerComposite(name, description, subFunctions);
  } else {
    // Single function
    if (!options) {
      throw new Error(
        `Function '${name}' is missing required options parameter. ` +
        `All functions must specify options with a responseSchema for output validation.`
      );
    }

    if (!options.responseSchema) {
      throw new Error(
        `Function '${name}' is missing required responseSchema in options. ` +
        `All functions must specify a responseSchema for output validation.`
      );
    }

    if (!execute) {
      throw new Error(`Function '${name}' is missing execute function.`);
    }

    registry.register({
      name,
      description,
      inputSchema: inputSchemaOrSubFunctions as z.ZodType<any>,
      responseSchema: options.responseSchema,
      execute,
      options,
    });
  }

  // Ensure runToolCode tool is registered
  ensureRunToolCodeRegistered(this);

  // Update system prompt
  updateSystemPrompt(this);

  // Return proxy
  const tag = `<${name}>`;
  return (this as any).createProxy(tag, 'defFunction' as any, name);
}

/**
 * Function Plugin
 *
 * Export this plugin object to use with runPrompt:
 *
 * @example
 * import { functionPlugin } from 'lmthing/plugins';
 *
 * runPrompt(({ defFunction }) => {
 *   // defFunction is now available
 * }, { plugins: [functionPlugin] });
 */
export const functionPlugin = {
  defFunction
};
