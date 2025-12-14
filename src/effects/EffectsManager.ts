import { Effect, PromptContext, StepModifier, Resettable } from '../types';

/**
 * EffectsManager handles effect registration and execution.
 * Similar to React's useEffect hook pattern.
 */
export class EffectsManager implements Resettable {
  private effects: Effect[] = [];
  private previousDeps = new Map<number, any[]>();
  private idCounter = 0;

  /**
   * Register an effect to run based on dependency changes.
   *
   * @param callback - Function to execute when effect runs
   * @param dependencies - Optional array of dependencies. If not provided, effect runs every step.
   */
  register(
    callback: (context: PromptContext, stepModifier: StepModifier) => void,
    dependencies?: any[]
  ): void {
    const effect: Effect = {
      id: this.idCounter++,
      callback,
      dependencies
    };
    this.effects.push(effect);
  }

  /**
   * Process all effects, running those that should execute based on dependencies.
   *
   * @param context - The current prompt context
   * @param stepModifier - Function to modify the current step
   */
  process(context: PromptContext, stepModifier: StepModifier): void {
    for (const effect of this.effects) {
      if (this.shouldRun(effect)) {
        // Update stored dependencies before running - resolve proxy values
        if (effect.dependencies) {
          this.previousDeps.set(effect.id, effect.dependencies.map(d => this.resolveValue(d)));
        }

        // Run the effect
        effect.callback(context, stepModifier);
      }
    }
  }

  /**
   * Determine if an effect should run based on its dependencies.
   */
  private shouldRun(effect: Effect): boolean {
    // First run always executes
    if (!this.previousDeps.has(effect.id)) {
      return true;
    }

    // If no dependencies specified, run every time
    if (!effect.dependencies) {
      return true;
    }

    // Compare dependencies
    const prevDeps = this.previousDeps.get(effect.id);
    if (!prevDeps) {
      return true;
    }

    // Resolve current dependency values for comparison
    const currentDeps = effect.dependencies.map(d => this.resolveValue(d));
    return !this.depsEqual(prevDeps, currentDeps);
  }

  /**
   * Resolve a value that may be a state proxy to its actual value.
   * State proxies implement valueOf() to return the underlying value.
   */
  private resolveValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    // Check if it's an object with valueOf that returns something different
    if (typeof value === 'object' && typeof value.valueOf === 'function') {
      const resolved = value.valueOf();
      // Only use valueOf result if it's different from the object itself
      // (primitives return themselves from valueOf)
      if (resolved !== value) {
        return resolved;
      }
    }
    return value;
  }

  /**
   * Compare two dependency arrays for equality.
   */
  private depsEqual(a: any[], b: any[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get all registered effects.
   */
  getEffects(): Effect[] {
    return [...this.effects];
  }

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
