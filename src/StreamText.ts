import { LanguageModelV2, LanguageModelV2Middleware } from '@ai-sdk/provider';
import { stepCountIs, streamText, wrapLanguageModel } from 'ai';
import type {
    LanguageModel,
    ToolSet,
    StreamTextResult,
    StepResult,
    PrepareStepFunction,
    PrepareStepResult,
    ModelMessage
} from 'ai';
import { resolveModel, type ModelInput } from './providers/resolver';
import type { CompressedSteps, CompressedStep, ProcessedMessage, StepOutput } from './types';

// Helper type for the options object
export type StreamTextOptions = Parameters<typeof streamText>[0];

// Type for onFinish callback
export type OnFinishCallback<TOOLS extends ToolSet> = (event: StepResult<TOOLS> & {
    readonly steps: StepResult<TOOLS>[];
    readonly totalUsage: any;
}) => Promise<void> | void;

// Type for onStepFinish callback
export type OnStepFinishCallback<TOOLS extends ToolSet> = (stepResult: StepResult<TOOLS>) => Promise<void> | void;

// Type for prepareStep options
export type PrepareStepOptions<TOOLS extends ToolSet> = {
    steps: Array<StepResult<TOOLS>>;
    stepNumber: number;
    model: LanguageModel;
    messages: Array<ModelMessage>;
};

export class StreamTextBuilder {
    private _model?: LanguageModel;
    private _systemParts: Array<string> = [];
    private _messages: ModelMessage[] = [];
    protected _tools: ToolSet = {};

    // Store simple options (temperature, maxTokens, etc.)
    private _options: Partial<Omit<StreamTextOptions, 'model' | 'system' | 'messages' | 'tools' | 'onFinish' | 'onStepFinish' | 'prepareStep'>> = {};

    // Arrays to hold multiple hooks
    private _onFinishHooks: Array<OnFinishCallback<any>> = [];
    private _onStepFinishHooks: Array<OnStepFinishCallback<any>> = [];
    // prepareStep hooks return modifications to the step
    private _prepareStepHooks: Array<(options: PrepareStepOptions<any>) => PrepareStepResult<any> | Promise<PrepareStepResult<any>>> = [];
    private _lastPrepareStep?: (options: PrepareStepOptions<any>) => PrepareStepResult<any> | Promise<PrepareStepResult<any>>;
    constructor(model?: ModelInput) {
        if (model) {
          this.withModel(model);
        }
    }
    private _steps: Array<any> = [];
    private _agentStepsMap: Map<string, any[]> = new Map();
    private _getMiddleware(): LanguageModelV2Middleware {
        return {
            middlewareVersion: 'v2',
            transformParams: async ({ params }) => {
              const lastMessage = params.prompt[params.prompt.length -1];
                if(lastMessage.role === 'tool'){
                  // Modify behavior based on tool message
                  for(const part of lastMessage.content){
                    if(part.type === 'tool-result'){
                      if(part.output && part.output.type === 'json'){
                        const outputData = part.output.value as any;
                        if(Object.keys(outputData).length === 2){
                          if(outputData.response && outputData.steps){
                            if(typeof outputData.response === 'string'){
                              // Store agent steps before discarding them
                              this._agentStepsMap.set(part.toolCallId, outputData.steps);
                              part.output.value = outputData.response;
                              //@ts-ignore
                              part.output.type = 'text';

                            }
                          }
                        }
                      }

                    }
                  }
                }
              return params;
            },
            wrapStream: async ({ doStream, params }) => {
              const result = await doStream();
              
              // Tee the stream so we can observe it without consuming it
              const [observerStream, consumerStream] = result.stream.tee();
              
              // Collect chunks in the background without blocking
              (async () => {
                const outputChunks: any[] = [];
                try {
                  for await (const chunk of observerStream) {
                    outputChunks.push(chunk);
                  }
                  this._steps.push({input: params, output: outputChunks});
                } catch (error) {
                  // Silently ignore errors in the observer stream
                  console.error('Error collecting chunks in middleware:', error);
                }
              })();
              
              // Return the consumer stream for the actual streamText consumer
              return {
                ...result,
                stream: consumerStream,
              };
            }
        };
    }
    public get fullSteps() {
        return this._steps;
    }
    public get steps() {
      return this._steps.map((step: any, index: number) => {
        // Process output chunks to extract content
        const content: any[] = [];
        let finishReason: string | undefined;
        
        // Combine text deltas and collect tool calls
        const textParts: Map<string, string> = new Map();
        
        for (const chunk of step.output) {
          if (chunk.type === 'text-delta') {
            const id = chunk.id || '0';
            textParts.set(id, (textParts.get(id) || '') + chunk.delta);
          } else if (chunk.type === 'tool-call') {
            content.push({
              type: 'tool-call',
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              input: JSON.parse(chunk.input),
            });
          } else if (chunk.type === 'finish') {
            finishReason = chunk.finishReason;
          }
        }
        
        // Add accumulated text parts to content
        for (const [id, text] of textParts.entries()) {
          content.push({
            type: 'text',
            text,
          });
        }
        
        return {
          input: {
            prompt: step.input.prompt.map((msg: any) => ({
              role: msg.role,
              content: typeof msg.content === 'string' ?
                msg.content :
                msg.content.map((part: any) => {
                  if (part.type === 'text') {
                    return { type: 'text', text: part.text };
                  } else if (part.type === 'tool-call') {
                    return {
                      type: 'tool-call',
                      input: part.input,
                      toolCallId: part.toolCallId,
                      toolName: part.toolName,
                    };
                  } else {
                    // tool-result
                    const agentSteps = this._agentStepsMap.get(part.toolCallId);
                    return {
                      type: part.type,
                      toolName: part.toolName,
                      toolCallId: part.toolCallId,
                      output: part.output,
                      ...(agentSteps ? { agentSteps } : {}),
                    };
                  }
                }),
            })),
          },
          output: {
            content,
            finishReason,
          },
        };
      });
    }

