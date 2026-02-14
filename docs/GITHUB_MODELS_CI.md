# Using GitHub Models API in CI

This guide explains how to use GitHub Models API with lmthing in GitHub Actions CI/CD pipelines.

## What is GitHub Models API?

GitHub Models API provides access to various AI models (GPT-4, Phi-3, etc.) through an OpenAI-compatible API. It's free for use in GitHub Copilot Pro accounts and can be used in GitHub Actions with the built-in `GITHUB_TOKEN`.

**Available models:** gpt-4o, gpt-4o-mini, o1-preview, o1-mini, Phi-3-mini, Phi-3-medium, and more.

See: https://github.com/marketplace/models

## Setup for Local Development

Add these environment variables to your `.env` file:

```bash
GITHUB_MODELS_API_KEY=your-github-personal-access-token
GITHUB_MODELS_API_BASE=https://models.inference.ai.azure.com
GITHUB_MODELS_API_TYPE=openai
GITHUB_MODELS_API_NAME=github  # Optional display name
```

Then use in your code:

```typescript
import { runPrompt } from 'lmthing';

const result = await runPrompt(
  (ctx) => ctx.$`Write a haiku about coding`,
  { model: 'github:gpt-4o-mini' }
);
```

Or in a `.lmt.mjs` file:

```javascript
export default async ({ $ }) => {
  $`Write a haiku about coding`;
};

export const config = {
  model: 'github:gpt-4o-mini'
};
```

## Using in GitHub Actions

### Option 1: Using GITHUB_TOKEN (Built-in)

The simplest approach uses the built-in `GITHUB_TOKEN` that's automatically available in GitHub Actions:

```yaml
name: Test with Real LLMs

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test-with-llm:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20.x'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run LLM tests
      env:
        GITHUB_MODELS_API_KEY: ${{ secrets.GITHUB_TOKEN }}
        GITHUB_MODELS_API_BASE: https://models.inference.ai.azure.com
        GITHUB_MODELS_API_TYPE: openai
        GITHUB_MODELS_API_NAME: github
      run: |
        npm test -- --run llm-integration
        # Or run specific examples:
        # npx lmthing run examples/github-models.lmt.mjs
```

### Option 2: Using Personal Access Token (PAT)

For more control or if GITHUB_TOKEN doesn't work, use a Personal Access Token:

1. Create a GitHub Personal Access Token (PAT) with appropriate permissions
2. Add it as a repository secret (Settings → Secrets → Actions → New repository secret)
3. Name it `GITHUB_MODELS_TOKEN` or similar

```yaml
name: Test with Real LLMs (PAT)

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test-with-llm:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20.x'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run LLM tests
      env:
        GITHUB_MODELS_API_KEY: ${{ secrets.GITHUB_MODELS_TOKEN }}
        GITHUB_MODELS_API_BASE: https://models.inference.ai.azure.com
        GITHUB_MODELS_API_TYPE: openai
        GITHUB_MODELS_API_NAME: github
      run: npm test -- --run llm-integration
```

### Option 3: Using GitHub Copilot Pro Token

If you have a GitHub Copilot Pro subscription, you can use your access token:

1. Extract your GitHub Copilot token from your IDE/browser session
2. Add it as a repository secret named `COPILOT_TOKEN`
3. Use it in the workflow:

```yaml
- name: Run LLM tests
  env:
    GITHUB_MODELS_API_KEY: ${{ secrets.COPILOT_TOKEN }}
    GITHUB_MODELS_API_BASE: https://models.inference.ai.azure.com
    GITHUB_MODELS_API_TYPE: openai
    GITHUB_MODELS_API_NAME: github
  run: npm test -- --run llm-integration
```

## Testing Strategy

### Separate Mock and LLM Tests

Keep mock tests separate from LLM integration tests to avoid unnecessary API calls:

```typescript
// tests/unit/my-feature.test.ts - Always runs with mocks
import { runPrompt } from 'lmthing';
import { createMockModel } from 'lmthing/test';

test('my feature works', async () => {
  const mockModel = createMockModel([
    { type: 'text', text: 'Hello!' }
  ]);
  
  const result = await runPrompt(
    (ctx) => ctx.$`Say hello`,
    { model: mockModel }
  );
  
  const text = await result.text;
  expect(text).toBe('Hello!');
});
```

