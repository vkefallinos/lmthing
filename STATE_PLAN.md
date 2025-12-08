# Plan: Stateful Prompt with Effects System

## Overview

This plan introduces a React-like hooks system where the `promptFn` is **re-executed on every step**, state persists across runs, and effects run based on dependency changes. This enables dynamic, reactive prompt configuration.

---

## Architecture Changes

### 1. New Execution Model

```
Current: promptFn runs once → multiple steps execute
New:     promptFn runs on EVERY step → effects evaluated → step executes
```

**Key insight:** The prompt function becomes a "render function" that's re-executed each step, with state preserved externally.

---

## Implementation Components

### Phase 1: State Management (`defState`)

**Location:** `src/Prompt.ts`

**Behavior:**
- `defState(key, initialValue)` returns `[getter, setter]` tuple
- State stored in a `Map<string, any>` outside the prompt function scope
- Setter triggers state update but doesn't immediately re-run (batched per step)
- Multiple `setState` calls within an effect should batch

**Implementation tasks:**
1. Add `_stateStore: Map<string, any>` to Prompt class
2. Implement `defState(key, initialValue)`:
   - On first call: initialize state with `initialValue`
   - On subsequent calls: return existing state
   - Return `[stateProxy, setterFunction]`
3. State proxy should return nested object that's reactive
4. Setter function updates `_stateStore[key]`

---

### Phase 2: Enhanced Definition Returns

**Current:** `def()`, `defSystem()`, `defTool()` return simple strings

**New:** Return proxy objects with:
- String coercion (for template literal use)
- `.remind()` method - marks item to be re-emphasized
- `.value` getter - current value
- `.name` - the definition name

**Implementation tasks:**
1. Create `DefinitionProxy` class/factory:
   ```typescript
   interface DefinitionProxy {
     name: string;
     value: any;
     remind(): void;
     toString(): string;  // Returns XML reference like '<var1>'
   }
   ```
2. Update `def()`, `defSystem()`, `defTool()`, `defAgent()` to return proxies
3. Store "reminded" items in a Set for effect processing

---

### Phase 3: Effects System (`defEffect`)

**Signature:** `defEffect(callback, dependencies?)`

**Behavior:**
- Callback receives `(promptContext, stepModifier)`
- Dependencies are shallow-compared each step
- Effect runs when:
  - First registration (like React useEffect)
  - Any dependency value changes
  - No dependencies provided (runs every step)

**Implementation tasks:**
1. Add `_effects: Effect[]` array to Prompt
2. Add `_effectDeps: Map<number, any[]>` for dependency tracking
3. Implement `defEffect(callback, deps?)`:
   - Register effect with index
   - Store dependencies for comparison
4. Create effect execution logic:
   - Compare new deps with stored deps (shallow)
   - Execute callback if changed
   - Update stored deps

---

### Phase 4: Prompt Context Object

The first argument to effects provides read-only access to current prompt state:

```typescript
interface PromptContext {
  messages: MessageCollection;    // Current messages with utilities
  tools: ToolCollection;          // Defined tools with .has(), .filter()
  systems: SystemCollection;      // Defined systems with .has(), .filter()
  variables: VariableCollection;  // Defined variables
  lastTool: LastToolInfo | null;  // Info about most recent tool call
  stepNumber: number;
}

interface MessageCollection extends Array<Message> {
  // Array of messages with additional utilities
}

interface ToolCollection {
  has(name: string): boolean;
  filter(predicate: (tool) => boolean): Tool[];
  // Iterable over tool definitions
}
```

**Implementation tasks:**
1. Create `PromptContext` class/interface
2. Implement collection wrappers with utility methods
3. Track `lastTool` from previous step results

---

### Phase 5: Step Modifier Function

The second argument to effects allows modifying what's sent to the model:

```typescript
type StepModifier = (
  aspect: 'messages' | 'tools' | 'systems' | 'variables',
  items: any[]
) => void;
```

