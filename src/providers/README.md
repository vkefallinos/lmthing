# AI Provider Setup

This directory contains configuration for all available AI providers supported by the AI SDK.

## Available Providers

### OpenAI
- **Models**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo, o1-preview, o1-mini
- **Environment Variable**: `OPENAI_API_KEY`
- **Documentation**: https://sdk.vercel.ai/providers/ai-sdk-providers/openai

```typescript
import { openai, OpenAIModels } from 'lmthing/providers';

const model = openai(OpenAIModels.GPT4O);
```

### Anthropic
- **Models**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku
- **Environment Variable**: `ANTHROPIC_API_KEY`
- **Documentation**: https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic

```typescript
import { anthropic, AnthropicModels } from 'lmthing/providers';

const model = anthropic(AnthropicModels.CLAUDE_3_5_SONNET);
```

### Google Generative AI
- **Models**: Gemini 1.5 Pro, Gemini 1.5 Flash
- **Environment Variable**: `GOOGLE_GENERATIVE_AI_API_KEY`
- **Documentation**: https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai

```typescript
import { google, GoogleModels } from 'lmthing/providers';

const model = google(GoogleModels.GEMINI_1_5_PRO);
```

### Mistral
- **Models**: Mistral Large, Medium, Small, Codestral, Mixtral
- **Environment Variable**: `MISTRAL_API_KEY`
- **Documentation**: https://sdk.vercel.ai/providers/ai-sdk-providers/mistral

```typescript
import { mistral, MistralModels } from 'lmthing/providers';

const model = mistral(MistralModels.LARGE_LATEST);
```

### Azure OpenAI
- **Models**: Azure-deployed OpenAI models
- **Environment Variables**: `AZURE_API_KEY`, `AZURE_RESOURCE_NAME`
- **Documentation**: https://sdk.vercel.ai/providers/ai-sdk-providers/azure

```typescript
import { azure } from 'lmthing/providers';

const model = azure('your-deployment-name');
```

### Groq
- **Models**: Llama 3.3, Llama 3.1, Llama 3.2, Mixtral, Gemma
- **Environment Variable**: `GROQ_API_KEY`
- **Documentation**: https://sdk.vercel.ai/providers/ai-sdk-providers/groq

```typescript
import { groq, GroqModels } from 'lmthing/providers';

const model = groq(GroqModels.LLAMA_3_3_70B_VERSATILE);
```

### Cohere
- **Models**: Command R+, Command R, Command
- **Environment Variable**: `COHERE_API_KEY`
- **Documentation**: https://sdk.vercel.ai/providers/ai-sdk-providers/cohere

```typescript
import { cohere, CohereModels } from 'lmthing/providers';

const model = cohere(CohereModels.COMMAND_R_PLUS);
```

### Amazon Bedrock
- **Models**: Claude, Llama, Titan, Mistral via AWS Bedrock
- **Environment Variables**: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- **Documentation**: https://sdk.vercel.ai/providers/ai-sdk-providers/amazon-bedrock

```typescript
import { bedrock, BedrockModels } from 'lmthing/providers';

const model = bedrock(BedrockModels.CLAUDE_3_5_SONNET_V2);
```

### Google Vertex AI
- **Models**: Gemini via Google Cloud Vertex AI
- **Environment Variables**: `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION`
- **Documentation**: https://sdk.vercel.ai/providers/ai-sdk-providers/google-vertex

```typescript
import { vertex, VertexModels } from 'lmthing/providers';

const model = vertex(VertexModels.GEMINI_1_5_PRO);
```

## Usage with runPrompt

All providers can be used directly with the `runPrompt` function in two ways:

### 1. Using Provider Instances (Direct)

```typescript
import { runPrompt } from 'lmthing';
import { openai, OpenAIModels } from 'lmthing/providers';

const result = await runPrompt(
  (ctx) => {
    ctx.$`Write a short poem about AI`;
  },
  {
    model: openai(OpenAIModels.GPT4O),
  }
);
```

### 2. Using String Format (Recommended)

The string format `"provider:modelId"` is the recommended approach as it's more concise and easier to configure:

```typescript
import { runPrompt } from 'lmthing';

const result = await runPrompt(
  (ctx) => {
    ctx.$`Write a short poem about AI`;
  },
  {
    model: 'openai:gpt-4o',
  }
);

// Works with all providers
const result2 = await runPrompt(
  (ctx) => ctx.$`Hello!`,
  { model: 'anthropic:claude-3-5-sonnet-20241022' }
);

// Even supports complex model IDs (e.g., Bedrock)
const result3 = await runPrompt(
  (ctx) => ctx.$`Hi there!`,
  { model: 'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0' }
);
```

### String Format Examples

All providers support the `"provider:modelId"` format:

```typescript
// OpenAI
'openai:gpt-4o'
'openai:gpt-4o-mini'
'openai:gpt-3.5-turbo'

// Anthropic
'anthropic:claude-3-5-sonnet-20241022'
'anthropic:claude-3-opus-20240229'

// Google
'google:gemini-1.5-pro'
'google:gemini-1.5-flash'

// Mistral
'mistral:mistral-large-latest'
'mistral:codestral-latest'

// Groq
'groq:llama-3.3-70b-versatile'
'groq:mixtral-8x7b-32768'

// Cohere
'cohere:command-r-plus'

// Amazon Bedrock (supports model IDs with colons)
'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0'
'bedrock:us.meta.llama3-2-90b-instruct-v1:0'

// Google Vertex AI
'vertex:gemini-1.5-pro'

// Azure (use your deployment name)
'azure:your-deployment-name'
```

