/**
 * Tool-related type definitions.
 */

import type { ZodSchema } from './core';

/**
 * Result returned by tool callbacks (beforeCall, onSuccess, onError)
 * - undefined: output is returned as is
 * - string: returned string is used as the tool output
 * - object: stringified or formatted according to responseSchema
 *
 * @category Tools
 */
export type ToolCallbackResult = undefined | string | Record<string, unknown>;

/**
 * Tool event callback signature with optional generics
 * Receives input and output, returns optional modified output
 *
 * @typeParam TInput - Tool input type (defaults to unknown for safety)
 * @typeParam TOutput - Tool output type (defaults to unknown for safety)
 *
 * @category Tools
 */
export type ToolEventCallback<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  output: TOutput
) => Promise<ToolCallbackResult> | ToolCallbackResult;

/**
 * Options for defTool and tool functions
 *
 * @category Tools
 *
 * @typeParam TInput - Tool input type for callbacks
 * @typeParam TOutput - Tool output type for callbacks
 *
 * @property responseSchema - Optional Zod schema for validating/formatting tool responses
 * @property onSuccess - Callback fired when tool executes successfully
 * @property onError - Callback fired when tool throws an error
 * @property beforeCall - Callback fired before tool execution
 */
export interface ToolOptions<TInput = unknown, TOutput = unknown> {
  responseSchema?: ZodSchema;
  onSuccess?: ToolEventCallback<TInput, TOutput>;
  onError?: ToolEventCallback<TInput, Error | unknown>;
  beforeCall?: ToolEventCallback<TInput, undefined>;
}
