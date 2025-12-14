# StatefulPrompt DX Refactoring Proposal

This document proposes non-breaking and minor refactors to improve developer experience in `StatefulPrompt` and related modules.

---

## Priority 1: Critical DX Issues

### 1.1 Fix Effect Dependency Tracking (Minor)

**Problem**: Dependencies are compared by value, but array identity changes on every re-execution, causing effects to run every step.

**Current behavior:**
```typescript
defEffect((ctx, step) => {
  console.log('Runs every step!'); // Bug: array [count] is new each time
}, [count]);
```

**Root cause** (`src/effects/EffectsManager.ts:66-76`):
```typescript
// Dependencies compared by JSON.stringify - array is always "new"
const currentDeps = JSON.stringify(dependencies?.map(d => this.resolveValue(d)));
```

**Proposed fix - Stable dependency references:**

Option A: **Named dependencies with auto-resolution**
```typescript
defEffect((ctx, step) => {
  console.log(`Count: ${ctx.state.count}`);
}, { deps: ['count'] }); // Reference by state key name
```

Option B: **Dependency extractor function**
```typescript
defEffect(
  (ctx, step) => { console.log(ctx.deps.count); },
  () => ({ count })  // Function re-evaluated to get current values
);
```

Option C: **WeakMap-based identity tracking** (recommended)
```typescript
// Track proxy identity, not array identity
private _dependencyIdentities = new WeakMap<any, string>();

defEffect((ctx, step) => {
  // count proxy has stable identity across re-executions
}, [count]);
```

**Implementation sketch (Option C):**
```typescript
// src/effects/EffectsManager.ts
export class EffectsManager {
  private _proxyIdentities = new WeakMap<object, symbol>();

  private resolveIdentity(dep: any): string {
    if (typeof dep === 'object' && dep !== null) {
      let id = this._proxyIdentities.get(dep);
      if (!id) {
        id = Symbol();
        this._proxyIdentities.set(dep, id);
      }
      return String(id);
    }
    return JSON.stringify(dep);
  }
}
```

---

### 1.2 Clarify Effect Callback Parameters (Minor)

**Problem**: Parameter names `prompt` and `step` are misleading.

**Current:**
```typescript
defEffect((prompt: PromptContext, step: StepModifier) => {
  // 'prompt' isn't a Prompt, 'step' isn't step data
});
```

**Proposed:**
```typescript
defEffect((context: EffectContext, modify: StepModifier) => {
  // context.stepNumber, context.isFirstStep, etc.
  // modify('messages', [...]) - clearly a function
});

// Or with destructuring hint
defEffect(({ stepNumber, isFirstStep }, modify) => {
  modify('messages', [{ role: 'system', content: `Step ${stepNumber}` }]);
});
```

**Type rename:**
```typescript
// src/types/effects.ts
export interface EffectContext {  // Renamed from PromptContext
  stepNumber: number;
  isFirstStep: boolean;
  previousStepResult?: StepResult;
}

export type EffectCallback = (
  context: EffectContext,
  modify: StepModifier
) => void;
```

**Migration**: Export `PromptContext` as deprecated alias for `EffectContext`.

---

## Priority 2: Code Duplication (Non-Breaking)

### 2.1 Extract Proxy Factory

**Problem**: `createProxy()` in StatefulPrompt is 62 lines of duplicated trap handlers.

**Current** (`src/StatefulPrompt.ts:225-287`):
```typescript
private createProxy(tag: string, type: DefType, name: string) {
  // 6 proxy traps, each with similar logic
  const handler = {
    get() { /* remind, disable, value logic */ },
    has() { /* duplicates property list */ },
    ownKeys() { /* duplicates property list */ },
    getOwnPropertyDescriptor() { /* duplicates remind/disable logic */ }
  };
}
```