### Using with defAgent

Agents can also use the string format for their models:

```typescript
import { runPrompt } from 'lmthing';
import { z } from 'zod';

await runPrompt(
  (ctx) => {
    // Agent with a different model
    ctx.defAgent(
      'researcher',
      'Research topics in depth',
      z.object({ topic: z.string() }),
      async (args, agentCtx) => {
        agentCtx.$`Research ${args.topic}`;
      },
      {
        model: 'anthropic:claude-3-opus-20240229', // String format
        temperature: 0.2,
      }
    );

    ctx.$`Research quantum computing`;
  },
  {
    model: 'openai:gpt-4o', // Main model
  }
);
```

## Provider Registry

Access all providers through the centralized registry:

```typescript
import { providers, getProvider, listProviders } from 'lmthing/providers';

// Get all providers
console.log(providers);

// Get a specific provider by name
const openai = getProvider('openai');

// List all available provider names
const providerNames = listProviders();
console.log(providerNames); // ['openai', 'anthropic', 'google', ...]
```

## Custom Configuration

Each provider supports custom configuration:

```typescript
import { createOpenAIProvider } from 'lmthing/providers';

const customOpenAI = createOpenAIProvider({
  apiKey: 'custom-key',
  baseURL: 'https://custom-endpoint.com',
  organization: 'org-id',
});

const model = customOpenAI('gpt-4o');
```

## Custom OpenAI-Compatible Providers

You can add any OpenAI-compatible provider using environment variables. This is useful for services like OpenRouter, Together AI, Perplexity, and other providers that support the OpenAI API format.

### Configuration

Custom providers are configured using environment variables with this pattern:

- `CUSTOM_PROVIDER_{NAME}_API_KEY`: Your API key
- `CUSTOM_PROVIDER_{NAME}_BASE_URL`: The API endpoint URL
- `CUSTOM_PROVIDER_{NAME}_NAME`: (Optional) Display name (defaults to lowercase NAME)

### Examples

**Z.AI**
```bash
CUSTOM_PROVIDER_ZAI_API_KEY=your-zai-api-key-here
CUSTOM_PROVIDER_ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4
CUSTOM_PROVIDER_ZAI_NAME=zai
```

**OpenRouter**
```bash
CUSTOM_PROVIDER_OPENROUTER_API_KEY=your-openrouter-api-key-here
CUSTOM_PROVIDER_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
CUSTOM_PROVIDER_OPENROUTER_NAME=openrouter
```

**Together AI**
```bash
CUSTOM_PROVIDER_TOGETHER_API_KEY=your-together-api-key-here
CUSTOM_PROVIDER_TOGETHER_BASE_URL=https://api.together.xyz/v1
CUSTOM_PROVIDER_TOGETHER_NAME=together
```

**Perplexity**
```bash
CUSTOM_PROVIDER_PERPLEXITY_API_KEY=your-perplexity-api-key-here
CUSTOM_PROVIDER_PERPLEXITY_BASE_URL=https://api.perplexity.ai
CUSTOM_PROVIDER_PERPLEXITY_NAME=perplexity
```

### Usage

Custom providers work seamlessly with the string format:

```typescript
import { runPrompt } from 'lmthing';

// Use Z.AI
const result = await runPrompt(
  (ctx) => ctx.$`Write a poem`,
  { model: 'zai:gpt-4o' }
);

// Use OpenRouter
const result2 = await runPrompt(
  (ctx) => ctx.$`Hello!`,
  { model: 'openrouter:anthropic/claude-3.5-sonnet' }
);

// Use Together AI
const result3 = await runPrompt(
  (ctx) => ctx.$`Hi there!`,
  { model: 'together:meta-llama/Llama-3-70b-chat-hf' }
);
```

### Programmatic Access

You can also work with custom providers programmatically:

```typescript
import {
  scanCustomProviders,
  getCustomProviders,
  getCustomProvider,
  listCustomProviders,
  isCustomProvider,
  createCustomProvider,
} from 'lmthing/providers';

// Scan for all custom providers in environment
const configs = scanCustomProviders();

// Get all custom providers
const customProviders = getCustomProviders();

// List custom provider names
const names = listCustomProviders(); // ['zai', 'openrouter', 'together', ...]

// Check if a provider is custom
const isCustom = isCustomProvider('zai'); // true

// Get a specific custom provider
const zai = getCustomProvider('zai');
if (zai) {
  const model = zai('gpt-4o');
}

// Create a custom provider manually
const myProvider = createCustomProvider({
  name: 'myprovider',
  apiKey: 'your-key',
  baseURL: 'https://api.example.com/v1',
  prefix: 'MYPROVIDER',
});
```

### Discovery and Registration

Custom providers are automatically discovered and registered when you import from `lmthing/providers`. The system:

1. Scans environment variables for the `CUSTOM_PROVIDER_{NAME}_*` pattern
2. Creates provider instances for each valid configuration
3. Makes them available through the string format resolver
4. Allows access via the custom provider utilities

No additional setup or registration code is required - just set the environment variables and use the provider name in your model strings.

## Environment Variables

Copy `.env.example` to `.env` and add your API keys:

```bash
cp .env.example .env
```

Then edit `.env` with your actual API keys for the providers you want to use.

## Notes

- Not all providers require authentication (e.g., some local models)
- Some providers have additional configuration options
- Check each provider's documentation for specific requirements
- Provider availability may depend on your account and region
