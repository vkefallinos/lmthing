import { createVertex } from '@ai-sdk/google-vertex';

/**
 * Google Vertex AI Provider Configuration
 *
 * Supports Google Vertex AI models including Gemini
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/google-vertex
 */

export interface VertexConfig {
  project?: string;
  location?: string;
  googleAuthOptions?: {
    credentials?: object;
    keyFilename?: string;
    scopes?: string[];
  };
}

/**
 * Create a Google Vertex AI provider instance
 *
 * @param config - Configuration options for Google Vertex AI
 * @returns Google Vertex AI provider instance
 *
 * @example
 * ```typescript
 * const vertex = createVertexProvider({
 *   project: process.env.GOOGLE_VERTEX_PROJECT,
 *   location: process.env.GOOGLE_VERTEX_LOCATION
 * });
 *
 * const model = vertex('gemini-1.5-pro');
 * ```
 */
export function createVertexProvider(config?: VertexConfig) {
  return createVertex({
    project: config?.project || process.env.GOOGLE_VERTEX_PROJECT,
    location: config?.location || process.env.GOOGLE_VERTEX_LOCATION || 'us-central1',
    googleAuthOptions: config?.googleAuthOptions,
  });
}

/**
 * Default Google Vertex AI provider instance
 * Uses environment variables for configuration
 */
export const vertex = createVertexProvider();

/**
 * Common Google Vertex AI model identifiers
 */
export const VertexModels = {
  GEMINI_1_5_PRO: 'gemini-1.5-pro',
  GEMINI_1_5_PRO_002: 'gemini-1.5-pro-002',
  GEMINI_1_5_FLASH: 'gemini-1.5-flash',
  GEMINI_1_5_FLASH_002: 'gemini-1.5-flash-002',
  GEMINI_PRO: 'gemini-pro',
  GEMINI_PRO_VISION: 'gemini-pro-vision',
} as const;

export type VertexModel = typeof VertexModels[keyof typeof VertexModels];
