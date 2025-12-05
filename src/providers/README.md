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

All providers can be used directly with the `runPrompt` function:

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

// Or using string format (provider:model)
const result2 = await runPrompt(
  (ctx) => {
    ctx.$`Write a short poem about AI`;
  },
  {
    model: 'openai:gpt-4o',
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