    /**
     * Returns a compressed representation of the steps.
     *
     * This format stores messages in a deduplicated pool, with each step
     * referencing messages by index. Memory usage is reduced from O(n²)
     * to O(n) for n steps.
     *
     * Use this for:
     * - Serializing step history efficiently
     * - Debugging/inspection with lower memory footprint
     * - Transmitting step data over network
     *
     * @example
     * const compressed = prompt.compressedSteps;
     * console.log(compressed.getStats());
     * // { uniqueMessages: 5, totalUncompressedMessages: 11, savingsRatio: 0.54 }
     *
     * // Reconstruct a specific step
     * const step2 = compressed.getStep(2);
     *
     * // Get only new messages from step 2
     * const delta = compressed.getDeltaMessages(2);
     */
    public get compressedSteps(): CompressedSteps {
      return this._buildCompressedSteps(() => ({}));
    }

    /**
     * Internal method to build compressed steps.
     * Accepts a state getter function for StatefulPrompt override.
     */
    protected _buildCompressedSteps(
      getStateAtStep: (stepIndex: number) => Record<string, any>
    ): CompressedSteps {
      const processedSteps = this.steps;
      const messagePool: ProcessedMessage[] = [];
      const messageHashToIndex = new Map<string, number>();
      const compressedStepData: CompressedStep[] = [];

      // Helper to get a stable hash for a message
      const hashMessage = (msg: ProcessedMessage): string => {
        return JSON.stringify(msg);
      };

      // Helper to add a message to the pool (deduplicates by content)
      const addToPool = (msg: ProcessedMessage): number => {
        const hash = hashMessage(msg);
        if (messageHashToIndex.has(hash)) {
          return messageHashToIndex.get(hash)!;
        }
        const index = messagePool.length;
        messagePool.push(msg);
        messageHashToIndex.set(hash, index);
        return index;
      };

      // Track previous step's message refs for delta calculation
      let prevMessageRefs: number[] = [];

      for (let stepIndex = 0; stepIndex < processedSteps.length; stepIndex++) {
        const step = processedSteps[stepIndex];
        const messages: ProcessedMessage[] = step.input.prompt;
        const messageRefs: number[] = [];

        // Add each message to the pool and collect refs
        for (const msg of messages) {
          const ref = addToPool(msg as ProcessedMessage);
          messageRefs.push(ref);
        }

        // Calculate deltaStart
        // For step 0, all messages are new (deltaStart = 0)
        // For subsequent steps, find where new messages start
        let deltaStart = 0;
        if (stepIndex > 0) {
          // Find the first ref that differs from previous step
          // Messages might change at any position (e.g., system prompt changes)
          // so we need to find where the arrays diverge
          deltaStart = 0;
          for (let i = 0; i < Math.min(prevMessageRefs.length, messageRefs.length); i++) {
            if (prevMessageRefs[i] === messageRefs[i]) {
              deltaStart = i + 1;
            } else {
              break;
            }
          }
          // If all previous refs match, new messages start after them
          if (deltaStart === prevMessageRefs.length && messageRefs.length > prevMessageRefs.length) {
            deltaStart = prevMessageRefs.length;
          }
        }

        // Get state at this step
        const state = getStateAtStep(stepIndex);

        compressedStepData.push({
          stepIndex,
          messageRefs,
          deltaStart,
          state,
          output: step.output as StepOutput,
        });

        prevMessageRefs = messageRefs;
      }

      // Create the CompressedSteps object with helper methods
      const self = this;
      return {
        messagePool,
        steps: compressedStepData,

        getStep(index: number) {
          if (index < 0 || index >= compressedStepData.length) {
            throw new Error(`Step index ${index} out of range [0, ${compressedStepData.length - 1}]`);
          }
          const step = compressedStepData[index];
          return {
            input: {
              prompt: step.messageRefs.map(ref => messagePool[ref]),
            },
            output: step.output,
            state: step.state,
          };
        },

        getDeltaMessages(index: number) {
          if (index < 0 || index >= compressedStepData.length) {
            throw new Error(`Step index ${index} out of range [0, ${compressedStepData.length - 1}]`);
          }
          const step = compressedStepData[index];
          const deltaRefs = step.messageRefs.slice(step.deltaStart);
          return deltaRefs.map(ref => messagePool[ref]);
        },

        getState(index: number) {
          if (index < 0 || index >= compressedStepData.length) {
            throw new Error(`Step index ${index} out of range [0, ${compressedStepData.length - 1}]`);
          }
          return compressedStepData[index].state;
        },

        getStats() {
          const uniqueMessages = messagePool.length;
          const totalUncompressedMessages = compressedStepData.reduce(
            (sum, step) => sum + step.messageRefs.length,
            0
          );
          const savingsRatio = totalUncompressedMessages > 0
            ? 1 - (uniqueMessages / totalUncompressedMessages)
            : 0;

          return {
            uniqueMessages,
            totalUncompressedMessages,
            savingsRatio,
            stepCount: compressedStepData.length,
          };
        },
      };
    }
    /**
     * Sets the language model.
     * Accepts either a LanguageModelV2 instance or a string in "provider:modelId" format.
     */
    public withModel(model: ModelInput): this {
        const resolvedModel = resolveModel(model);
        this._model = wrapLanguageModel({middleware: this._getMiddleware(), model: resolvedModel});
        return this;
    }