**Proposed** - Extract to `src/proxy/DefinitionProxy.ts`:
```typescript
export interface DefinitionProxyConfig {
  tag: string;
  type: DefType;
  name: string;
  onRemind: () => void;
  onDisable: () => void;
}

export function createDefinitionProxy(config: DefinitionProxyConfig): DefinitionProxy {
  const { tag, onRemind, onDisable } = config;

  const methods = {
    value: tag,
    remind: () => { onRemind(); return proxy; },
    disable: () => { onDisable(); return proxy; },
    valueOf: () => tag,
    toString: () => tag,
    [Symbol.toPrimitive]: () => tag
  };

  const proxy = new Proxy({}, {
    get: (_, prop) => methods[prop] ?? tag,
    has: (_, prop) => prop in methods,
    ownKeys: () => Reflect.ownKeys(methods),
    getOwnPropertyDescriptor: (_, prop) =>
      prop in methods ? { enumerable: true, configurable: true, value: methods[prop] } : undefined
  });

  return proxy;
}
```

**Impact**: ~62 lines → ~25 lines, single source of truth for proxy behavior.

---

### 2.2 Unify Composite Tool/Agent Registration

**Problem**: `_registerCompositeTool()` and `_registerCompositeAgent()` are 90% identical (~180 lines each).

**Proposed** - Extract common logic:
```typescript
// src/composite/CompositeExecutor.ts
export interface SubDefinition<TArgs, TResult> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TArgs>;
  execute: (args: TArgs) => Promise<TResult>;
  options?: CallbackOptions;
}

export function createCompositeSchema<T extends SubDefinition<any, any>[]>(
  subs: T
): z.ZodType<{ calls: Array<{ name: string; args: any }> }> {
  const callSchemas = subs.map(sub =>
    z.object({
      name: z.literal(sub.name),
      args: sub.inputSchema
    })
  );
  return z.object({ calls: z.array(z.union(callSchemas as any)) });
}

export function buildEnhancedDescription(
  baseDescription: string,
  subs: SubDefinition<any, any>[],
  itemType: 'sub-tools' | 'sub-agents'
): string {
  const docs = subs.map(s => `  - ${s.name}: ${s.description}`).join('\n');
  return `${baseDescription}\n\nAvailable ${itemType}:\n${docs}`;
}

export async function executeComposite<T extends SubDefinition<any, any>>(
  calls: Array<{ name: string; args: any }>,
  subs: Map<string, T>,
  executeOne: (sub: T, args: any) => Promise<any>
): Promise<{ results: Array<{ name: string; result: any }> }> {
  const results = [];
  for (const call of calls) {
    const sub = subs.get(call.name);
    if (!sub) {
      results.push({ name: call.name, error: `Unknown: ${call.name}` });
      continue;
    }
    try {
      const result = await executeOne(sub, call.args);
      results.push({ name: call.name, result });
    } catch (e) {
      results.push({ name: call.name, error: String(e) });
    }
  }
  return { results };
}
```

**Usage in StatefulPrompt:**
```typescript
private _registerCompositeTool(name: string, description: string, subTools: SubToolDefinition[]) {
  const schema = createCompositeSchema(subTools);
  const desc = buildEnhancedDescription(description, subTools, 'sub-tools');
  const subsMap = new Map(subTools.map(s => [s.name, s]));

  const execute = async (args: { calls: any[] }) => {
    return executeComposite(args.calls, subsMap, async (sub, args) => {
      return this._executeWithCallbacks(sub.execute, args, sub.options);
    });
  };

  this.addTool(name, desc, schema, execute);
}
```

**Impact**: ~360 lines → ~100 lines shared + ~30 lines each for tool/agent.

---

### 2.3 Consolidate Callback Execution

**Problem**: `beforeCall`/`onSuccess`/`onError` logic appears 4+ times.

**Proposed** - Single callback executor:
```typescript
// src/callbacks/CallbackExecutor.ts
export interface ExecutionCallbacks<TInput, TOutput> {
  beforeCall?: (input: TInput, output: undefined) => Promise<TOutput | undefined>;
  onSuccess?: (input: TInput, output: TOutput) => Promise<TOutput | undefined>;
  onError?: (input: TInput, error: Error) => Promise<TOutput | undefined>;
}

export async function executeWithCallbacks<TInput, TOutput>(
  execute: (input: TInput) => Promise<TOutput>,
  input: TInput,
  callbacks?: ExecutionCallbacks<TInput, TOutput>
): Promise<TOutput> {
  // beforeCall - may short-circuit
  if (callbacks?.beforeCall) {
    const early = await callbacks.beforeCall(input, undefined);
    if (early !== undefined) return early;
  }

  try {
    const output = await execute(input);

    // onSuccess - may transform output
    if (callbacks?.onSuccess) {
      const transformed = await callbacks.onSuccess(input, output);
      return transformed !== undefined ? transformed : output;
    }
    return output;
  } catch (error) {
    // onError - may recover
    if (callbacks?.onError) {
      const recovered = await callbacks.onError(input, error as Error);
      if (recovered !== undefined) return recovered;
    }
    throw error;
  }
}
```

