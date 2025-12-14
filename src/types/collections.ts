/**
 * Collection utility interfaces for tools, systems, and variables.
 */

/**
 * Collection utility for tools
 *
 * @category Types
 */
export interface ToolCollection {
  has(name: string): boolean;
  filter(predicate: (tool: any) => boolean): any[];
  [Symbol.iterator](): Iterator<any>;
  map<U>(callback: (tool: any) => U): U[];
}

/**
 * Collection utility for systems
 *
 * @category Types
 */
export interface SystemCollection {
  has(name: string): boolean;
  filter(predicate: (system: { name: string; value: string }) => boolean): { name: string; value: string }[];
  [Symbol.iterator](): Iterator<{ name: string; value: string }>;
  map<U>(callback: (system: { name: string; value: string }) => U): U[];
}

/**
 * Collection utility for variables
 *
 * @category Types
 */
export interface VariableCollection {
  has(name: string): boolean;
  filter(predicate: (variable: { name: string; type: string; value: any }) => boolean): { name: string; type: string; value: any }[];
  [Symbol.iterator](): Iterator<{ name: string; type: string; value: any }>;
  map<U>(callback: (variable: { name: string; type: string; value: any }) => U): U[];
}
