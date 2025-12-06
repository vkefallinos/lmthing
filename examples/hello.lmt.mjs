/**
 * Simple hello world example
 *
 * Run with: npx lmthing run examples/hello.lmt.mjs
 *
 * Requires OPENAI_API_KEY environment variable
 */

export default async ({ def, $ }) => {
  const name = def('NAME', 'World');
  $`Say hello to ${name} in a friendly way.`;
};

export const config = {
  model: 'openai:gpt-4o-mini'
};
