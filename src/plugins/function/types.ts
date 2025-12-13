import type { z } from 'zod';

/**
 * Callback executed before function call
 * Return undefined to continue execution, or return a value to skip execution
 */
export type FunctionBeforeCallback<TInput = any, TOutput = any> = (
  input: TInput,
  output?: TOutput
) => Promise<undefined | TOutput> | undefined | TOutput;

/**
 * Callback executed after successful function execution
 * Return undefined to keep original output, or return modified output
 */
export type FunctionSuccessCallback<TInput = any, TOutput = any> = (
  input: TInput,
  output: TOutput
) => Promise<undefined | TOutput> | undefined | TOutput;

/**
 * Callback executed when function throws an error
 * Return undefined to keep error, or return modified error response
 */
export type FunctionErrorCallback<TInput = any> = (
  input: TInput,
  error: Error
) => Promise<undefined | any> | undefined | any;

/**
 * Options for function definition
 */
export interface FunctionOptions<TInput = any, TOutput = any> {
  /** Required response schema for output validation */
  responseSchema: z.ZodType<TOutput>;
  /** Optional callback before function execution */
  beforeCall?: FunctionBeforeCallback<TInput, TOutput>;
  /** Optional callback after successful execution */
  onSuccess?: FunctionSuccessCallback<TInput, TOutput>;
  /** Optional callback when function throws */
  onError?: FunctionErrorCallback<TInput>;
}

/**
 * Function definition stored in registry
 */
export interface FunctionDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  responseSchema: z.ZodType<TOutput>;
  execute: (args: TInput) => TOutput | Promise<TOutput>;
  options: FunctionOptions<TInput, TOutput>;
}

/**
 * TypeScript error information
 */
export interface TypeScriptError {
  line: number;
  column: number;
  message: string;
  code: number;
  codeLine: string;
}

/**
 * Validation result from TypeScript compiler
 */
export interface ValidationResult {
  valid: boolean;
  errors: TypeScriptError[];
}

/**
 * Helper type for composite function definitions
 */
export interface CompositeFunctionDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (args: TInput) => TOutput | Promise<TOutput>;
  options: FunctionOptions<TInput, TOutput>;
}