    /**
     * Appends a part to the system prompt.
     * Parts will be joined by newlines when executed.
     */
    public addSystem(part: string): this {
        this._systemParts.push(part);
        return this;
    }

    /**
     * Appends a single message to the conversation history.
     */
    public addMessage(message: ModelMessage): this {
        this._messages.push(message);
        return this;
    }

    /**
     * Appends multiple messages to the conversation history.
     */
    public addMessages(messages: ModelMessage[]): this {
        this._messages.push(...messages);
        return this;
    }

    /**
     * Adds a single tool to the toolset.
     */
    public addTool(name: string, tool: any): this {
        this._tools[name] = tool;
        return this;
    }

    /**
     * Merges a set of tools into the existing toolset.
     */
    public addTools(tools: ToolSet): this {
        this._tools = { ...this._tools, ...tools };
        return this;
    }

    /**
     * Adds an onFinish hook. Multiple hooks can be registered and will run in parallel.
     */
    public addOnFinish(callback: OnFinishCallback<any>): this {
        this._onFinishHooks.push(callback);
        return this;
    }

    /**
     * Adds an onStepFinish hook. Multiple hooks can be registered and will run in parallel.
     */
    public addOnStepFinish(callback: OnStepFinishCallback<any>): this {
        this._onStepFinishHooks.push(callback);
        return this;
    }