**Behavior:**
- Multiple calls accumulate (don't overwrite)
- Filters apply to current step only
- Called items replace defaults for that aspect

**Implementation tasks:**
1. Create `StepModifications` accumulator
2. Implement `step(aspect, items)` function
3. Apply modifications in `prepareStep` hook

---

### Phase 6: Re-run Architecture

**Core change:** `Prompt.run()` becomes a loop that re-executes `promptFn` each step.

**New execution flow:**
```
1. Initialize state store (empty)
2. For each step:
   a. Clear definition registrations (variables, systems, tools)
   b. Re-execute promptFn (rebuilds definitions with current state)
   c. Compare effect dependencies, run changed effects
   d. Apply step modifications from effects
   e. Execute AI model step
   f. Update lastTool, messages
   g. Check stop condition
```

**Implementation tasks:**
1. Modify `runPrompt()` to pass `promptFn` to Prompt (not just call once)
2. Add `_promptFn` storage to Prompt
3. Implement `_rerunPromptFn()` method
4. Modify step loop to call `_rerunPromptFn()` before each step
5. Ensure definitions are idempotent (same key = update, not duplicate)

---

### Phase 7: Definition Reconciliation

Since `promptFn` runs multiple times, definitions must be reconciled:

**Rules:**
- Same key → update value (not duplicate)
- Missing key on re-run → remove definition
- New key on re-run → add definition

**Implementation tasks:**
1. Track "seen" definitions per re-run
2. After re-run, prune unseen definitions
3. Ensure stable ordering for deterministic prompts

---

## API Surface Changes

### New Exports
```typescript
// From 'lmthing'
export { defState, defEffect } from './Prompt';
export type { PromptContext, StepModifier, DefinitionProxy } from './types';
```

### Modified Signatures
```typescript
// runPrompt now supports re-running promptFn
runPrompt(promptFn, config: {
  model: string;
  stateful?: boolean;  // Enable new behavior (default: false for backward compat)
});
```

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/Prompt.ts` | Add `defState`, `defEffect`, state store, effect tracking, re-run logic |
| `src/runPrompt.ts` | Pass `promptFn` to Prompt, handle stateful mode |
| `src/types.ts` | New interfaces for PromptContext, collections, proxies |
| `src/index.ts` | Export new types and functions |
| `src/StreamText.ts` | Extend prepareStep for step modifications |

---

## Testing Strategy

1. **Unit tests for defState:**
   - State initialization
   - State updates
   - State persistence across re-runs

2. **Unit tests for defEffect:**
   - Dependency comparison
   - Effect execution timing
   - Step modifier accumulation

3. **Integration tests:**
   - Full re-run cycle with state changes
   - Effect → setState → re-run → effect chain
   - `.remind()` behavior

4. **Mock model tests:**
   - Verify correct prompts sent each step
   - Verify tool/system filtering works

---

## Migration & Backward Compatibility

- Default behavior unchanged (`stateful: false`)
- New `stateful: true` option enables re-run behavior
- Existing `def*` methods continue to work
- Warning if mixing old and new patterns

---

## Open Questions to Resolve

1. **Effect ordering:** Should effects run in definition order or registration order?
2. **Async effects:** Should `defEffect` support async callbacks?
3. **Effect cleanup:** Should effects return cleanup functions (like React)?
4. **Batching:** How to batch multiple `setState` calls within one effect?
5. **Error handling:** What happens if promptFn throws on re-run?
6. **Performance:** Cache unchanged definitions to avoid rebuilding?

---

## Example Usage

```javascript
export function SessionTest({
  someParam,
  aFunc
}) {
  const compactMessages = (messages) => messages.map(m => `${m.role}: ${m.content}`).join('\n');
  return ({$, def, defSystem, defTool, defEffect, defState})=>{
    const var1 = def('var1', 'value1');
    const [state,setState] = defState('data', {});
    const var2 = def('var2', `value2 + ${state.data.extra}`);
    const tool1 = defTool('tool1', async ({ input }) => {
      return `tool1 received: ${aFunc(input)}`;
    });

    const tool2 = defTool('tool2', async ({ input }) => {
      return `tool2 received: ${aFunc(input)} ${someParam}`;
    });
    const system1 = defSystem('system1', 'This is system prompt 1.');
    const system2 = defSystem('system2', 'This is system prompt 2.');

    defEffect((prompt, step)=>{
      if(state.data.count === undefined) {
        setState({ extra: ' from effect' });
        setState({ count: 1 });
      }
      if(prompt.messages.length === 2) {
        step("messages", [compactMessages(prompt.messages)]);
      }
      if(prompt.messages.length === 1 && prompt.tools.has('tool1')) {
        step("tools", prompt.tools.filter(t=>t.name==='tool1'));
      }
      if(prompt.messages.length === 3 && prompt.systems.has('system1')) {
        step("systems", prompt.systems.filter(s=>s.name==='system1'));
      }

    }, [state.data.count])
    defEffect((prompt)=>{
      if (prompt.lastTool?.toolName === 'tool2' && prompt.lastTool?.output.includes('Error')) {
        system1.remind();
        tool2.remind();
      }
    })
    $`Some instruction.
    Dont forget to use ${tool1} with ${var1} and ${var2}.
    `
  }
}
```
