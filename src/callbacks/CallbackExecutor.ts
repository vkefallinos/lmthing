import type { ToolOptions } from '../types';

/**
 * Executes a tool function with beforeCall/onSuccess/onError callbacks.
 *
 * @param execute - The tool's execute function
 * @param input - The tool input arguments
 * @param toolOptions - AI SDK tool options (passed through to execute)
 * @param callbacks - Optional ToolOptions with callback hooks
 * @param formatOutput - Optional function to format tool output (e.g., via responseSchema)
 * @returns The tool output, potentially modified by callbacks or formatting
 */
export async function executeWithCallbacks(
  execute: Function,
  input: any,
  toolOptions: any,
  callbacks?: ToolOptions,
  formatOutput?: (output: any, options?: ToolOptions) => any
): Promise<any> {
  const format = formatOutput ?? ((output: any) => output);

  try {
    // Call beforeCall hook if present
    if (callbacks?.beforeCall) {
      const beforeResult = await callbacks.beforeCall(input, undefined);
      if (beforeResult !== undefined) {
        return format(beforeResult, callbacks);
      }
    }

    // Execute the tool
    let output = await execute(input, toolOptions);

    // Call onSuccess hook if present
    if (callbacks?.onSuccess) {
      const successResult = await callbacks.onSuccess(input, output);
      if (successResult !== undefined) {
        output = successResult;
      }
    }

    return format(output, callbacks);
  } catch (error: any) {
    let errorOutput: any = { error: error.message || String(error) };

    // Call onError hook if present
    if (callbacks?.onError) {
      const errorResult = await callbacks.onError(input, errorOutput);
      if (errorResult !== undefined) {
        errorOutput = errorResult;
      }
    }

    return format(errorOutput, callbacks);
  }
}
