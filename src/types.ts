/**
 * Interface for the proxy objects returned by def, defSystem, defTool, defAgent
 */
export interface DefinitionProxy {
  name: string;
  value: any;
  toString(): string;
  remind(): void;
}

/**
 * Interface for the prompt context passed to effects
 */
export interface PromptContext {
  messages: any[];
  tools: ToolCollection;
  systems: SystemCollection;
  variables: VariableCollection;
  lastTool: LastToolInfo | null;
  stepNumber: number;
}

/**
 * Collection utility for tools
 */
export interface ToolCollection {
  has(name: string): boolean;
  filter(predicate: (tool: any) => boolean): any[];
  [Symbol.iterator](): Iterator<any>;
  map<U>(callback: (tool: any) => U): U[];
}

/**
 * Collection utility for systems
 */
export interface SystemCollection {
  has(name: string): boolean;
  filter(predicate: (system: { name: string; value: string }) => boolean): { name: string; value: string }[];
  [Symbol.iterator](): Iterator<{ name: string; value: string }>;
  map<U>(callback: (system: { name: string; value: string }) => U): U[];
}

/**
 * Collection utility for variables
 */
export interface VariableCollection {
  has(name: string): boolean;
  filter(predicate: (variable: { name: string; type: string; value: any }) => boolean): { name: string; type: string; value: any }[];
  [Symbol.iterator](): Iterator<{ name: string; type: string; value: any }>;
  map<U>(callback: (variable: { name: string; type: string; value: any }) => U): U[];
}

/**
 * Information about the last tool call
 */
export interface LastToolInfo {
  toolName: string;
  args: any;
  output: any;
}

/**
 * Step modifier function type
 */
export type StepModifier = (
  aspect: 'messages' | 'tools' | 'systems' | 'variables',
  items: any[]
) => void;

/**
 * Effect definition for StatefulPrompt
 */
export interface Effect {
  id: number;
  callback: (prompt: PromptContext, step: StepModifier) => void;
  dependencies?: any[];
}

/**
 * Step modifications accumulator for StatefulPrompt
 */
export interface StepModifications {
  messages?: any[];
  tools?: any[];
  systems?: { name: string; value: string }[];
  variables?: { name: string; type: string; value: any }[];
}