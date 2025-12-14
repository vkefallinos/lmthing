/**
 * Tool-related type definitions.
 */

/**
 * Result returned by tool callbacks (beforeCall, onSuccess, onError)
 * - undefined: output is returned as is
 * - string: returned string is used as the tool output
 * - object: stringified or formatted according to responseSchema
 */
export type ToolCallbackResult = undefined | string | Record<string, any>;

/**
 * Tool event callback signature
 * Receives input and output, returns optional modified output
 */
export type ToolEventCallback = (input: any, output: any) => Promise<ToolCallbackResult> | ToolCallbackResult;

/**
 * Options for defTool and tool functions
 *
 * @property responseSchema - Optional Zod schema for validating/formatting tool responses
 * @property onSuccess - Callback fired when tool executes successfully
 * @property onError - Callback fired when tool throws an error
 * @property beforeCall - Callback fired before tool execution
 */
export interface ToolOptions {
  responseSchema?: any;  // Zod schema
  onSuccess?: ToolEventCallback;
  onError?: ToolEventCallback;
  beforeCall?: ToolEventCallback;
}
