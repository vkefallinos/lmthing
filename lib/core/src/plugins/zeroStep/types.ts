import type { z } from 'zod';

/**
 * Definition for a registered method callable inside <run_code> blocks.
 */
export interface MethodDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  parameterSchema: z.ZodType<TInput>;
  handler: (args: TInput) => TOutput | Promise<TOutput>;
  responseSchema: z.ZodType<TOutput>;
}
