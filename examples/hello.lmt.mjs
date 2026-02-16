/**
 * Hello example with function plugin
 *
 * Run with: npx lmthing run examples/hello.lmt.mjs
 *
 * Demonstrates the auto-loaded function plugin - defFunction is available
 * without needing to import or configure anything.
 */

import { z } from 'zod';

export default async ({ def, defFunction, $ }) => {
  const name = def('NAME', 'World');

  // Define a function the AI can call via TypeScript code execution
  defFunction(
    'getGreeting',
    'Get a greeting in a specific language',
    z.object({ language: z.enum(['english', 'spanish', 'french', 'german']) }),
    async ({ language }) => {
      const greetings = {
        english: 'Hello',
        spanish: 'Hola',
        french: 'Bonjour',
        german: 'Hallo'
      };
      return { greeting: greetings[language] };
    },
    {
      responseSchema: z.object({
        greeting: z.string()
      })
    }
  );

  $`Say hello to ${name}. Use the getGreeting function to fetch greetings in different languages if they ask.`;
};

export const config = {
  model: 'zai:glm-4.5'
};
