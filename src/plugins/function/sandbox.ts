import { VM } from 'vm2';
import type { FunctionDefinition, FunctionAgentDefinition } from './types';
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
 * Creates wrapped version of a function agent with validation and callbacks
 */
function createWrappedAgent(definition: FunctionAgentDefinition, parentPrompt: any) {
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

      // Create child prompt for agent
      const { StatefulPrompt } = require('../../StatefulPrompt');
      const { model, system, plugins, ...otherOptions } = options;
      const childPrompt = StatefulPrompt.create(model || parentPrompt.getModel());
      childPrompt.withOptions(otherOptions || parentPrompt.getOptions());

      // Set plugins if provided
      if (plugins) {
        childPrompt.setPlugins(plugins);
      }

      // Helper to convert Zod schema to JSON Schema (simplified version)
      const zodToJsonSchema = (schema: any): any => {
        // This is a simplified version - you may want to use a proper zod-to-json-schema library
        return { type: 'object' };
      };

      // Add response schema instruction to system prompt
      const schemaInstruction = `You must respond with valid JSON that matches this schema:\n\n${JSON.stringify(zodToJsonSchema(responseSchema), null, 2)}\n\nIMPORTANT: Your response must be ONLY valid JSON matching this schema, with no additional text before or after.`;
      const finalSystem = system ? `${system}\n\n${schemaInstruction}` : schemaInstruction;
      childPrompt.defSystem('responseFormat', finalSystem);

      // Execute the agent function (configure the child prompt)
      await Promise.resolve(execute(validatedInput, childPrompt));

      // Run the agent
      const result = childPrompt.run();
      const lastResponse = await result.text;

      // Parse and validate response against schema
      let output;
      try {
        output = JSON.parse(lastResponse);
        output = responseSchema.parse(output);
      } catch (parseError: any) {
        throw new Error(`Agent response validation failed: ${parseError.message || String(parseError)}`);
      }

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
 * Creates sandbox object with all registered functions and agents
 */
function createSandboxObject(registry: FunctionRegistry, parentPrompt: any): Record<string, any> {
  const sandbox: Record<string, any> = {
    console: {
      log: (...args: any[]) => console.log('[Sandbox]', ...args),
      error: (...args: any[]) => console.error('[Sandbox]', ...args),
      warn: (...args: any[]) => console.warn('[Sandbox]', ...args),
    },
  };

  for (const [name, value] of registry.getAll().entries()) {
    if ('execute' in value) {
      // Single function or agent
      if ('isAgent' in value && value.isAgent) {
        sandbox[name] = createWrappedAgent(value as FunctionAgentDefinition, parentPrompt);
      } else {
        sandbox[name] = createWrappedFunction(value as FunctionDefinition);
      }
    } else {
      // Composite function/agent (namespace)
      sandbox[name] = {};
      for (const [subName, definition] of Object.entries(value as Record<string, FunctionDefinition | FunctionAgentDefinition>)) {
        if ('isAgent' in definition && definition.isAgent) {
          sandbox[name][subName] = createWrappedAgent(definition as FunctionAgentDefinition, parentPrompt);
        } else {
          sandbox[name][subName] = createWrappedFunction(definition as FunctionDefinition);
        }
      }
    }
  }

  return sandbox;
}

/**
 * Executes user code in a secure sandbox
 */
export async function executeSandbox(code: string, registry: FunctionRegistry, parentPrompt?: any): Promise<any> {
  // Create sandbox with wrapped functions and agents
  const sandboxObject = createSandboxObject(registry, parentPrompt);

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
