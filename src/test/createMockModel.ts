import { MockLanguageModelV2 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import { LanguageModelV2FunctionTool, LanguageModelV2Message, LanguageModelV2ProviderDefinedTool, LanguageModelV2ToolChoice } from '@ai-sdk/provider';

/**
 * Type for mock content that can be text or tool calls
 */
export type MockContent = 
  | { type: 'text'; text: string }
  | { 
      type: 'tool-call'; 
      toolCallId: string; 
      toolName: string; 
      args: Record<string, any> 
    };

/**
 * Configuration options for the mock model
 */
export interface MockModelConfig {
  /** Simulate delay in milliseconds (optional) */
  delay?: number;
  /** Simulate token usage (optional) */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Enable/disable streaming behavior (default: true) */
  streaming?: boolean;
}
export interface InputStep { 
  maxOutputTokens?: number;
  temperature?: number;
  tools?: (LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool)[],
  toolChoice?: LanguageModelV2ToolChoice,
  prompt?: LanguageModelV2Message[],
  includeRawChunks?: boolean;

}

/**
 * Creates a mock language model for testing purposes
 * 
 * @param content - Array of mock content items (text or tool calls) to be executed in order
 * @param config - Optional configuration for delays, usage, and streaming behavior
 * @returns A MockLanguageModelV2 instance that simulates LLM behavior
 * 
 * @example
 * ```typescript
 * const mockModel = createMockModel([
 *   { type: 'text', text: 'Hello!' },
 *   { 
 *     type: 'tool-call', 
 *     toolCallId: 'call_1', 
 *     toolName: 'calculator', 
 *     args: { a: 5, b: 3 } 
 *   },
 *   { type: 'text', text: 'The result is 8.' }
 * ]);
 * ```
 */
export function createMockModel(
  content: MockContent[], 
  config: MockModelConfig = {}
) {
  const { delay = 0, usage, streaming = true } = config;
  
  const defaultUsage = usage ? {
    ...usage,
    totalTokens: usage.inputTokens + usage.outputTokens,
  } : {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
  };

  // Track which content index we're at across multiple doStream calls
  let currentContentIndex = 0;
  let inputSteps: InputStep[] = [];
  const mockModel = new MockLanguageModelV2({
    doStream: async (req) => {
      inputSteps.push(req);
      // Simulate delay if configured
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const chunks: any[] = [];

      // Add response-metadata
      chunks.push({ type: 'response-metadata', id: 'response-id' });

      // Add text-start
      chunks.push({ type: 'text-start', id: '0' });

      // Process content items starting from currentContentIndex
      // Stop when we hit a tool call (and include it), then increment for next call
      let hasToolCall = false;
      
      while (currentContentIndex < content.length) {
        const item = content[currentContentIndex];
        currentContentIndex++;

        if (item.type === 'text') {
          // Add text part
          chunks.push({ type: 'text-delta', id: '0', delta: item.text });
        } else if (item.type === 'tool-call') {
          chunks.push({
            type: 'tool-call',
            toolCallId: item.toolCallId,
            toolName: item.toolName,
            input: JSON.stringify(item.args),
          });
          hasToolCall = true;
          // Stop here - the next doStream call will continue from the next item
          break;
        }
      }
      
      // Add finish chunk
      chunks.push({
        type: 'finish',
        finishReason: hasToolCall ? 'tool-calls' : 'stop',
        usage: defaultUsage,
      });

      return {
        stream: simulateReadableStream({ chunks }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  }) as MockLanguageModelV2 & { steps: ()=>InputStep[] };

  mockModel.steps = ()=>{return inputSteps}
  return mockModel ;
}