    /**
     * Adds a prepareStep hook. Multiple hooks can be registered.
     * They will run sequentially, and their results will be merged.
     * Later hooks override properties from earlier hooks.
     */
    public addPrepareStep(callback: (options: PrepareStepOptions<any>) => PrepareStepResult<any> | Promise<PrepareStepResult<any>>): this {
        this._prepareStepHooks.push(callback);
        return this;
    }
    public withOptions(options: Partial<Omit<StreamTextOptions, 'model' | 'system' | 'messages' | 'tools' | 'onFinish' | 'onStepFinish' | 'prepareStep'>>): this {
        this._options = {
            ...this._options,
            ...options
        };
        return this;
    }
    /**
     * Sets simple configuration options (temperature, seed, etc).
     */
    public withOption<K extends keyof typeof this._options>(
        key: K, 
        value: (typeof this._options)[K]
    ): this {
        this._options[key] = value;
        return this;
    }
    public getOptions(): Partial<Omit<StreamTextOptions, 'model' | 'system' | 'messages' | 'tools' | 'onFinish' | 'onStepFinish' | 'prepareStep'>> {
        return this._options;
    }
    public getModel() {
        return this._model;
    }
    setLastPrepareStep(callback: any) {
        this._lastPrepareStep = callback;
    }
    /**
     * Executes the streamText function.
     */
    public execute(): StreamTextResult<any, any> {
        if (!this._model) {
            throw new Error('Model is required to execute streamText.');
        }

        // 1. Compose System Prompt
        const system = this._systemParts.length > 0
            ? this._systemParts.join('\n')
            : undefined;

        // 2. Compose Hooks
        const onFinish = this._onFinishHooks.length > 0
            ? async (result: Parameters<OnFinishCallback<any>>[0]) => {
                await Promise.all(this._onFinishHooks.map(hook => hook(result)));
            }
            : undefined;

        const onStepFinish = this._onStepFinishHooks.length > 0
            ? async (result: Parameters<OnStepFinishCallback<any>>[0]) => {
                await Promise.all(this._onStepFinishHooks.map(hook => hook(result)));
            }
            : undefined;

        const prepareStep: PrepareStepFunction<any> | undefined = this._prepareStepHooks.length > 0
            ? (async (options: PrepareStepOptions<any>): Promise<PrepareStepResult<any>> => {
                let combinedResult: PrepareStepResult<any> = {};
                
                // console.log(options.messages[options.messages.length -1].content[0].output);
                const hooks = this._prepareStepHooks.concat(this._lastPrepareStep ? [this._lastPrepareStep] : []);
                for (const hook of hooks) {
                    const res = await hook(options);
                    if (res) {
                        combinedResult = { 
                            ...combinedResult, 
                            ...res,
                            // Ensure activeTools is properly typed as string array
                            activeTools: res.activeTools ? res.activeTools.map(String) : combinedResult.activeTools
                        };
                    }
                }
                return combinedResult;
            }) as PrepareStepFunction<any>
            : undefined;

        // 3. Construct Options
        const { prompt, ...restOptions } = this._options as any;
        const finalOptions: StreamTextOptions = {
            ...restOptions,
            model: this._model,
            messages: this._messages,
            tools: Object.keys(this._tools).length > 0 ? this._tools : undefined,
            system,
            stopWhen: stepCountIs(1000), // Default high limit to prevent infinite loops
            onFinish,
            onStepFinish,
            prepareStep,
        };

        return streamText(finalOptions);
    }
}
