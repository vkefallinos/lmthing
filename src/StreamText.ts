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
    private _currentActiveTools?: string[];
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
                // Capture activeTools at the time of this step
                const activeTools = this._currentActiveTools;
                try {
                  for await (const chunk of observerStream) {
                    outputChunks.push(chunk);
                  }
                  this._steps.push({input: params, output: outputChunks, activeTools});
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
          activeTools: step.activeTools,
        };
      });
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

        const prepareStep: PrepareStepFunction<any> | undefined = (this._prepareStepHooks.length > 0 || this._lastPrepareStep)
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

                // Store the activeTools for this step
                // If no activeTools specified, all tools are active by default
                this._currentActiveTools = (combinedResult.activeTools as string[] | undefined) ?? Object.keys(this._tools);

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

        // Set default activeTools if not already set by prepareStep
        if (!this._currentActiveTools) {
            this._currentActiveTools = Object.keys(this._tools);
        }

        return streamText(finalOptions);
    }
}
