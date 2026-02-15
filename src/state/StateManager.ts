import { Resettable } from '../types';

/**
 * StateManager handles state persistence across prompt re-executions.
 * Similar to React's useState hook pattern.
 */
export class StateManager implements Resettable {
  private store = new Map<string, any>();

  /**
   * Get the current value of a state key
   */
  get<T>(key: string): T | undefined {
    return this.store.get(key);
  }

  /**
   * Set a state value
   */
  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  /**
   * Check if a state key exists
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Create a state accessor tuple [value, setter].
   * Returns the actual value (not a proxy) so that strict equality (===) works.
   * Like React's useState, the value is a snapshot - updates are seen on re-execution.
   */
  createStateAccessor<T>(key: string, initialValue: T): [T, (newValue: T | ((prev: T) => T)) => void] {
    // Initialize state if not exists
    if (!this.has(key)) {
      this.set(key, initialValue);
    }

    // Get the current value (snapshot at time of creation)
    const currentValue = this.get<T>(key) as T;

    // Create setter function
    const setter = (newValue: T | ((prev: T) => T)) => {
      const prevValue = this.get<T>(key);
      const valueToSet = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(prevValue as T)
        : newValue;
      this.set(key, valueToSet);
    };

    // Return the actual value, not a proxy - this allows === to work
    return [currentValue, setter];
  }

  /**
   * Get all state keys currently stored.
   */
  keys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Get a snapshot of all current state as a plain object.
   */
  snapshot(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of this.store.entries()) {
      result[key] = value;
    }
    return result;
  }

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