**Impact**: ~200 lines of duplicated callback handling → ~30 lines shared.

---

## Priority 3: Type Safety Improvements

### 3.1 Stronger `setState` Types (Non-Breaking)

**Problem**: `setState` accepts `T | ((prev: T) => T)` but doesn't properly constrain function updates.

**Current:**
```typescript
const [count, setCount] = defState('count', 0);
setCount('invalid'); // TypeScript allows this! T is inferred as 0, not number
```

**Proposed** - Proper overloads:
```typescript
export type StateSetter<T> = {
  (value: T): void;
  (updater: (prev: T) => T): void;
};

// In StateManager
createStateAccessor<T>(key: string, initial: T): [T, StateSetter<T>] {
  const setter: StateSetter<T> = (valueOrUpdater) => {
    const prev = this.get<T>(key);
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (p: T) => T)(prev as T)
      : valueOrUpdater;
    this.set(key, next);
  };
  // ...
}
```

---

### 3.2 Improved StepModifier JSDoc (Non-Breaking)

**Problem**: `StepModifier` uses generic constraint but IDE autocomplete is poor.

**Proposed** - Keep current signature but improve JSDoc:
```typescript
/**
 * Modify the current step by adding items to a specific aspect.
 *
 * @param aspect - What to modify: 'messages' | 'tools' | 'systems' | 'variables'
 * @param items - Items to add (appended to existing items)
 *
 * @example
 * // Add a system message
 * modify('messages', [{ role: 'system', content: 'Extra context' }]);
 *
 * @example
 * // Add a tool dynamically
 * modify('tools', [{ name: 'search', ... }]);
 *
 * @example
 * // Add system prompt section
 * modify('systems', [{ name: 'rules', content: 'Be helpful' }]);
 *
 * @example
 * // Add variable
 * modify('variables', [{ name: 'USER', value: 'Alice', type: 'string' }]);
 */
export type StepModifier = <K extends keyof StepModifierItems>(
  aspect: K,
  items: StepModifierItems[K]
) => void;
```

---

### 3.3 Plugin Type Inference (Minor)

**Problem**: Plugin methods require manual `this: StatefulPrompt` typing.

**Proposed** - Plugin builder with inference:
```typescript
// src/plugins/createPlugin.ts
export function createPlugin<TMethods extends Record<string, Function>>(
  methods: {
    [K in keyof TMethods]: (
      this: StatefulPrompt,
      ...args: Parameters<TMethods[K]>
    ) => ReturnType<TMethods[K]>
  }
): Plugin & TMethods {
  return methods as any;
}

// Usage:
export const taskListPlugin = createPlugin({
  defTaskList(tasks: Task[] = []) {
    // 'this' is automatically typed as StatefulPrompt
    const [taskList, setTaskList] = this.defState('taskList', tasks);
    // ...
  }
});
```

**Migration**: Existing plugins continue to work; `createPlugin` is additive.

---

## Priority 4: Ergonomic Improvements

### 4.1 Batch State Updates (Non-Breaking, Additive)

**Problem**: Multiple `setState` calls in a tool may trigger effects inconsistently.

**Proposed** - Transaction API:
```typescript
// batch() helper - new additive API
defTool('complexTool', 'desc', schema, async (args) => {
  prompt.batch(() => {
    setCount(c => c + 1);
    setPhase('processing');
    setFindings(prev => [...prev, newFinding]);
  }); // Effects run once after all updates
});
```

**Implementation sketch:**
```typescript
// src/state/StateManager.ts
private _batchDepth = 0;
private _pendingUpdates: Array<() => void> = [];

batch(fn: () => void): void {
  this._batchDepth++;
  try {
    fn();
  } finally {
    this._batchDepth--;
    if (this._batchDepth === 0) {
      this._flushUpdates();
    }
  }
}
```

