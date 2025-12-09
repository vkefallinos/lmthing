import { ToolCollection, SystemCollection, VariableCollection } from '../types';

/**
 * Create a ToolCollection from a tools record.
 * Provides utility methods for querying tools.
 */
export function createToolCollection(tools: Record<string, any>): ToolCollection {
  const entries = Object.entries(tools).map(([name, tool]) => ({ name, ...tool }));

  return {
    has(name: string): boolean {
      return entries.some(t => t.name === name);
    },
    filter(predicate: (tool: any) => boolean): any[] {
      return entries.filter(predicate);
    },
    [Symbol.iterator]() {
      return entries[Symbol.iterator]();
    }
  };
}

/**
 * Create a SystemCollection from a systems record.
 * Provides utility methods for querying system parts.
 */
export function createSystemCollection(systems: Record<string, string>): SystemCollection {
  const entries = Object.entries(systems).map(([name, value]) => ({ name, value }));

  return {
    has(name: string): boolean {
      return entries.some(s => s.name === name);
    },
    filter(predicate: (system: { name: string; value: string }) => boolean): { name: string; value: string }[] {
      return entries.filter(predicate);
    },
    [Symbol.iterator]() {
      return entries[Symbol.iterator]();
    }
  };
}

/**
 * Create a VariableCollection from a variables record.
 * Provides utility methods for querying variables.
 */
export function createVariableCollection(
  variables: Record<string, { type: string; value: any }>
): VariableCollection {
  const entries = Object.entries(variables).map(([name, varDef]) => ({
    name,
    type: varDef.type,
    value: varDef.value
  }));

  return {
    has(name: string): boolean {
      return entries.some(v => v.name === name);
    },
    filter(
      predicate: (variable: { name: string; type: string; value: any }) => boolean
    ): { name: string; type: string; value: any }[] {
      return entries.filter(predicate);
    },
    [Symbol.iterator]() {
      return entries[Symbol.iterator]();
    }
  };
}
