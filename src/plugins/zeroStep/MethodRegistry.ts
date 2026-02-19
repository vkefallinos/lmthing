import type { MethodDefinition } from './types';

/**
 * Registry for storing and managing method definitions used in <run_code> blocks.
 */
export class MethodRegistry {
  private methods: Map<string, MethodDefinition> = new Map();

  /**
   * Register a method definition.
   */
  register(definition: MethodDefinition): void {
    this.methods.set(definition.name, definition);
  }

  /**
   * Get a method definition by name.
   */
  get(name: string): MethodDefinition | undefined {
    return this.methods.get(name);
  }

  /**
   * Get all registered method definitions.
   */
  getAll(): Map<string, MethodDefinition> {
    return this.methods;
  }

  /**
   * Check if a method is registered.
   */
  has(name: string): boolean {
    return this.methods.has(name);
  }

  /**
   * Get all method names.
   */
  getAllNames(): string[] {
    return [...this.methods.keys()];
  }
}