```typescript
// tests/integration/llm.test.ts - Only runs when LLM is configured
import { runPrompt } from 'lmthing';

describe('LLM Integration', () => {
  // Skip if no GitHub Models API configured
  const hasGitHubModels = process.env.GITHUB_MODELS_API_KEY 
    && process.env.GITHUB_MODELS_API_TYPE === 'openai';
  
  test.skipIf(!hasGitHubModels)('real LLM test', async () => {
    const result = await runPrompt(
      (ctx) => ctx.$`Say "test passed"`,
      { model: 'github:gpt-4o-mini' }
    );
    
    const text = await result.text;
    expect(text.toLowerCase()).toContain('test passed');
  });
});
```

### Running LLM Tests Conditionally

In your CI workflow, only run LLM tests when the token is available:

```yaml
- name: Run unit tests (always)
  run: npm test

- name: Run LLM integration tests (when token available)
  if: env.GITHUB_MODELS_API_KEY != ''
  env:
    GITHUB_MODELS_API_KEY: ${{ secrets.GITHUB_TOKEN }}
    GITHUB_MODELS_API_BASE: https://models.inference.ai.azure.com
    GITHUB_MODELS_API_TYPE: openai
    GITHUB_MODELS_API_NAME: github
  run: npm test -- --run llm-integration
```

## Rate Limits and Costs

- **GitHub Token (GITHUB_TOKEN)**: Check GitHub's rate limits for the Models API
- **Personal Access Token**: Same rate limits as GITHUB_TOKEN
- **Copilot Pro**: Check your subscription's API usage limits

Consider:
- Caching test results where possible
- Only running LLM tests on main branch or specific triggers
- Using smaller/faster models for CI (gpt-4o-mini instead of gpt-4o)

## Troubleshooting

### "Unknown provider: github"

Make sure all environment variables are set:
```bash
GITHUB_MODELS_API_KEY=...
GITHUB_MODELS_API_BASE=https://models.inference.ai.azure.com
GITHUB_MODELS_API_TYPE=openai  # This is critical!
```

### "Authentication failed"

- Verify your GitHub token has the necessary permissions
- For GITHUB_TOKEN in Actions, check that the workflow has `contents: read` permission
- For PAT, ensure it's not expired

### "Model not found"

Check the available models at: https://github.com/marketplace/models

Common model IDs:
- `gpt-4o`
- `gpt-4o-mini`
- `o1-preview`
- `o1-mini`
- `Phi-3-mini-4k-instruct`
- `Phi-3-mini-128k-instruct`

## Complete Example Workflow

Here's a complete GitHub Actions workflow that runs both mock and LLM tests:

```yaml
name: CI with LLM Tests

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Setup Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests (mock)
      run: npm test
    
    - name: Build project
      run: npm run build
    
    - name: Run LLM integration tests
      if: github.event_name == 'push' && matrix.node-version == '20.x'
      env:
        GITHUB_MODELS_API_KEY: ${{ secrets.GITHUB_TOKEN }}
        GITHUB_MODELS_API_BASE: https://models.inference.ai.azure.com
        GITHUB_MODELS_API_TYPE: openai
        GITHUB_MODELS_API_NAME: github
      run: |
        echo "Running LLM tests with GitHub Models API..."
        npm test -- --run llm-integration || echo "LLM tests failed (may be rate limited)"
    
    - name: Run example with GitHub Models
      if: github.event_name == 'push' && matrix.node-version == '20.x'
      env:
        GITHUB_MODELS_API_KEY: ${{ secrets.GITHUB_TOKEN }}
        GITHUB_MODELS_API_BASE: https://models.inference.ai.azure.com
        GITHUB_MODELS_API_TYPE: openai
        GITHUB_MODELS_API_NAME: github
      run: |
        echo "Testing GitHub Models example..."
        npx lmthing run examples/github-models.lmt.mjs || echo "Example failed"
```

## Summary

You **can** use GitHub tokens (including those from Copilot Pro accounts) to test lmthing with real LLMs in GitHub CI through the GitHub Models API. The key steps are:

1. Configure the GitHub Models provider via environment variables
2. Use `github:model-name` format in your code
3. Set up CI to pass the token via secrets
4. Consider rate limits and test selectively

For more information:
- GitHub Models API: https://github.com/marketplace/models
- lmthing providers: See `src/providers/custom.ts`
- Custom providers example: See `.env.example`
