import { VM } from 'vm2';
import type { MethodRegistry } from './MethodRegistry';
import { validateTypeScript } from './typeChecker';

const RUN_CODE_OPEN = '<run_code>';
const RUN_CODE_CLOSE = '</run_code>';

/**
 * Serializes a return value to a string for embedding in <code_response>.
 */
function serializeResult(value: any): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Builds a sandbox object with all registered methods exposed as async globals.
 * Each method validates its input (Zod), calls the handler, and validates output.
 */
function buildSandbox(registry: MethodRegistry): Record<string, any> {
  const sandbox: Record<string, any> = {
    console: {
      log: (...args: any[]) => console.log('[ZeroStep]', ...args),
      error: (...args: any[]) => console.error('[ZeroStep]', ...args),
      warn: (...args: any[]) => console.warn('[ZeroStep]', ...args),
    },
  };

  for (const [name, def] of registry.getAll()) {
    sandbox[name] = async (args: any) => {
      const validatedInput = def.parameterSchema.parse(args);
      const output = await Promise.resolve(def.handler(validatedInput));
      return def.responseSchema.parse(output);
    };
  }

  return sandbox;
}

/**
 * Executes a code block in a secure sandbox, after first validating it with
 * the TypeScript type checker.
 * Returns:
 *  - { type: 'return', value } when the code returns a non-undefined value
 *  - { type: 'no-return' } when the code returns undefined (no explicit return)
 *  - { type: 'error', message } when type checking or execution throws
 */
async function tryExecuteCode(
  code: string,
  registry: MethodRegistry
): Promise<{ type: 'return'; value: any } | { type: 'no-return' } | { type: 'error'; message: string }> {
  // --- TypeScript validation (line-by-line gate) ---
  const typeCheck = validateTypeScript(code, registry);
  if (!typeCheck.valid) {
    const errorSummary = typeCheck.errors
      .map(e => `Line ${e.line}: ${e.message}`)
      .join('\n');
    return { type: 'error', message: `TypeScript error:\n${errorSummary}` };
  }

  const sandbox = buildSandbox(registry);
  const vm = new VM({
    timeout: 5000,
    sandbox,
    eval: false,
    wasm: false,
  });

  const wrappedCode = `(async () => {\n${code}\n})()`;

  try {
    const result = await vm.run(wrappedCode);
    if (result !== undefined) {
      return { type: 'return', value: result };
    }
    return { type: 'no-return' };
  } catch (error: any) {
    return { type: 'error', message: error.message || String(error) };
  }
}

/**
 * Drains the remaining chunks from the reader, passing through non-text-delta
 * chunks (e.g. 'finish') to the controller so the AI SDK can finalize properly.
 */
async function drainPassingStructural(
  reader: ReadableStreamDefaultReader<any>,
  controller: ReadableStreamDefaultController<any>
): Promise<void> {
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      if (chunk.type !== 'text-delta') {
        controller.enqueue(chunk);
      }
    }
  } catch {
    // Ignore errors during drain
  }
}

/**
 * Creates a stream transformer that intercepts the raw LLM text stream
 * and processes <run_code> blocks using the registered method registry.
 *
 * Behavior:
 * - Text outside <run_code> is passed through unchanged.
 * - When <run_code> is detected, code accumulation begins.
 * - After each complete line (ending with \n), the accumulated code is executed:
 *   - If it returns a value -> emit <code_response>value</code_response>, halt stream.
 *   - If it throws -> emit <code_error>message</code_error>, halt stream.
 *   - If it returns undefined -> continue accumulating.
 * - When </run_code> is detected, the full code block is executed:
 *   - If it returns a value -> emit <code_response>value</code_response>, halt stream.
 *   - If it throws -> emit <code_error>message</code_error>, halt stream.
 *   - If no return -> emit nothing, resume normal streaming.
 */