---

### 4.2 State Inspection API (Non-Breaking, Additive)

**Problem**: No way to list all state keys or get state without setter.

**Proposed:**
```typescript
// Read state without setter
const count = prompt.getState<number>('counter');

// List all state keys
const keys = prompt.getStateKeys(); // ['counter', 'phase', 'findings']

// Get all state as object
const snapshot = prompt.getStateSnapshot();
// { counter: 5, phase: 'analysis', findings: [...] }
```

---

### 4.3 Definition Reconciliation Visibility (Non-Breaking, Additive)

**Problem**: Definitions are silently removed during reconciliation.

**Proposed** - Optional callback:
```typescript
const { result } = await runPrompt(async ({ defTool, $ }) => {
  // ...
}, {
  model: 'openai:gpt-4o',
  onReconcile: (removed) => {
    console.log('Removed definitions:', removed);
    // [{ type: 'defTool', name: 'optionalTool' }]
  }
});

// Or via defHook
defHook('onReconcile', (removed) => {
  console.log('Reconciled:', removed);
});
```

---

## Priority 5: Code Organization (Non-Breaking)

### 5.1 Fix Double Plugin Binding

**Problem**: Plugins bound in `StatefulPrompt.setPlugins()` AND `runPrompt.createPromptProxyWithPlugins()`.

**Proposed** - Single binding location:
```typescript
// Remove binding from StatefulPrompt.setPlugins()
setPlugins(plugins: readonly Plugin[]): void {
  this._plugins = plugins;
  // Don't bind here - let runPrompt handle it
}

// Keep binding only in runPrompt.ts
function createPromptProxyWithPlugins(...) {
  // Single authoritative binding location
}
```

---

### 5.2 Module Structure Reorganization

**Current structure** has proxy logic scattered:
```
src/
  StatefulPrompt.ts (contains createProxy)
  state/StateManager.ts (returns raw values)
  runPrompt.ts (creates another proxy)
```

**Proposed structure:**
```
src/
  StatefulPrompt.ts (uses proxy factories)
  proxy/
    DefinitionProxy.ts    # def, defData, defSystem proxies
    PromptProxy.ts        # Method binding proxy (from runPrompt)
  state/
    StateManager.ts
  composite/
    CompositeExecutor.ts  # Shared tool/agent composite logic
  callbacks/
    CallbackExecutor.ts   # Shared beforeCall/onSuccess/onError
```

---

## Implementation Plan

### Phase 1: Non-Breaking (ship immediately)
1. Extract proxy factory (2.1)
2. Consolidate callback execution (2.3)
3. Unify composite tool/agent (2.2)
4. Fix double plugin binding (5.1)
5. Add JSDoc improvements (3.2)
6. Stronger setState types (3.1)
7. Add state inspection API (4.2)
8. Add batch state updates (4.1)
9. Add onReconcile callback (4.3)
10. Module reorganization (5.2)

### Phase 2: Minor Breaking (semver minor)
1. Rename `PromptContext` → `EffectContext` with deprecated alias (1.2)
2. Fix effect dependency tracking (1.1)
3. Plugin type inference helper (3.3)

---

## Summary

| Refactor | Impact | Breaking | Effort |
|----------|--------|----------|--------|
| 1.1 Fix deps tracking | High | Minor | High |
| 1.2 Rename params | Medium | Minor | Low |
| 2.1 Proxy factory | Medium | None | Low |
| 2.2 Composite unify | Medium | None | Medium |
| 2.3 Callback consolidate | Medium | None | Low |
| 3.1 setState types | Low | None | Low |
| 3.2 StepModifier JSDoc | Low | None | Low |
| 3.3 Plugin inference | Medium | Minor | Medium |
| 4.1 Batch updates | Medium | None | Medium |
| 4.2 State inspection | Low | None | Low |
| 4.3 Reconcile visibility | Low | None | Low |
| 5.1 Fix double bind | Low | None | Low |
| 5.2 Module reorg | Medium | None | High |

**Recommended order**: 2.1 → 2.3 → 5.1 → 3.2 → 3.1 → 4.2 → 4.1 → 4.3 → 2.2 → 5.2 → 1.2 → 3.3 → 1.1
