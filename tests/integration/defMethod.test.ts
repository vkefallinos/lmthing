/**
 * LLM Integration Test for defMethod (Zero-Step Tool Calling)
 *
 * Tests that a real LLM can correctly use `<run_code>` blocks to call registered
 * methods inline in its text stream — without a tool-call round-trip.
 *
 * Each test covers a distinct scenario from the Zero-Step specification:
 *   Scenario A — LLM writes `return` inside <run_code>: stream halts, value embedded
 *   Scenario B — LLM executes code silently (no return): stream continues
 *   Scenario C — LLM produces a type error or runtime error: <code_error> emitted
 *   Multi-method — LLM chains multiple method calls in one block
 *
 * Running:
 *   LM_TEST_MODEL=openai:gpt-4o-mini npm test -- --run tests/integration/defMethod
 *   LM_TEST_MODEL=anthropic:claude-3-5-sonnet-20241022 npm test -- --run tests/integration/defMethod
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { runPrompt } from '../../src/runPrompt';
import {
  hasTestModel,
  TEST_MODEL,
  TEST_TIMEOUT,
  getModelDisplayName,
} from './test-helper';

// ---------------------------------------------------------------------------
// Fake in-memory database (shared across methods within a test)
// ---------------------------------------------------------------------------

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  balance: number;
}

interface Order {
  orderId: string;
  userId: string;
  items: { sku: string; qty: number; price: number }[];
  status: 'pending' | 'shipped' | 'delivered';
}

function makeDb() {
  const users: Record<string, User> = {
    u1: { id: 'u1', name: 'Alice Chen', email: 'alice@example.com', role: 'admin', balance: 500.0 },
    u2: { id: 'u2', name: 'Bob Smith', email: 'bob@example.com', role: 'user', balance: 120.5 },
    u3: { id: 'u3', name: 'Carol White', email: 'carol@example.com', role: 'guest', balance: 0.0 },
  };

  const orders: Record<string, Order> = {
    o1: {
      orderId: 'o1',
      userId: 'u1',
      items: [
        { sku: 'WIDGET-A', qty: 2, price: 19.99 },
        { sku: 'WIDGET-B', qty: 1, price: 49.99 },
      ],
      status: 'shipped',
    },
    o2: {
      orderId: 'o2',
      userId: 'u2',
      items: [{ sku: 'GADGET-X', qty: 3, price: 9.99 }],
      status: 'pending',
    },
  };

  const auditLog: string[] = [];

  return { users, orders, auditLog };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('defMethod Integration Tests (Zero-Step Tool Calling)', () => {
  const modelDisplay = getModelDisplayName(TEST_MODEL);

  /**
   * Scenario A — Early return.
   *
   * The LLM should call fetchUser inside <run_code>, hit a `return` statement,
   * and have the returned value embedded as <code_response>...</code_response>
   * in the final text. The raw `<run_code>` tag must not appear in the output.
   */
  it.skipIf(!hasTestModel)(
    `Scenario A: LLM returns a value from <run_code> (early return) (${modelDisplay})`,
    { timeout: TEST_TIMEOUT },
    async () => {
      console.log(`\n=== defMethod Scenario A: early return (${modelDisplay}) ===`);

      const db = makeDb();
      const fetchUserCalled: string[] = [];

      const { result } = await runPrompt(
        async ({ defMethod, defSystem, $ }) => {
          defSystem(
            'instructions',
            'You are a customer support assistant. ' +
              'When asked about a user, call fetchUser inside a <run_code> block and return the result. ' +
              'Your response MUST contain a <run_code> block that calls fetchUser and uses `return`.',
          );

          defMethod(
            'fetchUser',
            'Fetch a user record by ID. Returns name, email, role, and account balance.',
            z.object({ id: z.string().describe('The user ID to look up') }),
            async ({ id }) => {
              fetchUserCalled.push(id);
              const user = db.users[id];
              if (!user) throw new Error(`User ${id} not found`);
              return { name: user.name, email: user.email, role: user.role, balance: user.balance };
            },
            z.object({
              name: z.string(),
              email: z.string(),
              role: z.enum(['admin', 'user', 'guest']),
              balance: z.number(),
            }),
          );

          $`Look up user ID "u1" and tell me their name and role. Use the fetchUser method.`;
        },
        { model: TEST_MODEL },
      );

      const text = await result.text;
      console.log(`  > Response:\n${text}\n`);

      // The raw <run_code> tag should have been consumed by the transformer
      expect(text).not.toContain('<run_code>');

      // The response should contain the injected <code_response> with the user data
      expect(text).toContain('<code_response>');
      expect(text).toContain('</code_response>');

      // The user data should appear somewhere in the response (either in code_response or narrated)
      const hasAlice = text.includes('Alice') || text.includes('alice');
      const hasAdmin = text.includes('admin') || text.includes('Admin');
      expect(hasAlice || hasAdmin).toBe(true);

      // fetchUser must have been invoked with u1
      expect(fetchUserCalled).toContain('u1');
      console.log(`  > fetchUser called with:`, fetchUserCalled);
      console.log(`  > Test passed!\n`);
    },
  );

  /**
   * Scenario B — Silent execution (no return).
   *
   * The LLM should call logAuditEvent inside <run_code> without a `return`.
   * The block executes silently: no <code_response> tag in the output, the
   * stream continues, and the handler side-effect (appending to auditLog) fires.
   */
  it.skipIf(!hasTestModel)(
    `Scenario B: LLM executes side-effect silently, no <code_response> (${modelDisplay})`,
    { timeout: TEST_TIMEOUT },
    async () => {
      console.log(`\n=== defMethod Scenario B: silent side-effect (${modelDisplay}) ===`);

      const db = makeDb();

      const { result } = await runPrompt(
        async ({ defMethod, defSystem, $ }) => {
          defSystem(
            'instructions',
            'You are an audit assistant. When told to log an event, call logAuditEvent inside a <run_code> block WITHOUT a return statement. ' +
              'After the code block, confirm in plain text that you logged the event.',
          );

          defMethod(
            'logAuditEvent',
            'Append an audit log entry. Does not return a value.',
            z.object({
              action: z.string().describe('The action being logged'),
              userId: z.string().describe('The user who performed the action'),
            }),
            async ({ action, userId }) => {
              db.auditLog.push(`[${new Date().toISOString()}] ${userId}: ${action}`);
              // intentionally returns nothing (undefined)
            },
            z.void(),
          );

          $`Log an audit event: action="login", userId="u2". Do NOT return anything from the code block.`;
        },
        { model: TEST_MODEL },
      );

      const text = await result.text;
      console.log(`  > Response:\n${text}\n`);
      console.log(`  > Audit log:`, db.auditLog);

      // No <code_response> should be injected when there is no return
      expect(text).not.toContain('<code_response>');
      expect(text).not.toContain('<run_code>');

      // The audit log side-effect should have fired
      expect(db.auditLog.length).toBeGreaterThan(0);
      const logEntry = db.auditLog[db.auditLog.length - 1];
      expect(logEntry).toContain('u2');
      expect(logEntry).toContain('login');

      console.log(`  > Test passed!\n`);
    },
  );

  /**
   * Scenario C — Type error.
   *
   * The system prompt explicitly tells the LLM to pass a number for a string
   * parameter, which must cause the TypeScript type checker to emit a
   * <code_error> rather than executing the handler.
   */
  it.skipIf(!hasTestModel)(
    `Scenario C: type error in <run_code> emits <code_error> without calling handler (${modelDisplay})`,
    { timeout: TEST_TIMEOUT },
    async () => {
      console.log(`\n=== defMethod Scenario C: type error (${modelDisplay}) ===`);

      const handlerCallCount = { n: 0 };

      const { result } = await runPrompt(
        async ({ defMethod, defSystem, $ }) => {
          defSystem(
            'instructions',
            'You are a test assistant. You MUST write a <run_code> block that calls ' +
              'fetchUser({ id: 999 }) — passing the number 999 (not a string). ' +
              'Do not correct the type. Write exactly: await fetchUser({ id: 999 });',
          );

          defMethod(
            'fetchUser',
            'Fetch a user record by ID (id must be a string).',
            z.object({ id: z.string() }),
            async ({ id }) => {
              // This should never be called when there is a type error
              handlerCallCount.n++;
              return { name: 'Jane', email: 'j@example.com', role: 'user' as const, balance: 0 };
            },
            z.object({
              name: z.string(),
              email: z.string(),
              role: z.enum(['admin', 'user', 'guest']),
              balance: z.number(),
            }),
          );

          $`Call fetchUser with id 999 (the number, not a string).`;
        },
        { model: TEST_MODEL },
      );

      const text = await result.text;
      console.log(`  > Response:\n${text}\n`);

      // A TypeScript type error should have been caught; <code_error> should appear
      expect(text).toContain('<code_error>');
      expect(text).toContain('</code_error>');

      // The handler must NOT have been called (type check halts before sandbox)
      expect(handlerCallCount.n).toBe(0);
      console.log(`  > Handler call count: ${handlerCallCount.n}`);
      console.log(`  > Test passed!\n`);
    },
  );

  /**
   * Multi-method chaining.
   *
   * The LLM should call two methods in sequence inside a single <run_code>
   * block: first fetchUser to get the user, then fetchOrdersForUser to get
   * their orders, then return a combined summary object.
   */
  it.skipIf(!hasTestModel)(
    `Multi-method: LLM chains two method calls in one <run_code> block (${modelDisplay})`,
    { timeout: TEST_TIMEOUT },
    async () => {
      console.log(`\n=== defMethod multi-method chaining (${modelDisplay}) ===`);

      const db = makeDb();
      const callLog: string[] = [];

      const { result } = await runPrompt(
        async ({ defMethod, defSystem, $ }) => {
          defSystem(
            'instructions',
            'You are an order management assistant. ' +
              'When asked for an order summary, use a SINGLE <run_code> block that calls both ' +
              'fetchUser and fetchOrdersForUser, then returns a combined object. ' +
              'Example:\n' +
              '<run_code>\n' +
              'const user = await fetchUser({ id: "u1" });\n' +
              'const orders = await fetchOrdersForUser({ userId: "u1" });\n' +
              'return { userName: user.name, orderCount: orders.count, totalValue: orders.totalValue };\n' +
              '</run_code>',
          );

          defMethod(
            'fetchUser',
            'Fetch a user record by ID.',
            z.object({ id: z.string() }),
            async ({ id }) => {
              callLog.push(`fetchUser(${id})`);
              const user = db.users[id];
              if (!user) throw new Error(`User ${id} not found`);
              return { name: user.name, role: user.role };
            },
            z.object({ name: z.string(), role: z.enum(['admin', 'user', 'guest']) }),
          );

          defMethod(
            'fetchOrdersForUser',
            'Fetch all orders belonging to a user and compute a summary.',
            z.object({ userId: z.string() }),
            async ({ userId }) => {
              callLog.push(`fetchOrdersForUser(${userId})`);
              const userOrders = Object.values(db.orders).filter(o => o.userId === userId);
              const totalValue = userOrders.reduce(
                (sum, o) => sum + o.items.reduce((s, i) => s + i.qty * i.price, 0),
                0,
              );
              return { count: userOrders.length, totalValue: Math.round(totalValue * 100) / 100 };
            },
            z.object({ count: z.number(), totalValue: z.number() }),
          );

          $`Give me an order summary for user "u1". Use both fetchUser and fetchOrdersForUser in a single <run_code> block.`;
        },
        { model: TEST_MODEL },
      );

      const text = await result.text;
      console.log(`  > Response:\n${text}\n`);
      console.log(`  > Call log:`, callLog);

      // The <run_code> block should have been consumed
      expect(text).not.toContain('<run_code>');

      // Both methods should have been called
      expect(callLog.some(c => c.startsWith('fetchUser'))).toBe(true);
      expect(callLog.some(c => c.startsWith('fetchOrdersForUser'))).toBe(true);

      // The returned value (JSON) should appear in <code_response>
      expect(text).toContain('<code_response>');
      // Alice's name or order value should appear somewhere
      const hasAlice = text.toLowerCase().includes('alice');
      const hasOrderData = text.includes('89') || text.includes('order') || text.includes('count');
      expect(hasAlice || hasOrderData).toBe(true);

      console.log(`  > Test passed!\n`);
    },
  );

  /**
   * Runtime error (Scenario C variant).
   *
   * The LLM calls a method with a valid type but with an ID that doesn't exist,
   * causing the handler to throw a runtime error. The stream should halt and
   * emit <code_error>.
   */
  it.skipIf(!hasTestModel)(
    `Scenario C variant: runtime error in handler emits <code_error> (${modelDisplay})`,
    { timeout: TEST_TIMEOUT },
    async () => {
      console.log(`\n=== defMethod Scenario C variant: runtime error (${modelDisplay}) ===`);

      const db = makeDb();

      const { result } = await runPrompt(
        async ({ defMethod, defSystem, $ }) => {
          defSystem(
            'instructions',
            'You are a database assistant. Call fetchUser with id "u999" (a user that does not exist). ' +
              'Write a <run_code> block that calls: await fetchUser({ id: "u999" }); ' +
              'Do not wrap it in try/catch.',
          );

          defMethod(
            'fetchUser',
            'Fetch a user record by ID. Throws if the user does not exist.',
            z.object({ id: z.string() }),
            async ({ id }) => {
              const user = db.users[id];
              if (!user) throw new Error(`User "${id}" not found in database`);
              return { name: user.name, role: user.role };
            },
            z.object({ name: z.string(), role: z.enum(['admin', 'user', 'guest']) }),
          );

          $`Look up user "u999".`;
        },
        { model: TEST_MODEL },
      );

      const text = await result.text;
      console.log(`  > Response:\n${text}\n`);

      // Runtime error should produce <code_error>
      expect(text).toContain('<code_error>');
      expect(text).toContain('</code_error>');
      expect(text).not.toContain('<run_code>');

      console.log(`  > Test passed!\n`);
    },
  );
});
