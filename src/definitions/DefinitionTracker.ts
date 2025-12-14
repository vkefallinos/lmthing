import { Resettable } from '../types';

/**
 * Definition types that can be tracked
 */
export type DefinitionType = 'def' | 'defData' | 'defSystem' | 'defTool' | 'defAgent';

/**
 * DefinitionTracker tracks which definitions are seen during prompt re-execution.
 * This enables reconciliation - removing definitions that are no longer defined
 * after a re-execution of the prompt function.
 */
export class DefinitionTracker implements Resettable {
  private seen = new Set<string>();

  /**
   * Create a unique key for a definition
   */
  private makeKey(type: DefinitionType, name: string): string {
    return `${type}:${name}`;
  }

  /**
   * Mark a definition as seen during the current execution
   */
  mark(type: DefinitionType, name: string): void {
    this.seen.add(this.makeKey(type, name));
  }

  /**
   * Check if a definition was seen during the current execution
   */
  isSeen(type: DefinitionType, name: string): boolean {
    return this.seen.has(this.makeKey(type, name));
  }

  /**
   * Reset the tracker for a new execution cycle
   */
  reset(): void {
    this.seen.clear();
  }

  /**
   * Reconcile definitions by removing those not seen in the latest execution.
   * Mutates the provided objects in place.
   *
   * @param variables - Record of variable definitions
   * @param systems - Record of system definitions
   * @param tools - Record of tool definitions
   */
  reconcile(
    variables: Record<string, any>,
    systems: Record<string, string>,
    tools: Record<string, any>
  ): void {
    // Remove unseen variables (can be 'def' or 'defData')
    for (const name of Object.keys(variables)) {
      if (!this.isSeen('def', name) && !this.isSeen('defData', name)) {
        delete variables[name];
      }
    }

    // Remove unseen systems
    for (const name of Object.keys(systems)) {
      if (!this.isSeen('defSystem', name)) {
        delete systems[name];
      }
    }

    // Remove unseen tools (can be 'defTool' or 'defAgent')
    for (const name of Object.keys(tools)) {
      if (!this.isSeen('defTool', name) && !this.isSeen('defAgent', name)) {
        delete tools[name];
      }
    }
  }

  /**
   * Get all seen definitions (for debugging/testing)
   */
  getSeenDefinitions(): string[] {
    return Array.from(this.seen);
  }
}
