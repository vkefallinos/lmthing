import { createGroq } from '@ai-sdk/groq';
import { defineProvider, BaseProviderConfig } from './factory';

/**
 * Groq Provider Configuration
 *
 * Supports Groq's ultra-fast LLM inference
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/groq
 */

export interface GroqConfig extends BaseProviderConfig {}

const module = defineProvider({
  name: 'groq',
  envKey: 'GROQ_API_KEY',
  sdkFactory: createGroq,
  models: {
    LLAMA_3_3_70B_VERSATILE: 'llama-3.3-70b-versatile',
    LLAMA_3_1_70B_VERSATILE: 'llama-3.1-70b-versatile',
    LLAMA_3_1_8B_INSTANT: 'llama-3.1-8b-instant',
    LLAMA_3_2_90B_VISION: 'llama-3.2-90b-vision-preview',
    MIXTRAL_8X7B: 'mixtral-8x7b-32768',
    GEMMA_7B: 'gemma-7b-it',
    GEMMA_2_9B: 'gemma2-9b-it',
  },
});

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
export const createGroqProvider = module.createProvider;

/**
 * Default Groq provider instance
 * Uses environment variables for configuration
 */
export const groq = module.provider;

/**
 * Common Groq model identifiers
 */
export const GroqModels = module.models;

export type GroqModel = typeof GroqModels[keyof typeof GroqModels];
