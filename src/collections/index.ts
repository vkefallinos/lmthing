import { ToolCollection, SystemCollection, VariableCollection } from '../types';


const createCollection = <T>(items: Record<string, T>) => {
  const entries = Object.entries(items).map(([name, item]) => ({ name, ...item }));

  return {
    has(name: string): boolean {
      return entries.some(e => e.name === name);
    },
    filter(predicate: (item: T & { name: string }) => boolean): (T & { name: string })[] {
      return entries.filter(predicate);
    },
    map<U>(callback: (item: T & { name: string }) => U): U[] {
      return entries.map(callback);
    },
    [Symbol.iterator]() {
      return entries[Symbol.iterator]();
    }
  };
};

/**
 * Create a ToolCollection from a tools record.
 * Provides utility methods for querying tools.
 */
export function createToolCollection(tools: Record<string, any>): ToolCollection {
  return createCollection(tools);
}

/**
 * Create a SystemCollection from a systems record.
 * Provides utility methods for querying system parts.
 */
export function createSystemCollection(systems: Record<string, string>): SystemCollection {
  return createCollection(systems);
}

/**
 * Create a VariableCollection from a variables record.
 * Provides utility methods for querying variables.
 */
export function createVariableCollection(
  variables: Record<string, { type: string; value: any }>
): VariableCollection {
  return createCollection(variables);
}
