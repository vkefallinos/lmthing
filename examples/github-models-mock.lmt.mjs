/**
 * GitHub Models API example with mock
 *
 * This example demonstrates the structure for using GitHub Models API,
 * but uses a mock model so it can be tested without API credentials.
 *
 * Run with: npx lmthing run examples/github-models-mock.lmt.mjs
 */

// Mock response data - simulates GitHub Models API response
export const mock = [
  { type: 'text', text: 'GitHub Models API is a service provided by GitHub ' },
  { type: 'text', text: 'that offers access to various large language models (LLMs) ' },
  { type: 'text', text: 'including GPT-4, Phi-3, and others through an OpenAI-compatible interface. ' },
  { type: 'text', text: 'It can be used for free in GitHub Copilot Pro accounts ' },
  { type: 'text', text: 'and is perfect for CI/CD testing in GitHub Actions.' }
];

export default async ({ def, defSystem, $ }) => {
  defSystem('role', 'You are a helpful AI assistant running on GitHub Models API.');
  
  const topic = def('TOPIC', 'GitHub Models API');
  $`Explain what ${topic} is in 2-3 sentences.`;
};

export const config = {
  // Use 'mock' for testing without API credentials
  // For real usage, use: 'github:gpt-4o-mini'
  model: 'mock'
};
