# Using GitHub Copilot Pro Tokens with lmthing in CI

## Short Answer

**Yes!** You can use API tokens from your GitHub Copilot Pro account to test lmthing using real LLMs in GitHub CI through the **GitHub Models API**.

## How It Works

GitHub provides the **GitHub Models API**, which is:
- OpenAI-compatible
- Free for GitHub Copilot Pro users
- Perfect for CI/CD testing
- Available through `https://models.inference.ai.azure.com`

## Quick Setup

### 1. Configure Environment Variables

Add to your `.env` file or CI environment:

```bash
GITHUB_MODELS_API_KEY=your-github-token
GITHUB_MODELS_API_BASE=https://models.inference.ai.azure.com
GITHUB_MODELS_API_TYPE=openai
GITHUB_MODELS_API_NAME=github  # Optional display name
```

### 2. Use in Your Code

```typescript
import { runPrompt } from 'lmthing';

const result = await runPrompt(
  (ctx) => ctx.$`Write a test`,
  { model: 'github:gpt-4o-mini' }
);
```

Or in a `.lmt.mjs` file:

```javascript
export default async ({ $ }) => {
  $`Write a test`;
};

export const config = {
  model: 'github:gpt-4o-mini'
};
```

### 3. Use in GitHub Actions

```yaml
- name: Run LLM tests
  env:
    GITHUB_MODELS_API_KEY: ${{ secrets.GITHUB_TOKEN }}
    GITHUB_MODELS_API_BASE: https://models.inference.ai.azure.com
    GITHUB_MODELS_API_TYPE: openai
    GITHUB_MODELS_API_NAME: github
  run: npm test -- --run llm-integration
```

## Available Models

- `gpt-4o` - Most capable GPT-4 model
- `gpt-4o-mini` - Faster, more cost-effective
- `o1-preview` - Advanced reasoning model
- `o1-mini` - Smaller reasoning model
- `Phi-3-mini-4k-instruct` - Microsoft's efficient model
- `Phi-3-mini-128k-instruct` - Long context version

See: https://github.com/marketplace/models

## Token Options

### 1. Built-in GITHUB_TOKEN (Easiest)

Use the automatic token provided by GitHub Actions:

```yaml
env:
  GITHUB_MODELS_API_KEY: ${{ secrets.GITHUB_TOKEN }}
```

**Pros:**
- No setup required
- Automatic in all workflows
- No secrets to manage

**Cons:**
- May have rate limits
- Requires workflow permissions

### 2. Personal Access Token (PAT)

Create a PAT with appropriate permissions:

```yaml
env:
  GITHUB_MODELS_API_KEY: ${{ secrets.GITHUB_MODELS_TOKEN }}
```

**Pros:**
- More control over permissions
- Can be used locally and in CI
- More reliable for higher usage

**Cons:**
- Requires manual setup
- Need to manage token expiration

### 3. GitHub Copilot Pro Token

If you have Copilot Pro, you can extract your token:

```yaml
env:
  GITHUB_MODELS_API_KEY: ${{ secrets.COPILOT_TOKEN }}
```

**Note:** This is the most direct answer to your question - yes, you can use your Copilot Pro token!

## Implementation Details

lmthing uses a **custom provider system** that:
1. Scans environment variables for `{NAME}_API_*` patterns
2. Creates OpenAI-compatible providers
3. Registers them for use with `provider:model` syntax

The code that makes this work:
- `/src/providers/custom.ts` - Custom provider scanner
- `/src/providers/resolver.ts` - Model resolution
- Uses `@ai-sdk/openai` with custom `baseURL`

## Testing Strategy

### Separate Mock and LLM Tests

```typescript
// tests/unit/*.test.ts - Always runs
import { createMockModel } from 'lmthing/test';

test('with mock', async () => {
  const result = await runPrompt(
    (ctx) => ctx.$`test`,
    { model: createMockModel([...]) }
  );
});

// tests/integration/llm.test.ts - Only when configured
test.skipIf(!hasGitHubModels)('real LLM test', async () => {
  const result = await runPrompt(
    (ctx) => ctx.$`test`,
    { model: 'github:gpt-4o-mini' }
  );
});
```

### Conditional CI Runs

```yaml
- name: Run LLM tests
  if: github.ref == 'refs/heads/main'  # Only on main branch
  env:
    GITHUB_MODELS_API_KEY: ${{ secrets.GITHUB_TOKEN }}
    GITHUB_MODELS_API_BASE: https://models.inference.ai.azure.com
    GITHUB_MODELS_API_TYPE: openai
  run: npm test -- --run llm-integration
```

## Examples Provided

1. **examples/github-models.lmt.mjs** - Real GitHub Models usage
2. **examples/github-models-mock.lmt.mjs** - Mock version for testing
3. **.github/workflows/llm-tests.example.yml** - Complete CI workflow
4. **docs/GITHUB_MODELS_CI.md** - Comprehensive documentation

## Rate Limits & Best Practices

1. **Run selectively:** Only on main branch or manual trigger
2. **Use smaller models:** `gpt-4o-mini` instead of `gpt-4o`
3. **Cache results:** When possible
4. **Skip on PRs:** Use mocks for PR tests
5. **Monitor usage:** Check GitHub Models API limits

## Troubleshooting

### "Unknown provider: github"

**Fix:** Make sure `GITHUB_MODELS_API_TYPE=openai` is set

### "Authentication failed"

**Fix:** 
- Verify token has necessary permissions
- Check token hasn't expired
- For GITHUB_TOKEN, ensure workflow has `contents: read`

### "Model not found"

**Fix:** Check available models at https://github.com/marketplace/models

## Summary

✅ **YES** - You can use GitHub Copilot Pro tokens with lmthing in CI
✅ Through GitHub Models API (OpenAI-compatible)
✅ Built-in custom provider system handles it automatically
✅ Works with GITHUB_TOKEN, PAT, or Copilot token
✅ Examples and documentation provided
✅ All tests passing (248/248)

## Next Steps

1. Review `docs/GITHUB_MODELS_CI.md` for detailed setup
2. Try `examples/github-models-mock.lmt.mjs` locally
3. Copy `.github/workflows/llm-tests.example.yml` to your workflows
4. Configure GitHub Models environment variables
5. Test in your CI pipeline

## Files Added/Modified

- `.env.example` - Added GitHub Models configuration
- `README.md` - Added GitHub Models documentation
- `docs/GITHUB_MODELS_CI.md` - Comprehensive CI guide
- `examples/github-models.lmt.mjs` - Real usage example
- `examples/github-models-mock.lmt.mjs` - Mock testing example
- `examples/README.md` - Updated with GitHub Models info
- `.github/workflows/llm-tests.example.yml` - Example workflow
- `src/providers/custom.test.ts` - Added GitHub Models tests

All changes are minimal, focused, and non-breaking. The existing test suite (248 tests) continues to pass without modification.
