import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { MethodRegistry } from './MethodRegistry';
import { createZeroStepTransformer } from './streamProcessor';
import { runPrompt } from '../../runPrompt';
import { createMockModel } from '../../test/createMockModel';
import { zeroStepPlugin } from './ZeroStepPlugin';

// ---------------------------------------------------------------------------
// Helpers for direct stream transformer tests
// ---------------------------------------------------------------------------

function createChunkStream(chunks: any[]): ReadableStream<any> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collectChunks(stream: ReadableStream<any>): Promise<any[]> {
  const reader = stream.getReader();
  const result: any[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result.push(value);
  }
  return result;
}

function textOf(chunks: any[]): string {
  return chunks
    .filter(c => c.type === 'text-delta')
    .map(c => c.delta)
    .join('');
}

// ---------------------------------------------------------------------------
// MethodRegistry tests
// ---------------------------------------------------------------------------

describe('MethodRegistry', () => {
  it('registers and retrieves methods', () => {
    const registry = new MethodRegistry();
    const def = {
      name: 'hello',
      description: 'Say hello',
      parameterSchema: z.object({ name: z.string() }),
      handler: async ({ name }: { name: string }) => `Hello, ${name}!`,
      responseSchema: z.string(),
    };
    registry.register(def);
    expect(registry.has('hello')).toBe(true);
    expect(registry.get('hello')).toBe(def);
    expect(registry.getAllNames()).toEqual(['hello']);
  });

  it('getAll returns all registered methods', () => {
    const registry = new MethodRegistry();
    registry.register({
      name: 'a',
      description: 'A',
      parameterSchema: z.object({}),
      handler: async () => 'a',
      responseSchema: z.string(),
    });
    registry.register({
      name: 'b',
      description: 'B',
      parameterSchema: z.object({}),
      handler: async () => 'b',
      responseSchema: z.string(),
    });
    expect(registry.getAll().size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// createZeroStepTransformer – unit tests (direct stream manipulation)
// ---------------------------------------------------------------------------

describe('createZeroStepTransformer', () => {
  function makeRegistry(methods: Record<string, (args: any) => any> = {}): MethodRegistry {
    const registry = new MethodRegistry();
    for (const [name, handler] of Object.entries(methods)) {
      registry.register({
        name,
        description: name,
        parameterSchema: z.any(),
        handler,
        responseSchema: z.any(),
      });
    }
    return registry;
  }

  it('passes through text with no <run_code> unchanged', async () => {
    const registry = makeRegistry();
    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: 'Hello, ' },
      { type: 'text-delta', delta: 'world!' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    expect(textOf(output)).toBe('Hello, world!');
    expect(output.some(c => c.type === 'finish')).toBe(true);
  });

  it('passes through non-text chunks', async () => {
    const registry = makeRegistry();
    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'response-metadata', id: 'r1' },
      { type: 'text-start', id: '0' },
      { type: 'text-delta', delta: 'Hi' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    expect(output.some(c => c.type === 'response-metadata')).toBe(true);
    expect(output.some(c => c.type === 'finish')).toBe(true);
  });

  // ---- Scenario A: early return ----

  it('Scenario A: replaces <run_code> with <code_response> on return', async () => {
    const registry = makeRegistry({
      fetchUser: async ({ id }: { id: string }) => ({ name: 'Jane Doe', role: 'Admin' }),
    });

    const transformer = createZeroStepTransformer(registry);

    // Simulate streaming: code block spread across multiple chunks
    const chunks = [
      { type: 'text-delta', delta: 'Let me look up: ' },
      { type: 'text-delta', delta: '<run_code>\n' },
      { type: 'text-delta', delta: 'const user = await fetchUser({ id: "123" });\n' },
      { type: 'text-delta', delta: 'return user.name;\n' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);

    expect(text).toBe('Let me look up: <code_response>Jane Doe</code_response>');
    // finish chunk should still be passed through (drained after halt)
    expect(output.some(c => c.type === 'finish')).toBe(true);
  });

  it('Scenario A: works when entire code block arrives in one chunk', async () => {
    const registry = makeRegistry({
      add: async ({ a, b }: { a: number; b: number }) => a + b,
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: 'Result: <run_code>\nreturn await add({ a: 2, b: 3 });\n</run_code>' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);
    expect(text).toContain('<code_response>5</code_response>');
  });

  // ---- Scenario B: no return ----

  it('Scenario B: executes silently when no return, stream continues', async () => {
    const sideEffect = vi.fn();
    const registry = makeRegistry({
      doSomething: async () => { sideEffect(); return null; },
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: 'Before.' },
      { type: 'text-delta', delta: '<run_code>\nawait doSomething();\n</run_code>' },
      { type: 'text-delta', delta: ' After.' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);

    // Text before and after should pass through; no code_response/code_error
    expect(text).toContain('Before.');
    expect(text).toContain(' After.');
    expect(text).not.toContain('<code_response>');
    expect(text).not.toContain('<code_error>');
  });

  it('Scenario B: returns null value is treated as return (non-undefined)', async () => {
    const registry = makeRegistry({
      getNull: async () => null,
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: '<run_code>\nreturn await getNull();\n</run_code>' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);
    expect(text).toContain('<code_response>null</code_response>');
  });

  // ---- Scenario C: execution error ----

  it('Scenario C: emits <code_error> and halts when method throws (Zod validation)', async () => {
    const registry = new MethodRegistry();
    registry.register({
      name: 'fetchUser',
      description: 'Fetch user',
      parameterSchema: z.object({ id: z.string() }), // id must be string
      handler: async ({ id }: { id: string }) => ({ name: 'Jane' }),
      responseSchema: z.object({ name: z.string() }),
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: '<run_code>\n' },
      // null is not a valid string, triggering a ZodError
      { type: 'text-delta', delta: 'const user = await fetchUser({ id: null });\n' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);

    expect(text).toMatch(/<code_error>[\s\S]+<\/code_error>/);
    // Stream halts: finish chunk should still be passed through
    expect(output.some(c => c.type === 'finish')).toBe(true);
  });

  it('Scenario C: emits <code_error> when code throws a regular error', async () => {
    const registry = makeRegistry({
      badFn: async () => { throw new Error('Something went wrong'); },
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: '<run_code>\nawait badFn();\n</run_code>' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);

    expect(text).toContain('<code_error>Something went wrong</code_error>');
  });

  // ---- Multiple code blocks ----

  it('handles multiple sequential <run_code> blocks in one stream', async () => {
    const registry = makeRegistry({
      double: async ({ n }: { n: number }) => n * 2,
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: 'A: <run_code>\nawait double({ n: 1 });\n</run_code> B: <run_code>\nawait double({ n: 2 });\n</run_code> done.' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);

    // Both blocks executed silently (no return), text before/between/after preserved
    expect(text).toContain('A: ');
    expect(text).toContain(' B: ');
    expect(text).toContain(' done.');
    expect(text).not.toContain('<code_response>');
  });

  // ---- Object return value ----

  it('serializes object return values as JSON', async () => {
    const registry = makeRegistry({
      getUser: async () => ({ name: 'Alice', age: 30 }),
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: '<run_code>\nreturn await getUser();\n</run_code>' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);
    expect(text).toContain('<code_response>{"name":"Alice","age":30}</code_response>');
  });
});

// ---------------------------------------------------------------------------
// defMethod integration tests via runPrompt
// ---------------------------------------------------------------------------

describe('defMethod (integration via runPrompt)', () => {
  it('registers method and adds system prompt', async () => {
    const mockModel = createMockModel([{ type: 'text', text: 'Hello!' }]);

    const { result, prompt } = await runPrompt(async ({ defMethod, $ }) => {
      defMethod(
        'fetchUser',
        'Fetch user data by ID',
        z.object({ id: z.string() }),
        async ({ id }) => ({ name: 'Jane', role: 'Admin' }),
        z.object({ name: z.string(), role: z.string() })
      );
      $`Look up user 123`;
    }, {
      model: mockModel as any,
    });

    await result.text;

    // System prompt should include method description
    const systems = (prompt as any).systems;
    expect(systems['zero_step_methods']).toBeDefined();
    expect(systems['zero_step_methods']).toContain('fetchUser');
    expect(systems['zero_step_methods']).toContain('Fetch user data by ID');
  });

  it('Scenario A via runPrompt: transforms <run_code> with return into <code_response>', async () => {
    const mockModel = createMockModel([
      {
        type: 'text',
        text: 'Here is the result:\n<run_code>\nconst user = await fetchUser({ id: "42" });\nreturn user.name;\n</run_code>',
      },
    ]);

    const { result } = await runPrompt(async ({ defMethod, $ }) => {
      defMethod(
        'fetchUser',
        'Fetch user by ID',
        z.object({ id: z.string() }),
        async ({ id }) => ({ name: 'Jane Doe', role: 'Admin' }),
        z.object({ name: z.string(), role: z.string() })
      );
      $`Look up user 42 and tell me their name`;
    }, {
      model: mockModel as any,
    });

    const text = await result.text;
    expect(text).toContain('Here is the result:');
    expect(text).toContain('<code_response>Jane Doe</code_response>');
    expect(text).not.toContain('<run_code>');
  });

  it('Scenario B via runPrompt: silent execution, streaming continues', async () => {
    const executed = { called: false };

    const mockModel = createMockModel([
      {
        type: 'text',
        text: 'Updating:\n<run_code>\nawait logAction({ msg: "done" });\n</run_code>\nFinished.',
      },
    ]);

    const { result } = await runPrompt(async ({ defMethod, $ }) => {
      defMethod(
        'logAction',
        'Log an action',
        z.object({ msg: z.string() }),
        async ({ msg }) => { executed.called = true; return {}; },
        z.object({})
      );
      $`Log the action`;
    }, {
      model: mockModel as any,
    });

    const text = await result.text;
    expect(text).toContain('Updating:');
    expect(text).toContain('Finished.');
    expect(text).not.toContain('<code_response>');
    expect(text).not.toContain('<code_error>');
  });

  it('Scenario C via runPrompt: <code_error> emitted on Zod validation failure', async () => {
    const mockModel = createMockModel([
      {
        type: 'text',
        text: 'Looking up:\n<run_code>\nconst user = await fetchUser({ id: null });\n</run_code>',
      },
    ]);

    const { result } = await runPrompt(async ({ defMethod, $ }) => {
      defMethod(
        'fetchUser',
        'Fetch user by ID',
        z.object({ id: z.string() }),
        async ({ id }) => ({ name: 'Jane' }),
        z.object({ name: z.string() })
      );
      $`Look up user`;
    }, {
      model: mockModel as any,
    });

    const text = await result.text;
    expect(text).toContain('<code_error>');
    expect(text).toContain('</code_error>');
  });
});
