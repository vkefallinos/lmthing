import { z } from 'zod';

/**
 * Shared interface for a sub-definition within a composite tool or agent.
 */
export interface SubDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
}

/**
 * Creates a discriminated union schema for composite tool/agent calls.
 *
 * @param subs - Array of sub-definitions with name and inputSchema
 * @param labelPrefix - Prefix for discriminator descriptions (e.g., "sub-tool" or "agent")
 * @returns A Zod schema for { calls: Array<{ name, args }> }
 */
export function createCompositeSchema(
  subs: SubDefinition[],
  labelPrefix: string
) {
  const callSchemas = subs.map(sub =>
    z.object({
      name: z.literal(sub.name).describe(`Call the "${sub.name}" ${labelPrefix}`),
      args: sub.inputSchema.describe(sub.description)
    })
  );

  return z.object({
    calls: z.array(
      z.union(callSchemas as any as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
    ).describe(`Array of ${labelPrefix} calls to execute`)
  });
}

/**
 * Builds an enhanced description that lists available sub-items.
 *
 * @param baseDescription - The top-level description
 * @param subs - Array of sub-definitions with name and description
 * @param itemType - Label for the items (e.g., "sub-tools", "sub-agents")
 * @returns Enhanced description string
 */
export function buildEnhancedDescription(
  baseDescription: string,
  subs: SubDefinition[],
  itemType: string
): string {
  const docs = subs.map(s => `  - ${s.name}: ${s.description}`).join('\n');
  return `${baseDescription}\n\nAvailable ${itemType}:\n${docs}`;
}
