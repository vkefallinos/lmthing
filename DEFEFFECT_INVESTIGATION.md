# defEffect Investigation Findings

## Executive Summary

Investigation of `defEffect` dependency tracking and step modifications revealed and **fixed a design issue** where effects with dependencies were running on every step instead of only when dependencies changed.

## Root Cause (FIXED)

The `EffectsManager.reset()` method was clearing:
1. The effects list (`this.effects`)
2. The previous dependencies map (`this.previousDeps`)
3. The ID counter (`this.idCounter`)

In `StatefulPrompt.setLastPrepareStep()`, on each step after the first:
1. `this._effectsManager.reset()` was called (line 1002)
2. Prompt function was re-executed, re-registering all effects with new auto-incrementing IDs
3. Effects were processed

Since `previousDeps` was cleared AND effects got new IDs after reset, **every effect appeared to be running for the first time**, causing effects with dependencies to always execute regardless of whether dependencies changed.

## Solution Implemented

### 1. Changed ID Assignment Strategy

Instead of using auto-incrementing IDs that persist across re-registrations, effects now use their **registration order** as their ID. This order resets after each `process()` call, ensuring effects re-registered in the same order get the same IDs.

**Before:**
```typescript
register(callback, dependencies) {
  const effect = { id: this.idCounter++, callback, dependencies };
  this.effects.push(effect);
}
```

**After:**
```typescript
register(callback, dependencies) {
  const effect = { id: this.registrationOrder++, callback, dependencies };
  this.effects.push(effect);
}

process(context, stepModifier) {
  // ... process effects ...
  this.registrationOrder = 0; // Reset for next cycle
}
```

### 2. Added `clearEffects()` Method

Added a new method that clears the effects list while preserving dependency memory:

```typescript
clearEffects(): void {
  this.effects = [];
  // Registration order resets on next process() call
  // Keep previousDeps to maintain dependency memory
}
```

### 3. Updated StatefulPrompt

Changed StatefulPrompt to use `clearEffects()` instead of `reset()`:

```typescript
// Before:
this._effectsManager.reset(); // Cleared dependency memory

// After:
this._effectsManager.clearEffects(); // Preserves dependency memory
```

## Expected vs Actual Behavior (NOW FIXED ✅)

| Scenario | Expected | Before Fix | After Fix |
|----------|----------|------------|-----------|
| No dependencies | Run on every step | ✅ Runs every step | ✅ Runs every step |
| Empty dependencies `[]` | Run only on first step | ❌ Runs every step | ✅ Runs only once |
| With dependencies `[dep]` | Run when `dep` changes | ❌ Runs every step | ✅ Runs when changes |

## Effect Execution Flow

### Correct Ordering (Verified)

1. **Re-execution** (if not first step)
   - Clear definition tracking
   - **Clear effects list (preserving dependency memory)** ← Fixed
   - Re-execute prompt function (re-register effects with current state values)
   - Reconcile definitions

2. **Process Effects**
   - Create prompt context
   - Process each effect (check dependencies using registration order as ID)
   - Effects can call `.disable()` on definitions
   - Effects can call `stepModifier()` to modify step

3. **Apply Modifications**
   - Apply disabled definitions (filter active tools/systems/variables)
   - Apply step modifications (messages, tools, systems, variables)
   - Clear disabled definitions set

4. **Final Prepare Step**
   - Build system prompt with variables
   - Add reminder messages if any
   - Merge with base result

### Step Modifier Application

The `stepModifier` function accumulates modifications in `_stepModifications`:
- `messages`: Appended to messages array
- `tools`: Sets activeTools filter
- `systems`: Sets activeSystems filter  
- `variables`: Merged with existing variables

These are applied **after** all effects run but **before** the final prepare step.

## Dependency Comparison Semantics

### Proxy Resolution

State proxies implement `valueOf()` to return the underlying value. The `resolveValue()` method:
1. Checks if value has `valueOf()` method
2. Calls `valueOf()` and compares to original
3. If different, uses the resolved value
4. Otherwise uses original value

This allows defState proxies to be used in dependency arrays while comparing the actual state values.

### Equality Check

Dependencies are compared using **strict equality** (`===`) after proxy resolution:

```typescript
private depsEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
```

This means:
- ✅ Primitive values are compared by value
- ✅ Objects/arrays are compared by reference
- ⚠️ New object/array instances will trigger re-run even if content is the same

## Test Coverage

### EffectsManager Unit Tests

Added comprehensive tests for the new `clearEffects()` functionality:
- ✅ Clears effects list but preserves dependency memory
- ✅ Runs effect after clearEffects when dependency changes
- ✅ Resets registration order correctly

### defEffect Integration Tests  

Added 16 comprehensive tests covering:

1. **Effects without dependencies** (2 tests)
   - ✅ Runs on every step
   - ✅ Runs on first step with empty array

2. **Effects with dependencies** (5 tests)
   - ✅ Runs when dependency changes
   - ✅ Does not run when dependency stays same
   - ✅ Handles multiple dependencies
   - ✅ Handles primitive changes
   - ✅ Handles complex dependency patterns

3. **Step modifier functionality** (3 tests)
   - ✅ Adds messages
   - ✅ Modifies systems
   - ✅ Modifies variables

4. **Interaction with definitions** (3 tests)
   - ✅ Disables definitions
   - ✅ Reminds about definitions
   - ✅ Disables tools

5. **Effect execution order** (2 tests)
   - ✅ Executes in registration order
   - ✅ Later effects see modifications from earlier effects

6. **Complex scenarios** (1 test)
   - ✅ Multiple effects with different dependency patterns

### Snapshot Tests

Updated snapshot test in `src/integration.test.ts` to reflect correct behavior where effects with empty dependencies only run once instead of on every step.

## Files Modified

- `src/effects/EffectsManager.ts` - Added `clearEffects()`, changed to registration-order IDs
- `src/effects/EffectsManager.test.ts` - Added tests for `clearEffects()`
- `src/StatefulPrompt.ts` - Use `clearEffects()` instead of `reset()`
- `src/defEffect.test.ts` - Added comprehensive test suite (16 tests total)
- `src/__snapshots__/integration.test.ts.snap` - Updated snapshot
- `DEFEFFECT_INVESTIGATION.md` - This document

## Memory for Future Reference

Key facts to remember about defEffect:
1. Effects with empty dependencies `[]` run only on first step
2. Effects with dependencies run when ANY dependency changes (strict equality)
3. Registration order determines effect identity across re-executions
4. Effects are re-registered on each step to capture current closure values
5. Step modifications accumulate and apply after all effects run

