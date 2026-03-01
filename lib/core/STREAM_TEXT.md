# `streamText()`

Streams text generations from a language model.

You can use the streamText function for interactive use cases such as chat bots and other real-time applications. You can also generate UI components with tools.

```ts
import { streamText } from 'ai';

const { textStream } = streamText({
  model: 'anthropic/claude-sonnet-4.5',
  prompt: 'Invent a new holiday and describe its traditions.',
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}
```

To see `streamText` in action, check out [these examples](#examples).

## Import

```typescript
import { streamText } from "ai"
```

## API Signature

### Parameters

**model** (LanguageModel) - The language model to use. Example: openai('gpt-4.1')

**system** (string, optional) - The system prompt to use that specifies the behavior of the model.

**prompt** (string | Array<SystemModelMessage | UserModelMessage | AssistantModelMessage | ToolModelMessage>, optional) - The input prompt to generate the text from.

**messages** (Array<SystemModelMessage | UserModelMessage | AssistantModelMessage | ToolModelMessage>, optional) - A list of messages that represent a conversation. Automatically converts UI messages from the useChat hook.

- **SystemModelMessage**: Object with `role: 'system'` and `content: string`
- **UserModelMessage**: Object with `role: 'user'` and `content` that can be a string or an array of parts:
  - **TextPart**: `{ type: 'text', text: string }`
  - **ImagePart**: `{ type: 'image', image: string | Uint8Array | Buffer | ArrayBuffer | URL, mediaType?: string }`
  - **FilePart**: `{ type: 'file', data: string | Uint8Array | Buffer | ArrayBuffer | URL, mediaType: string }`
- **AssistantModelMessage**: Object with `role: 'assistant'` and `content` that can be a string or an array of parts:
  - **TextPart**: `{ type: 'text', text: string }`
  - **ReasoningPart**: `{ type: 'reasoning', text: string }`
  - **FilePart**: `{ type: 'file', data: string | Uint8Array | Buffer | ArrayBuffer | URL, mediaType: string, filename?: string }`
  - **ToolCallPart**: `{ type: 'tool-call', toolCallId: string, toolName: string, input: object }`
- **ToolModelMessage**: Object with `role: 'tool'` and `content` as an array of:
  - **ToolResultPart**: `{ type: 'tool-result', toolCallId: string, toolName: string, result: unknown, isError?: boolean }`

**tools** (ToolSet, optional) - Tools that are accessible to and can be called by the model. The model needs to support calling tools. Each tool has:
- **description** (string, optional) - Information about the purpose of the tool
- **inputSchema** (Zod Schema | JSON Schema) - The schema of the input that the tool expects
- **execute** (async function, optional) - `async (parameters: T, options: ToolExecutionOptions) => RESULT` where ToolExecutionOptions includes:
  - **toolCallId** (string) - The ID of the tool call
  - **messages** (ModelMessage[]) - Messages sent to the language model
  - **abortSignal** (AbortSignal) - Optional abort signal

**toolChoice** ("auto" | "none" | "required" | { "type": "tool", "toolName": string }, optional) - The tool choice setting. Default is "auto". "none" disables tool execution. "required" requires tools to be executed. Object form specifies a specific tool to execute.

**maxOutputTokens** (number, optional) - Maximum number of tokens to generate.

**temperature** (number, optional) - Temperature setting. Range depends on the provider and model. Recommended to set either temperature or topP, but not both.

**topP** (number, optional) - Nucleus sampling. Range depends on the provider and model. Recommended to set either temperature or topP, but not both.

**topK** (number, optional) - Only sample from the top K options for each subsequent token. For advanced use cases only.

**presencePenalty** (number, optional) - Presence penalty setting. Affects likelihood of repeating information already in the prompt. Range depends on provider and model.

**frequencyPenalty** (number, optional) - Frequency penalty setting. Affects likelihood of repeatedly using the same words or phrases. Range depends on provider and model.

**stopSequences** (string[], optional) - Sequences that will stop the generation of text.

**seed** (number, optional) - The seed (integer) to use for random sampling. If set and supported by the model, calls will generate deterministic results.

**maxRetries** (number, optional) - Maximum number of retries. Set to 0 to disable retries. Default: 2.

**abortSignal** (AbortSignal, optional) - An optional abort signal that can be used to cancel the call.

**headers** (Record<string, string>, optional) - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

**experimental_generateMessageId** (() => string, optional) - Function used to generate a unique ID for each message. Experimental feature.

**experimental_telemetry** (TelemetrySettings, optional) - Telemetry configuration. Experimental feature. Object with:
- **isEnabled** (boolean, optional) - Enable or disable telemetry. Disabled by default while experimental.
- **recordInputs** (boolean, optional) - Enable or disable input recording. Enabled by default.
- **recordOutputs** (boolean, optional) - Enable or disable output recording. Enabled by default.
- **functionId** (string, optional) - Identifier for this function. Used to group telemetry data by function.
- **metadata** (Record<string, string | number | boolean | Array<null | undefined | string | number | boolean>>, optional) - Additional information to include in the telemetry data.

**experimental_transform** (StreamTextTransform | Array<StreamTextTransform>, optional) - Optional stream transformations. Applied in order. Must maintain stream structure. Each transform has:
- **transform** - `(options: TransformOptions) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>` where TransformOptions includes:
  - **stopStream** (() => void) - Function that stops the stream
  - **tools** (TOOLS) - The tools that are available

**includeRawChunks** (boolean, optional) - Whether to include raw chunks from the provider in the stream. When enabled, you will receive raw chunks with type "raw". Defaults to false.

**providerOptions** (Record<string,Record<string,JSONValue>> | undefined, optional) - Provider-specific options. Outer key is provider name. Inner values are metadata.

**activeTools** (Array<TOOLNAME> | undefined, optional) - The tools that are currently active. All tools are active by default.

**stopWhen** (StopCondition<TOOLS> | Array<StopCondition<TOOLS>>, optional) - Condition for stopping generation when there are tool results in the last step. Default: stepCountIs(1).

**prepareStep** (function, optional) - `(options: PrepareStepOptions) => PrepareStepResult<TOOLS> | Promise<PrepareStepResult<TOOLS>>` where:
- **PrepareStepOptions** includes:
  - **steps** (Array<StepResult<TOOLS>>) - Steps executed so far
  - **stepNumber** (number) - Number of the step being executed
  - **model** (LanguageModel) - The model being used
  - **messages** (Array<ModelMessage>) - Messages that will be sent to the model
- **PrepareStepResult<TOOLS>** can modify:
  - **model** (LanguageModel, optional) - Change the model for this step
  - **toolChoice** (ToolChoice<TOOLS>, optional) - Change the tool choice strategy
  - **activeTools** (Array<keyof TOOLS>, optional) - Change which tools are active
  - **system** (string, optional) - Change the system prompt
  - **messages** (Array<ModelMessage>, optional) - Modify the input messages

**experimental_context** (unknown, optional) - Context that is passed into tool execution. Experimental (can break in patch releases).

**experimental_download** (function, optional) - `(requestedDownloads: Array<{ url: URL; isUrlSupportedByModel: boolean }>) => Promise<Array<null | { data: Uint8Array; mediaType?: string }>>` - Custom download function. Return null to pass URL directly to model, or return downloaded content.

**experimental_repairToolCall** (function, optional) - `(options: ToolCallRepairOptions) => Promise<LanguageModelV2ToolCall | null>` - Attempts to repair a tool call that failed to parse. ToolCallRepairOptions includes:
- **system** (string | undefined) - The system prompt
- **messages** (ModelMessage[]) - Messages in the current generation step
- **toolCall** (LanguageModelV2ToolCall) - The tool call that failed to parse
- **tools** (TOOLS) - Available tools
- **parameterSchema** (`(options: { toolName: string }) => JSONSchema7`) - Function that returns JSON Schema for a tool
- **error** (NoSuchToolError | InvalidToolInputError) - The error that occurred

**onChunk** ((event: OnChunkResult) => Promise<void> | void, optional) - Callback called for each chunk. Stream processing pauses until callback promise resolves. OnChunkResult includes:
- **chunk** (TextStreamPart) - The chunk of the stream

**onError** ((event: OnErrorResult) => Promise<void> | void, optional) - Callback called when an error occurs during streaming. OnErrorResult includes:
- **error** (unknown) - The error that occurred

**experimental_output** (Output, optional) - Experimental setting for generating structured outputs. Options:
- **Output.text()** - Forward text output
- **Output.object()** - Generate JSON object with `schema: Schema<OBJECT>`

**onStepFinish** ((result: onStepFinishResult) => Promise<void> | void, optional) - Callback called when a step is finished. onStepFinishResult includes:
- **stepType** ("initial" | "continue" | "tool-result") - The type of step
- **finishReason** ("stop" | "length" | "content-filter" | "tool-calls" | "error" | "other" | "unknown") - Reason the model finished
- **usage** (LanguageModelUsage) - Token usage with inputTokens, outputTokens, totalTokens, reasoningTokens (optional), cachedInputTokens (optional)
- **text** (string) - The full text that has been generated
- **reasoning** (string | undefined) - The reasoning text (only for some models)
- **sources** (Array<Source>) - Sources used as input
- **files** (Array<GeneratedFile>) - Files generated in this step
- **toolCalls** (ToolCall[]) - Tool calls that have been executed
- **toolResults** (ToolResult[]) - Tool results that have been generated
- **warnings** (Warning[] | undefined) - Warnings from the model provider
- **response** (Response, optional) - Response metadata with id, model, timestamp, headers
- **isContinued** (boolean) - True when there will be a continuation step
- **providerMetadata** (Record<string,Record<string,JSONValue>> | undefined, optional) - Optional metadata from the provider

**onFinish** ((result: OnFinishResult) => Promise<void> | void, optional) - Callback called when LLM response and all tool executions are finished. OnFinishResult includes:
- **finishReason** ("stop" | "length" | "content-filter" | "tool-calls" | "error" | "other" | "unknown")
- **usage** (LanguageModelUsage) - Token usage
- **providerMetadata** (Record<string,Record<string,JSONValue>> | undefined)
- **text** (string) - Full text generated
- **reasoning** (string | undefined) - Reasoning text
- **reasoningDetails** (Array<ReasoningDetail>) - Reasoning details
- **sources** (Array<Source>) - Sources used
- **files** (Array<GeneratedFile>) - Files generated
- **toolCalls** (ToolCall[]) - Tool calls executed
- **toolResults** (ToolResult[]) - Tool results generated
- **warnings** (Warning[] | undefined) - Warnings from provider
- **response** (Response, optional) - Response metadata
- **steps** (Array<StepResult>) - Response information for every step

**onAbort** ((event: OnAbortResult) => Promise<void> | void, optional) - Callback called when a stream is aborted via AbortSignal. OnAbortResult includes:
- **steps** (Array<StepResult>) - Details for all previously finished steps

### Returns

**content** (Promise<Array<ContentPart<TOOLS>>>) - The content generated in the last step. Automatically consumes the stream.

**finishReason** (Promise<'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown'>) - The reason why generation finished. Automatically consumes the stream.

**usage** (Promise<LanguageModelUsage>) - Token usage of the last step. Automatically consumes the stream. LanguageModelUsage includes inputTokens, outputTokens, totalTokens, reasoningTokens (optional), cachedInputTokens (optional).

**totalUsage** (Promise<LanguageModelUsage>) - Total token usage of the generated response. When there are multiple steps, the usage is the sum of all step usages. Automatically consumes the stream.

**providerMetadata** (Promise<ProviderMetadata | undefined>) - Additional provider-specific metadata from the last step.

**text** (Promise<string>) - The full text that has been generated. Automatically consumes the stream.

**reasoning** (Promise<Array<ReasoningOutput>>) - The full reasoning generated in the last step. Automatically consumes the stream. ReasoningOutput has type 'reasoning', text, and optional providerMetadata.

**reasoningText** (Promise<string | undefined>) - The reasoning text generated in the last step. Can be undefined if the model only generated text. Automatically consumes the stream.

**sources** (Promise<Array<Source>>) - Sources used as input to generate the response. For multi-step generation, sources are accumulated from all steps. Automatically consumes the stream.

**files** (Promise<Array<GeneratedFile>>) - Files generated in the final step. Automatically consumes the stream. GeneratedFile includes base64, uint8Array, and mediaType.

**toolCalls** (Promise<TypedToolCall<TOOLS>[]>) - Tool calls that have been executed. Automatically consumes the stream.

**toolResults** (Promise<TypedToolResult<TOOLS>[]>) - Tool results that have been generated. Resolved when all tool executions are finished.

**request** (Promise<LanguageModelRequestMetadata>) - Additional request information from the last step. Includes body (raw request HTTP body as string).

**response** (Promise<LanguageModelResponseMetadata & { messages: Array<ResponseMessage>; }>) - Additional response information from the last step. Includes id, model, timestamp, headers (optional), and messages.

**warnings** (Promise<CallWarning[] | undefined>) - Warnings from the model provider for the first step.

**steps** (Promise<Array<StepResult>>) - Response information for every step. Each StepResult includes stepType, text, reasoning, sources, files, toolCalls, toolResults, finishReason, usage, request (optional), response (optional), warnings, isContinued, and providerMetadata (optional).

**textStream** (AsyncIterableStream<string>) - A text stream that returns only the generated text deltas. Can be used as AsyncIterable or ReadableStream. Throws errors when they occur.

**fullStream** (AsyncIterable<TextStreamPart<TOOLS>> & ReadableStream<TextStreamPart<TOOLS>>) - A stream with all events including text deltas, tool calls, tool results, and errors. Can be used as AsyncIterable or ReadableStream. Only stream-stopping errors are thrown. TextStreamPart types include:
- Text: `{ type: 'text', text: string }`
- Reasoning: `{ type: 'reasoning', text: string, providerMetadata?: ProviderMetadata }`
- Source: `{ type: 'source', sourceType: 'url', id: string, url: string, title?: string, providerMetadata?: ProviderMetadata }`
- File: `{ type: 'file', file: GeneratedFile }`
- Tool call: `{ type: 'tool-call', toolCallId: string, toolName: string, input: object }`
- Tool call streaming start: `{ type: 'tool-call-streaming-start', toolCallId: string, toolName: string }`
- Tool call delta: `{ type: 'tool-call-delta', toolCallId: string, toolName: string, argsTextDelta: string }`
- Tool result: `{ type: 'tool-result', toolCallId: string, toolName: string, input: object, output: any }`
- Start step: `{ type: 'start-step', request: LanguageModelRequestMetadata, warnings: CallWarning[] }`
- Finish step: `{ type: 'finish-step', response: LanguageModelResponseMetadata, usage: LanguageModelUsage, finishReason: string, providerMetadata?: ProviderMetadata }`
- Start: `{ type: 'start' }`
- Finish: `{ type: 'finish', finishReason: string, totalUsage: LanguageModelUsage }`
- Reasoning part finish: `{ type: 'reasoning-part-finish' }`
- Error: `{ type: 'error', error: unknown }`
- Abort: `{ type: 'abort' }`

**experimental_partialOutputStream** (AsyncIterableStream<PARTIAL_OUTPUT>) - A stream of partial outputs using the experimental_output specification.

**consumeStream** ((options?: ConsumeStreamOptions) => Promise<void>) - Consumes the stream without processing parts. Useful to force stream to finish. ConsumeStreamOptions includes onError callback.

**toUIMessageStream** ((options?: UIMessageStreamOptions) => AsyncIterableStream<UIMessageChunk>) - Converts result to UI message stream. UIMessageStreamOptions includes:
- **originalMessages** (UIMessage[], optional) - The original messages
- **onFinish** (function, optional) - Callback when stream finishes
- **messageMetadata** (function, optional) - Extracts message metadata sent to client
- **sendReasoning** (boolean, optional) - Send reasoning parts to client. Default: false
- **sendSources** (boolean, optional) - Send source parts to client. Default: false
- **sendFinish** (boolean, optional) - Send finish event to client. Default: true
- **sendStart** (boolean, optional) - Send message start event to client. Default: true
- **onError** (function, optional) - Process an error. Default: `() => "An error occurred."`
- **consumeSseStream** (function, optional) - Function to consume SSE stream. Required for proper abort handling

**pipeUIMessageStreamToResponse** ((response: ServerResponse, options?: ResponseInit & UIMessageStreamOptions) => void) - Writes UI message stream output to Node.js response-like object. ResponseInit includes status, statusText, and headers.

**pipeTextStreamToResponse** ((response: ServerResponse, init?: ResponseInit) => void) - Writes text delta output to Node.js response-like object. Sets Content-Type header to text/plain; charset=utf-8.

**toUIMessageStreamResponse** ((options?: ResponseInit & UIMessageStreamOptions) => Response) - Converts result to streamed response object with UI message stream.

**toTextStreamResponse** ((init?: ResponseInit) => Response) - Creates simple text stream response. Each text delta is encoded as UTF-8 and sent as separate chunk. Non-text-delta events are ignored.
