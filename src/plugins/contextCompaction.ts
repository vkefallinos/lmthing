/**
 * Context Compaction Plugin for lmthing
 *
 * Provides automatic conversation history summarization to manage token limits
 * during long sessions, similar to Claude Code's Context Compaction feature.
 *
 * When message history exceeds a configurable threshold, older messages are
 * summarized into a condensed system prompt, preserving key context while
 * reducing token usage.
 *
 * @example
 * import { contextCompactionPlugin } from 'lmthing/plugins';
 *
 * const { result } = await runPrompt(async ({ defCompaction, $ }) => {
 *   defCompaction({
 *     maxMessages: 20,
 *     summarySystemPrompt: 'Summarize the conversation so far concisely.',
 *   });
 *
 *   $`Begin a long conversation...`;
 * }, { model: 'openai:gpt-4o', plugins: [contextCompactionPlugin] });
 */

import type { StatefulPrompt } from '../StatefulPrompt';
import type { PromptContext } from '../types';

/**
 * Configuration options for context compaction
 */
export interface CompactionConfig {
  /**
   * Maximum number of messages to keep before compacting.
   * When messages exceed this count, older messages are summarized.
   * @default 50
   */
  maxMessages?: number;

  /**
   * Number of recent messages to always preserve (never compact).
   * These messages are kept as-is at the end of the history.
   * @default 10
   */
  preserveRecent?: number;

  /**
   * Custom system prompt used when generating the summary.
   * The default prompt instructs the model to create a concise summary.
   */
  summarySystemPrompt?: string;
}

const COMPACTION_STATE_KEY = '_compactionConfig';
const COMPACTION_SUMMARY_KEY = '_compactionSummary';

const DEFAULT_SUMMARY_PROMPT = `You are summarizing a conversation history. Create a concise summary that preserves:
- Key decisions and conclusions
- Important context and facts mentioned
- Current task state and goals
- Any tool calls made and their results

Be concise but preserve critical information needed to continue the conversation.`;

/**
 * Creates a context compaction system that automatically summarizes
 * conversation history when it exceeds the configured threshold.
 *
 * @category Plugins
 *
 * @param this - The StatefulPrompt instance (automatically bound)
 * @param config - Compaction configuration options
 */
export function defCompaction(
  this: StatefulPrompt,
  config: CompactionConfig = {}
): void {
  const {
    maxMessages = 50,
    preserveRecent = 10,
    summarySystemPrompt = DEFAULT_SUMMARY_PROMPT,
  } = config;

  // Store config in state
  this.defState(COMPACTION_STATE_KEY, { maxMessages, preserveRecent, summarySystemPrompt });
  this.defState(COMPACTION_SUMMARY_KEY, '');

  // Set up effect to check and compact messages on each step
  this.defEffect((ctx: PromptContext, stepModifier) => {
    const compactionConfig = this.getState<CompactionConfig>(COMPACTION_STATE_KEY);
    if (!compactionConfig) return;

    const max = compactionConfig.maxMessages ?? maxMessages;
    const preserve = compactionConfig.preserveRecent ?? preserveRecent;

    if (ctx.messages.length > max) {
      // Keep the most recent messages intact
      const messagesToSummarize = ctx.messages.slice(0, ctx.messages.length - preserve);
      const recentMessages = ctx.messages.slice(ctx.messages.length - preserve);

      // Build a textual summary of older messages
      const summaryParts: string[] = [];
      for (const msg of messagesToSummarize) {
        const role = msg.role || 'unknown';
        const content = typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join(' ')
            : JSON.stringify(msg.content);

        if (content) {
          summaryParts.push(`[${role}]: ${content.substring(0, 200)}`);
        }
      }

      const summaryText = summaryParts.join('\n');
      const compactedSummary = `<conversation_summary>\nThe following is a summary of earlier conversation messages (${messagesToSummarize.length} messages compacted):\n${summaryText}\n</conversation_summary>`;

      // Add the summary as a system section
      stepModifier('systems', [{
        name: 'conversationSummary',
        value: compactedSummary,
      }]);

      // Replace messages with only the recent ones
      stepModifier('messages', recentMessages);
    }
  });
}

/**
 * Context Compaction Plugin
 *
 * @category Plugins
 *
 * @example
 * import { contextCompactionPlugin } from 'lmthing/plugins';
 *
 * runPrompt(({ defCompaction }) => {
 *   defCompaction({ maxMessages: 30 });
 * }, { plugins: [contextCompactionPlugin] });
 */
export const contextCompactionPlugin = {
  defCompaction,
};
