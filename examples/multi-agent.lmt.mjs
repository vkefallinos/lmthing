/**
 * Multi-agent example
 *
 * Run with: npx lmthing run examples/multi-agent.lmt.mjs
 *
 * Demonstrates how to define and use hierarchical agents
 */
import { z } from 'zod';

export default async ({ defSystem, defAgent, $ }) => {
  defSystem('role', 'You are an orchestrator that coordinates specialist agents.');

  // Define a research agent
  defAgent(
    'researcher',
    'Research and summarize information about a topic',
    z.object({
      topic: z.string().describe('The topic to research')
    }),
    async ({ topic }, agentPrompt) => {
      agentPrompt.defSystem('role', 'You are a research specialist.');
      agentPrompt.$`Research and provide key facts about: ${topic}`;
    },
    { model: 'openai:gpt-4o-mini' }
  );

  // Define a writer agent
  defAgent(
    'writer',
    'Write content based on research findings',
    z.object({
      content: z.string().describe('The research content to expand'),
      style: z.enum(['formal', 'casual', 'technical']).describe('Writing style')
    }),
    async ({ content, style }, agentPrompt) => {
      agentPrompt.defSystem('role', `You are a ${style} content writer.`);
      agentPrompt.$`Expand on this content in a ${style} style: ${content}`;
    },
    { model: 'openai:gpt-4o-mini' }
  );

  $`Use the researcher agent to find information about "renewable energy",
    then use the writer agent to create a casual summary.`;
};

export const config = {
  model: 'openai:gpt-4o'
};
