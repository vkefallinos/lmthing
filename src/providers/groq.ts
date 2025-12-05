import { createGroq } from '@ai-sdk/groq';

/**
 * Groq Provider Configuration
 *
 * Supports Groq's ultra-fast LLM inference
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/groq
 */

export interface GroqConfig {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Create a Groq provider instance
 *
 * @param config - Configuration options for Groq
 * @returns Groq provider instance
 *
 * @example
 * ```typescript
 * const groq = createGroqProvider({
 *   apiKey: process.env.GROQ_API_KEY
 * });
 *
 * const model = groq('llama-3.3-70b-versatile');
 * ```
 */
export function createGroqProvider(config?: GroqConfig) {
  return createGroq({
    apiKey: config?.apiKey || process.env.GROQ_API_KEY,
    baseURL: config?.baseURL,
  });
}

/**
 * Default Groq provider instance
 * Uses environment variables for configuration
 */
export const groq = createGroqProvider();

/**
 * Common Groq model identifiers
 */
export const GroqModels = {
  LLAMA_3_3_70B_VERSATILE: 'llama-3.3-70b-versatile',
  LLAMA_3_1_70B_VERSATILE: 'llama-3.1-70b-versatile',
  LLAMA_3_1_8B_INSTANT: 'llama-3.1-8b-instant',
  LLAMA_3_2_90B_VISION: 'llama-3.2-90b-vision-preview',
  MIXTRAL_8X7B: 'mixtral-8x7b-32768',
  GEMMA_7B: 'gemma-7b-it',
  GEMMA_2_9B: 'gemma2-9b-it',
} as const;

export type GroqModel = typeof GroqModels[keyof typeof GroqModels];
