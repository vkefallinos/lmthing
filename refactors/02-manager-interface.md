# Refactor 02: Add Shared Manager Interface

## Problem

The three manager classes have inconsistent naming for similar functionality:

| Class | Reset Method | Purpose |
|-------|--------------|---------|
| `StateManager` | `clear()` | Clear all stored state |
| `EffectsManager` | `clear()` | Clear all effects and reset counters |
| `DefinitionTracker` | `reset()` | Clear all tracked definitions |

This inconsistency makes the codebase harder to reason about. All three methods do the same conceptual thing: reset the manager to its initial state.

## Current Code

```typescript
// src/state/StateManager.ts
export class StateManager {
  clear(): void {
    this.store.clear();
  }
}

// src/effects/EffectsManager.ts
export class EffectsManager {
  clear(): void {
    this.effects = [];
    this.previousDeps.clear();
    this.idCounter = 0;
  }
}

// src/definitions/DefinitionTracker.ts
export class DefinitionTracker {
  reset(): void {
    this.seen.clear();
  }
}
```

## Proposed Solution

### Step 1: Create a shared interface in `src/types.ts`

Add at the top of `src/types.ts` (with the other interfaces):

```typescript
/**
 * Interface for managers that can be reset to their initial state.
 * Used by StateManager, EffectsManager, and DefinitionTracker.
 */
export interface Resettable {
  /**
   * Reset the manager to its initial state.
   * Clears all stored data and resets any internal counters.
   */
  reset(): void;
}
```

### Step 2: Update StateManager

In `src/state/StateManager.ts`:

```typescript
import { Resettable } from '../types';

export class StateManager implements Resettable {
  private store = new Map<string, any>();

  // ... existing methods ...

  /**
   * Reset the state manager, clearing all stored state.
   */
  reset(): void {
    this.store.clear();
  }

  /**
   * @deprecated Use reset() instead. Will be removed in next major version.
   */
  clear(): void {
    this.reset();
  }
}
```

### Step 3: Update EffectsManager

In `src/effects/EffectsManager.ts`:

```typescript
import { Effect, PromptContext, StepModifier, Resettable } from '../types';

export class EffectsManager implements Resettable {
  private effects: Effect[] = [];
  private previousDeps = new Map<number, any[]>();
  private idCounter = 0;

  // ... existing methods ...

  /**
   * Reset the effects manager, clearing all effects and counters.
   */
  reset(): void {
    this.effects = [];
    this.previousDeps.clear();
    this.idCounter = 0;
  }

  /**
   * @deprecated Use reset() instead. Will be removed in next major version.
   */
  clear(): void {
    this.reset();
  }
}
```

### Step 4: Update DefinitionTracker (already uses `reset()`)

In `src/definitions/DefinitionTracker.ts`:

```typescript
import { Resettable } from '../types';

export class DefinitionTracker implements Resettable {
  // ... existing code - already uses reset() ...
}
```

### Step 5: Update any callers

Search for usages of `.clear()` on these managers and update them:

```bash
# Find all usages
grep -r "\.clear()" src/ --include="*.ts"
```

Update callers to use `.reset()` instead.

### Step 6: Export the interface

In `src/state/index.ts`:
```typescript
export { StateManager } from './StateManager';
```

In `src/effects/index.ts`:
```typescript
export { EffectsManager } from './EffectsManager';
```

In `src/definitions/index.ts`:
```typescript
export { DefinitionTracker, type DefinitionType } from './DefinitionTracker';
```

The `Resettable` interface is already exported from `src/types.ts` via `src/index.ts`.

## Files to Modify

1. **Modify:** `src/types.ts` - Add `Resettable` interface
2. **Modify:** `src/state/StateManager.ts` - Implement interface, rename `clear()` to `reset()`
3. **Modify:** `src/effects/EffectsManager.ts` - Implement interface, rename `clear()` to `reset()`
4. **Modify:** `src/definitions/DefinitionTracker.ts` - Add `implements Resettable`
5. **Modify:** Any files that call `.clear()` on these managers

## Expected Outcome

- Consistent API across all three managers
- Better TypeScript support with shared interface
- Ability to treat managers polymorphically if needed
- Deprecation warnings guide users to new method name

## Testing

1. Run existing tests: `npm test`
2. Verify deprecation warnings appear in development when using `clear()`
3. Ensure all manager reset functionality works correctly
4. Check that `reset()` properly clears all internal state

## Notes

- Keep `clear()` as a deprecated alias for backward compatibility
- Add `@deprecated` JSDoc tag to generate IDE warnings
- The deprecation can be removed in the next major version
