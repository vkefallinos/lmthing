import { randomUUID } from 'crypto';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Langfuse } from 'langfuse';

export interface LangfuseSetupOptions {
  /**
   * Langfuse secret key. Defaults to LANGFUSE_SECRET_KEY env var.
   */
  secretKey?: string;
  /**
   * Langfuse public key. Defaults to LANGFUSE_PUBLIC_KEY env var.
   */
  publicKey?: string;
  /**
   * Langfuse base URL. Defaults to LANGFUSE_BASEURL env var or https://cloud.langfuse.com.
   */
  baseUrl?: string;
  /**
   * Whether to record inputs sent to the model. Defaults to true.
   */
  recordInputs?: boolean;
  /**
   * Whether to record outputs from the model. Defaults to true.
   */
  recordOutputs?: boolean;
}

export interface LangfuseTraceHandle {
  /**
   * The parent trace ID to pass to experimental_telemetry metadata.
   */
  traceId: string;
  /**
   * Flush all pending spans and shutdown the Langfuse client.
   * Call this after all executions in the group are complete.
   */
  flushAsync: () => Promise<void>;
}

export interface LangfuseTelemetry {
  isEnabled: true;
  functionId: string;
  metadata: {
    langfuseTraceId: string;
    langfuseUpdateParent: boolean;
    recordInputs?: boolean;
    recordOutputs?: boolean;
  };
}

let _tracerProvider: NodeTracerProvider | undefined;

/**
 * Initialises the Langfuse OpenTelemetry span processor and registers it with
 * a `NodeTracerProvider`. Call this **once** at application start-up (or at the
 * top of your script) before making any `runPrompt` calls.
 *
 * Credentials are resolved from `options` first, then from environment
 * variables (`LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASEURL`).
 *
 * @example
 * ```ts
 * import { setupLangfuse } from 'lmthing/observability';
 *
 * setupLangfuse();
 * ```
 */
export function setupLangfuse(options: LangfuseSetupOptions = {}): NodeTracerProvider {
  const spanProcessor = new LangfuseSpanProcessor({
    secretKey: options.secretKey,
    publicKey: options.publicKey,
    baseUrl: options.baseUrl,
  });

  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  });

  tracerProvider.register();
  _tracerProvider = tracerProvider;
  return tracerProvider;
}

/**
 * Creates a Langfuse parent trace that groups multiple `runPrompt` (or AI SDK)
 * executions under a single trace. This is the "group multiple executions"
 * pattern described in the Langfuse + AI SDK docs.
 *
 * Returns a `traceId` to include in each call's `experimental_telemetry`
 * metadata and a `flushAsync` function to call when all executions are done.
 *
 * @example
 * ```ts
 * import { setupLangfuse, createLangfuseTrace, buildTelemetry } from 'lmthing/observability';
 *
 * setupLangfuse();
 *
 * const { traceId, flushAsync } = createLangfuseTrace('my-workflow');
 *
 * for (let i = 0; i < 3; i++) {
 *   await runPrompt(async ({ $ }) => {
 *     $`Step ${i}`;
 *   }, {
 *     model: 'openai:gpt-4o',
 *     options: {
 *       experimental_telemetry: buildTelemetry(`step-${i}`, traceId),
 *     },
 *   });
 * }
 *
 * await flushAsync();
 * ```
 */
export function createLangfuseTrace(
  name: string,
  options: LangfuseSetupOptions = {},
): LangfuseTraceHandle {
  const client = new Langfuse({
    secretKey: options.secretKey,
    publicKey: options.publicKey,
    baseUrl: options.baseUrl,
  });

  const traceId = randomUUID();
  client.trace({ id: traceId, name });

  return {
    traceId,
    flushAsync: () => client.flushAsync(),
  };
}

/**
 * Builds the `experimental_telemetry` configuration object for a single
 * `runPrompt` call that belongs to a Langfuse parent trace.
 *
 * @param functionId - Name for this execution's root span (e.g. `"step-0"`).
 * @param traceId    - Parent trace ID returned by `createLangfuseTrace`.
 * @param opts       - Optional overrides for `recordInputs` / `recordOutputs`.
 *
 * @example
 * ```ts
 * const telemetry = buildTelemetry('my-step', traceId);
 * // { isEnabled: true, functionId: 'my-step', metadata: { langfuseTraceId: '...', langfuseUpdateParent: false } }
 * ```
 */
export function buildTelemetry(
  functionId: string,
  traceId: string,
  opts: Pick<LangfuseSetupOptions, 'recordInputs' | 'recordOutputs'> = {},
): LangfuseTelemetry {
  return {
    isEnabled: true,
    functionId,
    metadata: {
      langfuseTraceId: traceId,
      // Do not update the parent trace with individual execution results so
      // the original trace metadata is preserved.
      langfuseUpdateParent: false,
      ...(opts.recordInputs !== undefined ? { recordInputs: opts.recordInputs } : {}),
      ...(opts.recordOutputs !== undefined ? { recordOutputs: opts.recordOutputs } : {}),
    },
  };
}
