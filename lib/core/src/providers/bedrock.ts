import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { defineProvider } from './factory';

/**
 * Amazon Bedrock Provider Configuration
 *
 * Supports AWS Bedrock models including Claude, Llama, Titan, and more
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/amazon-bedrock
 */

export interface BedrockConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

const BedrockModelsObj = {
  // Anthropic Claude models
  CLAUDE_3_5_SONNET_V2: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  CLAUDE_3_5_SONNET: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  CLAUDE_3_OPUS: 'anthropic.claude-3-opus-20240229-v1:0',
  CLAUDE_3_SONNET: 'anthropic.claude-3-sonnet-20240229-v1:0',
  CLAUDE_3_HAIKU: 'anthropic.claude-3-haiku-20240307-v1:0',

  // Meta Llama models
  LLAMA_3_2_1B: 'us.meta.llama3-2-1b-instruct-v1:0',
  LLAMA_3_2_3B: 'us.meta.llama3-2-3b-instruct-v1:0',
  LLAMA_3_2_11B: 'us.meta.llama3-2-11b-instruct-v1:0',
  LLAMA_3_2_90B: 'us.meta.llama3-2-90b-instruct-v1:0',

  // Amazon Titan models
  TITAN_TEXT_EXPRESS: 'amazon.titan-text-express-v1',
  TITAN_TEXT_LITE: 'amazon.titan-text-lite-v1',

  // Mistral models
  MISTRAL_7B: 'mistral.mistral-7b-instruct-v0:2',
  MIXTRAL_8X7B: 'mistral.mixtral-8x7b-instruct-v0:1',
} as const;

const module = defineProvider<BedrockConfig, typeof BedrockModelsObj>({
  name: 'bedrock',
  envKey: 'AWS_ACCESS_KEY_ID',
  sdkFactory: createAmazonBedrock,
  mapConfig: (config) => ({
    region: config.region || process.env.AWS_REGION || 'us-east-1',
    accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: config.sessionToken || process.env.AWS_SESSION_TOKEN,
  }),
  models: BedrockModelsObj,
});

/**
 * Create an Amazon Bedrock provider instance
 *
 * @param config - Configuration options for Amazon Bedrock
 * @returns Amazon Bedrock provider instance
 *
 * @example
 * ```typescript
 * const bedrock = createBedrockProvider({
 *   region: 'us-east-1',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
 * });
 *
 * const model = bedrock('anthropic.claude-3-5-sonnet-20241022-v2:0');
 * ```
 */
export const createBedrockProvider = module.createProvider;

/**
 * Default Amazon Bedrock provider instance
 * Uses environment variables for configuration
 */
export const bedrock = module.provider;

/**
 * Common Amazon Bedrock model identifiers
 */
export const BedrockModels = BedrockModelsObj;

export type BedrockModel = typeof BedrockModels[keyof typeof BedrockModels];
