/**
 * Interface for the proxy objects returned by def, defSystem, defTool, defAgent
 */
export interface DefinitionProxy {
  name: string;
  value: any;
  toString(): string;
  remind(): void;
}

/**
 * Interface for the prompt context passed to effects
 */
export interface PromptContext {
  messages: any[];
  tools: ToolCollection;
  systems: SystemCollection;
  variables: VariableCollection;
  lastTool: LastToolInfo | null;
  stepNumber: number;
}

/**
 * Collection utility for tools
 */
export interface ToolCollection {
  has(name: string): boolean;
  filter(predicate: (tool: any) => boolean): any[];
  [Symbol.iterator](): Iterator<any>;
}

/**
 * Collection utility for systems
 */
export interface SystemCollection {
  has(name: string): boolean;
  filter(predicate: (system: { name: string; value: string }) => boolean): { name: string; value: string }[];
  [Symbol.iterator](): Iterator<{ name: string; value: string }>;
}

/**
 * Collection utility for variables
 */
export interface VariableCollection {
  has(name: string): boolean;
  filter(predicate: (variable: { name: string; type: string; value: any }) => boolean): { name: string; type: string; value: any }[];
  [Symbol.iterator](): Iterator<{ name: string; type: string; value: any }>;
}

/**
 * Information about the last tool call
 */
export interface LastToolInfo {
  toolName: string;
  args: any;
  output: any;
}

/**
 * Step modifier function type
 */
export type StepModifier = (
  aspect: 'messages' | 'tools' | 'systems' | 'variables',
  items: any[]
) => void;

// ============================================================================
// Compressed Steps Types
// ============================================================================

/**
 * Processed message content part (from step output)
 */
export interface ProcessedMessagePart {
  type: 'text' | 'tool-call' | 'tool-result';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: any;
  output?: any;
  agentSteps?: any[];
}

/**
 * Processed message format used in compressed steps
 */
export interface ProcessedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ProcessedMessagePart[];
}

/**
 * Step output format
 */
export interface StepOutput {
  content: Array<{
    type: string;
    text?: string;
    toolCallId?: string;
    toolName?: string;
    input?: any;
  }>;
  finishReason?: string;
}

/**
 * Compressed step representation
 *
 * Instead of storing all messages for each step, we store:
 * - References to messages in the pool (messageRefs)
 * - Which refs are new since the previous step (deltaStart)
 * - State snapshot at this step
 */
export interface CompressedStep {
  /** Step index (0-based) */
  stepIndex: number;

  /**
   * Indices into the messagePool for this step's input messages.
   * To reconstruct full input: messageRefs.map(i => messagePool[i])
   */
  messageRefs: number[];

  /**
   * Index in messageRefs where new messages start (delta from previous step).
   * For step 0: deltaStart = 0 (all messages are new)
   * For step N: deltaStart = previous step's messageRefs.length
   *
   * New messages = messageRefs.slice(deltaStart)
   */
  deltaStart: number;

  /**
   * State snapshot at this step (from StatefulPrompt._stateStore).
   * For non-stateful prompts, this is an empty object.
   */
  state: Record<string, any>;

  /** Step output (same as original steps format) */
  output: StepOutput;
}

/**
 * Compressed steps data structure.
 *
 * This format stores messages in a deduplicated pool, with each step
 * referencing messages by index. This reduces memory usage from O(n²)
 * to O(n) for n steps, since each unique message is stored only once.
 *
 * @example
 * // Original steps: each step stores all messages up to that point
 * // Step 0: [sys, user]                    (2 messages)
 * // Step 1: [sys, user, asst, tool]        (4 messages, 2 repeated)
 * // Step 2: [sys, user, asst, tool, asst]  (5 messages, 4 repeated)
 * // Total: 11 message copies
 *
 * // Compressed: messages stored once in pool
 * // messagePool: [sys, user, asst, tool, asst_2]  (5 unique)
 * // Step 0: refs=[0,1], deltaStart=0
 * // Step 1: refs=[0,1,2,3], deltaStart=2
 * // Step 2: refs=[0,1,2,3,4], deltaStart=4
 * // Total: 5 messages + 12 refs = much smaller
 */
export interface CompressedSteps {
  /**
   * Pool of all unique messages across all steps.
   * Messages are added as encountered, not deduplicated by content
   * (since order and exact references matter).
   */
  messagePool: ProcessedMessage[];

  /** Compressed representation for each step */
  steps: CompressedStep[];

  /**
   * Reconstruct the full step at the given index.
   * Returns the same format as the original `steps` getter.
   */
  getStep(index: number): {
    input: { prompt: ProcessedMessage[] };
    output: StepOutput;
    state?: Record<string, any>;
  };

  /**
   * Get only the new (delta) messages for a step.
   * For step 0, returns all messages. For step N, returns messages
   * added since step N-1.
   */
  getDeltaMessages(index: number): ProcessedMessage[];

  /**
   * Get the state at a specific step.
   */
  getState(index: number): Record<string, any>;

  /**
   * Get memory savings statistics.
   */
  getStats(): {
    /** Number of unique messages in pool */
    uniqueMessages: number;
    /** Total messages if not compressed (sum of all step message counts) */
    totalUncompressedMessages: number;
    /** Memory savings ratio (1 - compressed/uncompressed) */
    savingsRatio: number;
    /** Number of steps */
    stepCount: number;
  };
}