export function createZeroStepTransformer(registry: MethodRegistry) {
  return function transformStream(inputStream: ReadableStream<any>): ReadableStream<any> {
    return new ReadableStream({
      async start(controller) {
        const reader = inputStream.getReader();

        let textBuffer = '';     // pending text not yet emitted (PASSTHROUGH mode)
        let codeBuffer = '';     // accumulated code inside <run_code>
        let inCodeBlock = false;
        let lastCheckedPos = 0;  // position in codeBuffer up to which complete lines were checked
        // Track the current text-start id so emitted text-delta chunks have a matching id
        let currentTextId: string = '0';

        /**
         * Emits a text-delta chunk with the current text id so the AI SDK
         * can associate it with the active text-start element.
         */
        function emitText(delta: string): void {
          controller.enqueue({ type: 'text-delta', id: currentTextId, delta });
        }

        /**
         * Executes accumulated code and handles result.
         * Returns true if the stream should be halted.
         */
        async function executeAndHandle(code: string): Promise<boolean> {
          const result = await tryExecuteCode(code, registry);
          if (result.type === 'return') {
            emitText(`<code_response>${serializeResult(result.value)}</code_response>`);
            return true;
          }
          if (result.type === 'error') {
            emitText(`<code_error>${result.message}</code_error>`);
            return true;
          }
          return false; // no-return: continue
        }

        try {
          mainLoop: while (true) {
            const { done, value: chunk } = await reader.read();

            if (done) {
              // Stream ended: handle remaining buffers
              if (inCodeBlock && codeBuffer.trim()) {
                // Execute whatever code we have accumulated
                await executeAndHandle(codeBuffer);
              } else if (!inCodeBlock && textBuffer) {
                emitText(textBuffer);
                textBuffer = '';
              }
              controller.close();
              break;
            }

            // Track text-start id for later use when emitting synthetic text-delta chunks
            if (chunk.type === 'text-start' && chunk.id !== undefined) {
              currentTextId = String(chunk.id);
            }

            // Non-text chunks: flush pending text first, then pass through (only in PASSTHROUGH mode)
            if (chunk.type !== 'text-delta') {
              if (!inCodeBlock) {
                if (textBuffer) {
                  emitText(textBuffer);
                  textBuffer = '';
                }
                controller.enqueue(chunk);
              }
              // While inCodeBlock: structural chunks (finish, etc.) are held until code block ends.
              // In practice the finish chunk arrives after all text-deltas, so this is fine.
              continue;
            }

            // Append incoming text delta to the appropriate buffer
            if (inCodeBlock) {
              codeBuffer += chunk.delta;
            } else {
              textBuffer += chunk.delta;
            }

            // Process buffer in a loop to handle multiple state transitions per chunk
            innerLoop: while (true) {
              if (!inCodeBlock) {
                const openIdx = textBuffer.indexOf(RUN_CODE_OPEN);
                if (openIdx === -1) {
                  // No opening tag yet; emit text up to safe length (avoid splitting partial tags)
                  const safeLen = Math.max(0, textBuffer.length - (RUN_CODE_OPEN.length - 1));
                  if (safeLen > 0) {
                    emitText(textBuffer.slice(0, safeLen));
                    textBuffer = textBuffer.slice(safeLen);
                  }
                  break innerLoop;
                }

                // Emit text before the opening tag
                if (openIdx > 0) {
                  emitText(textBuffer.slice(0, openIdx));
                }
                // Move text after the opening tag into codeBuffer and enter CODE_BLOCK mode
                codeBuffer = textBuffer.slice(openIdx + RUN_CODE_OPEN.length);
                textBuffer = '';
                inCodeBlock = true;
                lastCheckedPos = 0;
                // Fall through to the else branch on next iteration

              } else {
                // Inside a code block: check for the closing tag first
                const closeIdx = codeBuffer.indexOf(RUN_CODE_CLOSE);
                if (closeIdx !== -1) {
                  const code = codeBuffer.slice(0, closeIdx);
                  const remaining = codeBuffer.slice(closeIdx + RUN_CODE_CLOSE.length);
                  inCodeBlock = false;
                  codeBuffer = '';
                  lastCheckedPos = 0;

                  const shouldHalt = await executeAndHandle(code);
                  if (shouldHalt) {
                    await drainPassingStructural(reader, controller);
                    controller.close();
                    break mainLoop;
                  }

                  // Resume passthrough with text that followed </run_code>
                  textBuffer = remaining;
                  continue innerLoop; // re-process remaining text (may contain another <run_code>)
                }

                // No closing tag yet; check for complete lines (line-by-line early execution)
                const newlineIdx = codeBuffer.lastIndexOf('\n');
                if (newlineIdx >= lastCheckedPos) {
                  const codeToCheck = codeBuffer.slice(0, newlineIdx + 1);
                  lastCheckedPos = newlineIdx + 1;

                  const shouldHalt = await executeAndHandle(codeToCheck);
                  if (shouldHalt) {
                    await drainPassingStructural(reader, controller);
                    controller.close();
                    break mainLoop;
                  }
                }

                break innerLoop; // wait for more chunks
              }
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          reader.releaseLock();
        }
      },
    });
  };
}
