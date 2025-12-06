/**
 * Weather tool example
 *
 * Run with: npx lmthing run examples/weather.lmt.mjs
 *
 * Demonstrates how to define and use tools
 */
import { z } from 'zod';

export default async ({ defSystem, def, defTool, $ }) => {
  defSystem('role', 'You are a helpful weather assistant.');

  // Define a mock weather tool
  defTool(
    'getWeather',
    'Get current weather for a city',
    z.object({
      city: z.string().describe('The city name'),
      unit: z.enum(['celsius', 'fahrenheit']).default('celsius')
    }),
    async ({ city, unit }) => {
      // In a real app, this would call a weather API
      const temps = {
        'New York': { celsius: 22, fahrenheit: 72 },
        'London': { celsius: 15, fahrenheit: 59 },
        'Tokyo': { celsius: 28, fahrenheit: 82 },
        'Sydney': { celsius: 18, fahrenheit: 64 }
      };

      const cityData = temps[city] || { celsius: 20, fahrenheit: 68 };
      const temp = unit === 'celsius' ? cityData.celsius : cityData.fahrenheit;

      return {
        city,
        temperature: temp,
        unit,
        condition: 'Partly cloudy',
        humidity: 65
      };
    }
  );

  const city = def('CITY', 'Tokyo');
  $`What's the weather like in ${city}? Please use the getWeather tool.`;
};

export const config = {
  model: 'openai:gpt-4o-mini'
};
