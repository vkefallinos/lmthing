# Integration Test Issues

This document captures issues found in integration test snapshots and test code.

## Critical Issues

### 1. State Value Access Bug in `defHooks.test.ts`

**Location**: `tests/integration/defHooks.test.ts:33` and `tests/integration/defHooks.test.ts:99`

**Problem**: Tools are using `.value` property on state values, but `defState` returns the actual value (not a proxy).

```typescript
// Line 32-34 - WRONG
async () => {
  setCount((prev: number) => prev + 1);
  return { newCount: count.value + 1 };  // BUG: count is number, not a proxy
}

// Should be:
return { newCount: count + 1 };
```

**Evidence in snapshot** (`defHooks.test.ts.snap`):
- Line 87: `"step": NaN,` - instead of a number
- Line 163: `"step": NaN,`
- Line 201: `"step": NaN,`
- Lines 443-444, 453-454: `"newCount": NaN,`

**Impact**: All state-related tool results are `NaN` instead of the expected numeric values.

**Fix**:
- Line 33: `count.value + 1` → `count + 1`
- Line 99: `stepCount.value + 1` → `stepCount.value` (actually `stepCount` directly)

---

### 2. Misleading Documentation in CLAUDE.md

**Location**: `CLAUDE.md:416-417`

**Problem**: Documentation says "proxy works in templates" for `defState` values, but `defState` returns actual values, not proxies.

```typescript
// CLAUDE.md says:
// Access current value (proxy works in templates)
prompt.$`Current count: ${count}`;
```

This is misleading because `count` is just a number/string/etc., not a proxy with `.value`, `.remind()`, or `.disable()` methods.

**Impact**: Confusion between `def`/`defData`/`defSystem` (which return proxies) and `defState` (which returns raw values).

---

## Medium Issues

### 3. Missing Snapshots

**Files without snapshots**:
1. `tests/integration/defFunction.test.ts` - No snapshot file exists
2. `tests/integration/defTaskGraph.test.ts` - No snapshot file exists

**Impact**: Cannot verify behavior of these plugins against real LLMs.

---

### 4. Inconsistent `undefined` Values in Reasoning Content

**Location**: All snapshot files

**Problem**: Reasoning content blocks contain `output: undefined, toolCallId: undefined, toolName: undefined`.

Example from `defHooks.test.ts.snap:60-64`:
```typescript
{
  "output": undefined,
  "toolCallId": undefined,
  "toolName": undefined,
  "type": "reasoning",
}
```

**Impact**: Creates visual noise in snapshots; may indicate incomplete handling of reasoning chunks from models with extended thinking.

**Note**: This may be expected behavior for models that support "reasoning" or "extended thinking" features (like o1, Claude with extended thinking, etc.).

---

## Low Priority / Observational Issues

### 5. LLM Confusion About State Values

**Location**: `defHooks.test.ts.snap:470-472`

**Problem**: LLM response shows confusion about returned state values:
```
"Both steps returned null, so I'm currently on step null"
"the function doesn't return the actual count value"
```

**Root Cause**: Because tools return `NaN` instead of numbers, LLM cannot properly track state.

**Resolution**: Will be fixed when issue #1 is addressed.

---

### 6. Model-Specific Snapshots

**Observation**: All snapshots use `zai:glm-4.6` model.

**Consideration**: Snapshots may differ across models (OpenAI, Anthropic, Google, etc.). Consider:
- Model-agnostic snapshot testing
- Multiple snapshot sets per provider
- Configurable snapshot matching

---

## Recommended Actions

1. **Fix test code**: Remove `.value` from state accesses in `defHooks.test.ts`
2. **Clarify documentation**: Update CLAUDE.md to clearly distinguish between proxy-returning (`def`, `defData`, `defSystem`) and value-returning (`defState`) methods
3. **Add missing snapshots**: Generate snapshots for `defFunction.test.ts` and `defTaskGraph.test.ts`
4. **Verify all integration tests**: Re-run after fixes to ensure snapshots update correctly
5. **Consider reasoning handling**: Decide if `undefined` values in reasoning chunks need explicit handling or documentation
