# defEffect Investigation - Summary

## Issue Resolved

✅ Fixed critical bug where `defEffect` with dependencies was running on every step instead of only when dependencies changed.

## Root Cause

The `EffectsManager.reset()` method was clearing dependency memory between steps, causing all effects to appear as "first run" on every step.

## Solution

1. **Registration-order IDs**: Changed from auto-incrementing IDs to registration order (resets after each process)
2. **New clearEffects() method**: Clears effect list while preserving dependency memory
3. **Updated StatefulPrompt**: Uses `clearEffects()` instead of `reset()` during re-execution

## Test Coverage

Added **16 comprehensive tests** covering:
- Effects without dependencies (run every step) ✅
- Effects with empty dependencies (run once only) ✅  
- Effects with dependencies (run on change) ✅
- Step modifiers (messages/tools/systems/variables) ✅
- Definition interactions (disable/remind) ✅
- Effect execution order ✅

## Behavior (Now Correct)

| Scenario | Behavior |
|----------|----------|
| `defEffect(fn)` | Runs on every step |
| `defEffect(fn, [])` | Runs only on first step |
| `defEffect(fn, [dep])` | Runs when `dep` changes (strict ===) |

## Files Modified

- `src/effects/EffectsManager.ts` - Core fix
- `src/StatefulPrompt.ts` - Integration fix
- `src/defEffect.test.ts` - 16 new tests
- `src/effects/EffectsManager.test.ts` - 3 new tests
- `DEFEFFECT_INVESTIGATION.md` - Full investigation

## All Tests Passing

✅ 457 tests passing across 26 test files

See `DEFEFFECT_INVESTIGATION.md` for complete details.
