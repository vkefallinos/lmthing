/**
 * Vitest setup file
 * Loads environment variables from .env file for integration tests
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove inline comments
      const commentIndex = value.indexOf('#');
      if (commentIndex !== -1) {
        // Make sure the # is not inside quotes
        const beforeComment = value.substring(0, commentIndex);
        const quoteCount = (beforeComment.match(/"/g) || []).length;
        if (quoteCount % 2 === 0) {
          value = beforeComment.trim();
        }
      }

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  }

  return result;
}

// Try to load .env file
const envPath = resolve(process.cwd(), '.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  const envVars = parseEnvFile(envContent);

  // Set environment variables
  for (const [key, value] of Object.entries(envVars)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch (error) {
  // .env file doesn't exist or can't be read - that's okay
  // Integration tests will be skipped
}
