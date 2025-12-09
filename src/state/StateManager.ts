/**
 * StateManager handles state persistence across prompt re-executions.
 * Similar to React's useState hook pattern.
 */
export class StateManager {
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
   * Create a state accessor tuple [value, setter] with proxy support for template literals.
   * The proxy ensures the state value works correctly in template strings.
   */
  createStateAccessor<T>(key: string, initialValue: T): [T, (newValue: T | ((prev: T) => T)) => void] {
    // Initialize state if not exists
    if (!this.has(key)) {
      this.set(key, initialValue);
    }

    // Create a getter function that returns the current value
    const stateGetter = () => this.get<T>(key) as T;

    // Create setter function
    const setter = (newValue: T | ((prev: T) => T)) => {
      const currentValue = this.get<T>(key);
      const valueToSet = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(currentValue as T)
        : newValue;
      this.set(key, valueToSet);
    };

    // Create a proxy wrapper that works in template literals
    const stateWrapper = createStateProxy<T>(stateGetter);

    return [stateWrapper, setter];
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Creates a proxy that wraps a state getter function.
 * The proxy ensures proper coercion to string in template literals
 * and allows property access on object state values.
 */
export function createStateProxy<T>(stateGetter: () => T): T {
  const handler: ProxyHandler<() => T> = {
    get(target, prop) {
      if (prop === 'valueOf' || prop === 'toString' || prop === Symbol.toPrimitive) {
        return () => target();
      }
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        return undefined;
      }
      // For property access, try to get from the state value
      const value = target();
      if (value && typeof value === 'object' && prop in value) {
        return (value as any)[prop];
      }
      return value;
    },
    has(_target, prop) {
      const value = _target();
      return value && typeof value === 'object' && prop in value;
    },
    ownKeys(_target) {
      const value = _target();
      return (value && typeof value === 'object' ? Object.keys(value) : []) as string[];
    },
    apply(_target, _thisArg, _argArray) {
      return _target();
    }
  };

  return new Proxy(stateGetter, handler) as unknown as T;
}
