/**
 * Demo example using mock model (for testing without API keys)
 *
 * Run with: npx lmthing run examples/mock-demo.lmt.mjs
 *
 * This example uses a mock model to demonstrate the CLI works.
 * When config.model is "mock", the CLI uses the exported mock array.
 */

// Mock response data - no imports needed!
export const mock = [
  { type: 'text', text: 'Hello! ' },
  { type: 'text', text: 'Welcome to lmthing! ' },
  { type: 'text', text: 'This is a demo running with a mock model. ' },
  { type: 'text', text: 'In real usage, you would configure a real model like openai:gpt-4o.' }
];

export default async ({ def, defSystem, $ }) => {
  defSystem('role', 'You are a helpful assistant demonstrating lmthing.');

  const feature = def('FEATURE', 'CLI');
  $`Welcome the user to lmthing and explain the ${feature} feature briefly.`;
};

export const config = {
  model: 'mock'
};
