/**
 * Collection utility interfaces for tools, systems, and variables.
 */

/**
 * A named system prompt section
 *
 * @category Types
 */
export interface SystemEntry {
  name: string;
  value: string;
}

/**
 * Variable type distinguishes between text (def) and data (defData) definitions
 *
 * @category Types
 */
export type VariableType = 'text' | 'data';

/**
 * A variable definition with type information
 *
 * @category Types
 */
export interface VariableEntry {
  name: string;
  type: VariableType | (string & {});  // Allows 'text'|'data' with autocomplete, but accepts any string
  value: unknown;
}

/**
 * A tool entry with name and tool definition
 * Tool definition follows AI SDK's tool structure
 *
 * @category Types
 */
export interface ToolEntry {
  name: string;
  [key: string]: unknown;  // Tool properties vary based on definition
}

/**
 * Collection utility for tools
 *
 * @category Types
 */
export interface ToolCollection {
  has(name: string): boolean;
  filter(predicate: (entry: ToolEntry) => boolean): ToolEntry[];
  [Symbol.iterator](): Iterator<ToolEntry>;
  map<U>(callback: (entry: ToolEntry) => U): U[];
}

/**
 * Collection utility for systems
 *
 * @category Types
 */
export interface SystemCollection {
  has(name: string): boolean;
  filter(predicate: (system: SystemEntry) => boolean): SystemEntry[];
  [Symbol.iterator](): Iterator<SystemEntry>;
  map<U>(callback: (system: SystemEntry) => U): U[];
}

/**
 * Collection utility for variables
 *
 * @category Types
 */
export interface VariableCollection {
  has(name: string): boolean;
  filter(predicate: (variable: VariableEntry) => boolean): VariableEntry[];
  [Symbol.iterator](): Iterator<VariableEntry>;
  map<U>(callback: (variable: VariableEntry) => U): U[];
}
