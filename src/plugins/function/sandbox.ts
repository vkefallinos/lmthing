import { VM } from 'vm2';
import type { FunctionDefinition } from './types';
import type { FunctionRegistry } from './FunctionRegistry';

/**
 * Creates wrapped version of a function with validation and callbacks
 */
function createWrappedFunction(definition: FunctionDefinition) {
  return async (args: any) => {
    const { inputSchema, responseSchema, execute, options } = definition;
    let validatedInput: any;

    try {
      // Validate input using Zod
      validatedInput = inputSchema.parse(args);

      // Execute beforeCall callback if provided
      if (options.beforeCall) {
        const beforeResult = await Promise.resolve(options.beforeCall(validatedInput, undefined));
        if (beforeResult !== undefined) {
          // Short-circuit execution
          return beforeResult;
        }
      }

      // Execute the actual function
      let output = await Promise.resolve(execute(validatedInput));

      // Validate output using responseSchema
      output = responseSchema.parse(output);

      // Execute onSuccess callback if provided
      if (options.onSuccess) {
        const successResult = await Promise.resolve(options.onSuccess(validatedInput, output));
        if (successResult !== undefined) {
          output = successResult;
        }
      }

      return output;
    } catch (error) {
      // Execute onError callback if provided
      if (options.onError && error instanceof Error) {
        const errorResult = await Promise.resolve(options.onError(validatedInput || args, error));
        if (errorResult !== undefined) {
          return errorResult;
        }
      }
      throw error;
    }
  };
}

/**
 * Creates sandbox object with all registered functions
 */
function createSandboxObject(registry: FunctionRegistry): Record<string, any> {
  const sandbox: Record<string, any> = {
    console: {
      log: (...args: any[]) => console.log('[Sandbox]', ...args),
      error: (...args: any[]) => console.error('[Sandbox]', ...args),
      warn: (...args: any[]) => console.warn('[Sandbox]', ...args),
    },
  };

  for (const [name, value] of registry.getAll().entries()) {
    if ('execute' in value) {
      // Single function
      sandbox[name] = createWrappedFunction(value as FunctionDefinition);
    } else {
      // Composite function (namespace)
      sandbox[name] = {};
      for (const [subName, definition] of Object.entries(value as Record<string, FunctionDefinition>)) {
        sandbox[name][subName] = createWrappedFunction(definition);
      }
    }
  }

  return sandbox;
}

/**
 * Executes user code in a secure sandbox
 */
export async function executeSandbox(code: string, registry: FunctionRegistry): Promise<any> {
  // Create sandbox with wrapped functions
  const sandboxObject = createSandboxObject(registry);

  // Create VM2 instance with security restrictions
  const vm = new VM({
    timeout: 5000, // 5 seconds
    sandbox: sandboxObject,
    eval: false,
    wasm: false,
  });

  // Wrap code in async IIFE to support await
  const wrappedCode = `(async () => {\n${code}\n})()`;

  // Execute code and return result
  const result = await vm.run(wrappedCode);
  return result;
}
