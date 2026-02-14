/**
 * GitHub Models API example
 *
 * This example demonstrates using GitHub Models API with lmthing.
 * GitHub Models API is OpenAI-compatible and works through the custom provider system.
 *
 * Setup:
 * 1. Set environment variables (see .env.example for GitHub Models section):
 *    GITHUB_MODELS_API_KEY=your-github-token
 *    GITHUB_MODELS_API_BASE=https://models.inference.ai.azure.com
 *    GITHUB_MODELS_API_TYPE=openai
 *
 * 2. Run with: npx lmthing run examples/github-models.lmt.mjs
 *
 * For CI/CD (GitHub Actions):
 * - Use secrets.GITHUB_TOKEN or a personal access token
 * - Available models: gpt-4o, gpt-4o-mini, o1-preview, o1-mini, Phi-3-*, etc.
 * - See: https://github.com/marketplace/models
 */

export default async ({ def, defSystem, $ }) => {
  defSystem('role', 'You are a helpful AI assistant running on GitHub Models API.');

  const topic = def('TOPIC', 'GitHub Models API');
  $`Explain what ${topic} is in 2-3 sentences.`;
};

export const config = {
  // Using GitHub Models API through custom provider
  // The 'github' prefix comes from GITHUB_MODELS_API_NAME or defaults to 'github_models'
  model: 'github:gpt-4o-mini'
};
