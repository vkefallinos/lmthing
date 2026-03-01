import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { defineProvider, BaseProviderConfig } from './factory';

/**
 * Google Generative AI Provider Configuration
 *
 * Supports Gemini models
 *
 * @category Providers
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai
 */

export interface GoogleConfig extends BaseProviderConfig {}

const module = defineProvider({
  name: 'google',
  envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  sdkFactory: createGoogleGenerativeAI,
  models: {
    GEMINI_1_5_PRO: 'gemini-1.5-pro',
    GEMINI_1_5_PRO_LATEST: 'gemini-1.5-pro-latest',
    GEMINI_1_5_FLASH: 'gemini-1.5-flash',
    GEMINI_1_5_FLASH_LATEST: 'gemini-1.5-flash-latest',
    GEMINI_PRO: 'gemini-pro',
    GEMINI_PRO_VISION: 'gemini-pro-vision',
  },
});

/**
 * Create a Google Generative AI provider instance
 *
 * @category Providers
 *
 * @param config - Configuration options for Google Generative AI
 * @returns Google Generative AI provider instance
 *
 * @example
 * ```typescript
 * const google = createGoogleProvider({
 *   apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
 * });
 *
 * const model = google('gemini-1.5-pro');
 * ```
 */
export const createGoogleProvider = module.createProvider;

/**
 * Default Google Generative AI provider instance
 * Uses environment variables for configuration
 *
 * @category Providers
 */
export const google = module.provider;

/**
 * Common Google Gemini model identifiers
 *
 * @category Providers
 */
export const GoogleModels = module.models;

export type GoogleModel = typeof GoogleModels[keyof typeof GoogleModels];
