import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { MethodRegistry } from './MethodRegistry';
import { createZeroStepTransformer } from './streamProcessor';
import { generateTypeDeclarations } from './typeGenerator';
import { validateTypeScript } from './typeChecker';
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
// generateTypeDeclarations tests
// ---------------------------------------------------------------------------

describe('generateTypeDeclarations', () => {
  it('generates declare function for a simple method', () => {
    const registry = new MethodRegistry();
    registry.register({
      name: 'fetchUser',
      description: 'Fetch user by ID',
      parameterSchema: z.object({ id: z.string() }),
      handler: async ({ id }: { id: string }) => ({ name: 'Jane', role: 'Admin' }),
      responseSchema: z.object({ name: z.string(), role: z.string() }),
    });

    const declarations = generateTypeDeclarations(registry);
    expect(declarations).toMatchSnapshot('single-method-declarations');
    expect(declarations).toContain('declare function fetchUser');
    expect(declarations).toContain('id: string');
    expect(declarations).toContain('name: string');
    expect(declarations).toContain('role: string');
  });

  it('generates declarations for multiple methods', () => {
    const registry = new MethodRegistry();
    registry.register({
      name: 'add',
      description: 'Add numbers',
      parameterSchema: z.object({ a: z.number(), b: z.number() }),
      handler: async ({ a, b }: { a: number; b: number }) => a + b,
      responseSchema: z.number(),
    });
    registry.register({
      name: 'greet',
      description: 'Greet someone',
      parameterSchema: z.object({ name: z.string() }),
      handler: async ({ name }: { name: string }) => `Hello, ${name}!`,
      responseSchema: z.string(),
    });

    const declarations = generateTypeDeclarations(registry);
    expect(declarations).toMatchSnapshot('multi-method-declarations');
    expect(declarations).toContain('declare function add');
    expect(declarations).toContain('declare function greet');
  });
});

// ---------------------------------------------------------------------------
// validateTypeScript tests
// ---------------------------------------------------------------------------

