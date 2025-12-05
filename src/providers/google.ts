import { createGoogleGenerativeAI } from '@ai-sdk/google';

/**
 * Google Generative AI Provider Configuration
 *
 * Supports Gemini models
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai
 */

export interface GoogleConfig {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Create a Google Generative AI provider instance
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
export function createGoogleProvider(config?: GoogleConfig) {
  return createGoogleGenerativeAI({
    apiKey: config?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    baseURL: config?.baseURL,
  });
}

/**
 * Default Google Generative AI provider instance
 * Uses environment variables for configuration
 */
export const google = createGoogleProvider();

/**
 * Common Google Gemini model identifiers
 */
export const GoogleModels = {
  GEMINI_1_5_PRO: 'gemini-1.5-pro',
  GEMINI_1_5_PRO_LATEST: 'gemini-1.5-pro-latest',
  GEMINI_1_5_FLASH: 'gemini-1.5-flash',
  GEMINI_1_5_FLASH_LATEST: 'gemini-1.5-flash-latest',
  GEMINI_PRO: 'gemini-pro',
  GEMINI_PRO_VISION: 'gemini-pro-vision',
} as const;

export type GoogleModel = typeof GoogleModels[keyof typeof GoogleModels];