describe('validateTypeScript', () => {
  function makeTypedRegistry(): MethodRegistry {
    const registry = new MethodRegistry();
    registry.register({
      name: 'fetchUser',
      description: 'Fetch user by ID',
      parameterSchema: z.object({ id: z.string() }),
      handler: async ({ id }: { id: string }) => ({ name: 'Jane', role: 'Admin' }),
      responseSchema: z.object({ name: z.string(), role: z.string() }),
    });
    registry.register({
      name: 'add',
      description: 'Add two numbers',
      parameterSchema: z.object({ a: z.number(), b: z.number() }),
      handler: async ({ a, b }: { a: number; b: number }) => ({ sum: a + b }),
      responseSchema: z.object({ sum: z.number() }),
    });
    return registry;
  }

  it('accepts valid code', () => {
    const registry = makeTypedRegistry();
    const code = 'const user = await fetchUser({ id: "123" });\nreturn user.name;';
    const result = validateTypeScript(code, registry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects wrong argument type (null for string)', () => {
    const registry = makeTypedRegistry();
    const code = 'const user = await fetchUser({ id: null });';
    const result = validateTypeScript(code, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].line).toBe(1);
    expect(result.errors).toMatchSnapshot('null-id-errors');
  });

  it('rejects wrong argument type (number for string)', () => {
    const registry = makeTypedRegistry();
    const code = 'const user = await fetchUser({ id: 42 });';
    const result = validateTypeScript(code, registry);
    expect(result.valid).toBe(false);
    expect(result.errors).toMatchSnapshot('number-id-errors');
  });

  it('rejects unknown method call', () => {
    const registry = makeTypedRegistry();
    const code = 'const result = await unknownMethod({ x: 1 });';
    const result = validateTypeScript(code, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects accessing property that does not exist on return type', () => {
    const registry = makeTypedRegistry();
    const code = 'const user = await fetchUser({ id: "1" });\nreturn user.nonExistentProp;';
    const result = validateTypeScript(code, registry);
    expect(result.valid).toBe(false);
    expect(result.errors).toMatchSnapshot('nonexistent-prop-errors');
  });

  it('accepts valid multi-step code using multiple methods', () => {
    const registry = makeTypedRegistry();
    const code = [
      'const user = await fetchUser({ id: "1" });',
      'const calc = await add({ a: 10, b: 20 });',
      'return `${user.name}: ${calc.sum}`;',
    ].join('\n');
    const result = validateTypeScript(code, registry);
    expect(result.valid).toBe(true);
  });

  it('reports correct line numbers for errors', () => {
    const registry = makeTypedRegistry();
    // Error is on line 2 (the second line)
    const code = 'const user = await fetchUser({ id: "ok" });\nconst bad = await fetchUser({ id: 123 });';
    const result = validateTypeScript(code, registry);
    expect(result.valid).toBe(false);
    expect(result.errors[0].line).toBe(2);
    expect(result.errors[0].codeLine).toContain('fetchUser');
  });
});

// ---------------------------------------------------------------------------
// createZeroStepTransformer – unit tests (direct stream manipulation)
// ---------------------------------------------------------------------------

describe('createZeroStepTransformer', () => {
  /**
   * Helper that registers methods using typed schemas so TypeScript
   * validation passes for valid calls.
   */
  function makeTypedRegistry(methods: Record<string, { schema: z.ZodType<any>; handler: (args: any) => any }> = {}): MethodRegistry {
    const registry = new MethodRegistry();
    for (const [name, { schema, handler }] of Object.entries(methods)) {
      registry.register({
        name,
        description: name,
        parameterSchema: schema,
        handler,
        responseSchema: z.any(),
      });
    }
    return registry;
  }

  it('passes through text with no <run_code> unchanged', async () => {
    const registry = makeTypedRegistry();
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
    const registry = makeTypedRegistry();
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
    const registry = makeTypedRegistry({
      fetchUser: {
        schema: z.object({ id: z.string() }),
        handler: async ({ id }: { id: string }) => ({ name: 'Jane Doe', role: 'Admin' }),
      },
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
    const registry = makeTypedRegistry({
      add: {
        schema: z.object({ a: z.number(), b: z.number() }),
        handler: async ({ a, b }: { a: number; b: number }) => a + b,
      },
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
    const registry = makeTypedRegistry({
      doSomething: {
        schema: z.object({ trigger: z.boolean() }),
        handler: async ({ trigger }: { trigger: boolean }) => { sideEffect(); return null; },
      },
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: 'Before.' },
      { type: 'text-delta', delta: '<run_code>\nawait doSomething({ trigger: true });\n</run_code>' },
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
    expect(sideEffect).toHaveBeenCalledTimes(1);
  });

  it('Scenario B: returns null value is treated as return (non-undefined)', async () => {
    const registry = makeTypedRegistry({
      getNull: {
        schema: z.object({ _: z.undefined().optional() }),
        handler: async () => null,
      },
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: '<run_code>\nreturn await getNull({});\n</run_code>' },
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
      // null is not a valid string — caught by TypeScript type checker first
      { type: 'text-delta', delta: 'const user = await fetchUser({ id: null });\n' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);

    expect(text).toMatch(/<code_error>[\s\S]+<\/code_error>/);
    // Stream halts: finish chunk should still be passed through
    expect(output.some(c => c.type === 'finish')).toBe(true);
  });

  it('Scenario C: emits <code_error> when code throws a runtime error', async () => {
    const registry = makeTypedRegistry({
      badFn: {
        schema: z.object({ _: z.undefined().optional() }),
        handler: async () => { throw new Error('Something went wrong'); },
      },
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: '<run_code>\nawait badFn({});\n</run_code>' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);

    expect(text).toContain('<code_error>Something went wrong</code_error>');
  });

  // ---- Multiple code blocks ----

  it('handles multiple sequential <run_code> blocks in one stream', async () => {
    const registry = makeTypedRegistry({
      double: {
        schema: z.object({ n: z.number() }),
        handler: async ({ n }: { n: number }) => n * 2,
      },
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
    const registry = makeTypedRegistry({
      getUser: {
        schema: z.object({ _: z.undefined().optional() }),
        handler: async () => ({ name: 'Alice', age: 30 }),
      },
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: '<run_code>\nreturn await getUser({});\n</run_code>' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);
    expect(text).toContain('<code_response>{"name":"Alice","age":30}</code_response>');
  });

  // ---- TypeScript type checking ----

  it('halts immediately on TypeScript type error (wrong arg type)', async () => {
    const registry = new MethodRegistry();
    registry.register({
      name: 'fetchUser',
      description: 'Fetch user by ID',
      parameterSchema: z.object({ id: z.string() }),
      handler: async ({ id }: { id: string }) => ({ name: 'Jane' }),
      responseSchema: z.object({ name: z.string() }),
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-delta', delta: '<run_code>\n' },
      // Pass number instead of string - TypeScript should catch this
      { type: 'text-delta', delta: 'const user = await fetchUser({ id: 42 });\n' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);

    // Should emit a TypeScript type error
    expect(text).toContain('<code_error>TypeScript error:');
    expect(text).toContain('</code_error>');
    // The handler should NOT have been called
    expect(output.some(c => c.type === 'finish')).toBe(true);
  });

  it('halts on TypeScript error with correct line number in error message', async () => {
    const registry = new MethodRegistry();
    registry.register({
      name: 'add',
      description: 'Add numbers',
      parameterSchema: z.object({ a: z.number(), b: z.number() }),
      handler: async ({ a, b }: { a: number; b: number }) => ({ sum: a + b }),
      responseSchema: z.object({ sum: z.number() }),
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      // First line is valid, second line has type error
      { type: 'text-delta', delta: '<run_code>\nconst x = 10;\nconst result = await add({ a: "not-a-number", b: 5 });\n' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    const text = textOf(output);

    expect(text).toContain('<code_error>TypeScript error:');
    // Error message should contain a "Line N:" reference (exact number depends on type declaration length)
    expect(text).toMatch(/Line \d+:/);
    // The reported line number should be >= 2 (error is on the second user code line)
    const lineMatch = text.match(/Line (\d+):/);
    expect(lineMatch).not.toBeNull();
    expect(parseInt(lineMatch![1], 10)).toBeGreaterThanOrEqual(2);
  });

  it('snapshot: TypeScript error output format', async () => {
    const registry = new MethodRegistry();
    registry.register({
      name: 'greet',
      description: 'Greet a person',
      parameterSchema: z.object({ name: z.string() }),
      handler: async ({ name }: { name: string }) => `Hello, ${name}!`,
      responseSchema: z.string(),
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-start', id: '0' },
      { type: 'text-delta', delta: 'Greeting: <run_code>\n' },
      // number instead of string – TypeScript error
      { type: 'text-delta', delta: 'return await greet({ name: 99 });\n' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    // Snapshot exact output including chunk types
    expect(output).toMatchSnapshot('type-error-output-chunks');
    expect(textOf(output)).toMatchSnapshot('type-error-output-text');
  });

  it('snapshot: successful execution output format', async () => {
    const registry = new MethodRegistry();
    registry.register({
      name: 'greet',
      description: 'Greet a person',
      parameterSchema: z.object({ name: z.string() }),
      handler: async ({ name }: { name: string }) => `Hello, ${name}!`,
      responseSchema: z.string(),
    });

    const transformer = createZeroStepTransformer(registry);

    const chunks = [
      { type: 'text-start', id: '0' },
      { type: 'text-delta', delta: 'Greeting: <run_code>\n' },
      { type: 'text-delta', delta: 'return await greet({ name: "Alice" });\n' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const output = await collectChunks(transformer(createChunkStream(chunks)));
    expect(output).toMatchSnapshot('success-output-chunks');
    expect(textOf(output)).toMatchSnapshot('success-output-text');
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
    expect(executed.called).toBe(true);
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

  it('Scenario C via runPrompt: <code_error> emitted on TypeScript type error', async () => {
    const mockModel = createMockModel([
      {
        type: 'text',
        text: '<run_code>\nconst user = await fetchUser({ id: 123 });\n</run_code>',
      },
    ]);

    const handlerSpy = vi.fn(async ({ id }: { id: string }) => ({ name: 'Jane' }));

    const { result } = await runPrompt(async ({ defMethod, $ }) => {
      defMethod(
        'fetchUser',
        'Fetch user by ID',
        z.object({ id: z.string() }),
        handlerSpy,
        z.object({ name: z.string() })
      );
      $`Look up user`;
    }, {
      model: mockModel as any,
    });

    const text = await result.text;
    // TypeScript caught the number-for-string before sandbox execution
    expect(text).toContain('<code_error>TypeScript error:');
    expect(text).toContain('</code_error>');
    // Handler should NOT have been called since type check halted execution
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('snapshot: full prompt steps for a successful defMethod execution', async () => {
    const fetchUser = vi.fn(async ({ id }: { id: string }) => ({ name: 'Jane Doe', role: 'Admin' }));

    const mockModel = createMockModel([
      {
        type: 'text',
        text: 'I found:\n<run_code>\nconst user = await fetchUser({ id: "42" });\nreturn user.name;\n</run_code>\nDone.',
      },
    ]);

    const { result, prompt } = await runPrompt(async ({ defMethod, $ }) => {
      defMethod(
        'fetchUser',
        'Fetch user by ID',
        z.object({ id: z.string() }),
        fetchUser,
        z.object({ name: z.string(), role: z.string() })
      );
      $`Who is user 42?`;
    }, {
      model: mockModel as any,
    });

    const text = await result.text;
    expect(text).toContain('<code_response>Jane Doe</code_response>');
    expect(fetchUser).toHaveBeenCalledWith({ id: '42' });

    // Snapshot the full steps structure (system prompt, user message, model response)
    expect(prompt.steps).toMatchSnapshot('successful-defMethod-steps');
  });

  it('snapshot: full prompt steps for a TypeScript error in defMethod', async () => {
    const handlerSpy = vi.fn(async ({ id }: { id: string }) => ({ name: 'Jane' }));

    const mockModel = createMockModel([
      {
        type: 'text',
        // LLM passes wrong type - number instead of string
        text: '<run_code>\nconst user = await fetchUser({ id: 999 });\nreturn user.name;\n</run_code>',
      },
    ]);

    const { result, prompt } = await runPrompt(async ({ defMethod, $ }) => {
      defMethod(
        'fetchUser',
        'Fetch user by ID',
        z.object({ id: z.string() }),
        handlerSpy,
        z.object({ name: z.string() })
      );
      $`Get user 999`;
    }, {
      model: mockModel as any,
    });

    const text = await result.text;
    expect(text).toContain('<code_error>TypeScript error:');
    expect(handlerSpy).not.toHaveBeenCalled();

    // Snapshot the steps to verify system prompt structure and response
    expect(prompt.steps).toMatchSnapshot('type-error-defMethod-steps');
  });

  it('snapshot: system prompt includes generated type declarations for each method', async () => {
    const mockModel = createMockModel([{ type: 'text', text: 'Ready.' }]);

    const { result, prompt } = await runPrompt(async ({ defMethod, $ }) => {
      defMethod(
        'fetchUser',
        'Fetch user by ID',
        z.object({ id: z.string() }),
        async ({ id }) => ({ name: 'Jane', role: 'Admin' }),
        z.object({ name: z.string(), role: z.string() })
      );
      defMethod(
        'add',
        'Add two numbers',
        z.object({ a: z.number(), b: z.number() }),
        async ({ a, b }) => ({ sum: a + b }),
        z.object({ sum: z.number() })
      );
      $`Use the available methods.`;
    }, {
      model: mockModel as any,
    });

    await result.text;

    // Snapshot the generated system section to verify it describes both methods
    const systems = (prompt as any).systems;
    expect(systems['zero_step_methods']).toMatchSnapshot('two-method-system-prompt');
  });
});
