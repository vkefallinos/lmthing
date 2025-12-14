# Refactor 04: Organize Types into Subdirectory

## Problem

Types are scattered across multiple files with no clear organization:

| File | Lines | Contents |
|------|-------|----------|
| `src/types.ts` | 213 | Core types + plugin types + collection types |
| `src/plugins/types.ts` | 40 | Task, TaskStatus types |
| `src/plugins/function/types.ts` | 76 | Function callback types |

The main `types.ts` file mixes different concerns:
- Core types (PromptContext, DefinitionProxy)
- Collection interfaces (ToolCollection, SystemCollection, VariableCollection)
- Tool/Agent options (ToolOptions, AgentOptions)
- Effect types (Effect, StepModifier)
- Plugin system types (Plugin, PluginMethod, MergePlugins)

## Proposed Solution

Create a `src/types/` directory with focused modules, then re-export everything from an index file for backward compatibility.

### New Directory Structure

```
src/types/
├── index.ts           # Re-exports all types (backward compatible)
├── core.ts            # PromptContext, DefinitionProxy, LastToolInfo
├── collections.ts     # ToolCollection, SystemCollection, VariableCollection
├── tools.ts           # ToolOptions, ToolEventCallback, ToolCallbackResult
├── agents.ts          # AgentOptions
├── effects.ts         # Effect, StepModifier, StepModifications
└── plugins.ts         # Plugin, PluginMethod, MergePlugins, PromptWithPlugins
```

### Step 1: Create `src/types/core.ts`

```typescript
/**
 * Core type definitions for lmthing prompts.
 */

import type { ToolCollection, SystemCollection, VariableCollection } from './collections';

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
 * Information about the last tool call
 */
export interface LastToolInfo {
  toolName: string;
  args: any;
  output: any;
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
```

### Step 2: Create `src/types/collections.ts`

```typescript
/**
 * Collection utility interfaces for tools, systems, and variables.
 */

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
```

### Step 3: Create `src/types/tools.ts`

```typescript
/**
 * Tool-related type definitions.
 */

/**
 * Result returned by tool callbacks (beforeCall, onSuccess, onError)
 * - undefined: output is returned as is
 * - string: returned string is used as the tool output
 * - object: stringified or formatted according to responseSchema
 */
export type ToolCallbackResult = undefined | string | Record<string, any>;

/**
 * Tool event callback signature
 * Receives input and output, returns optional modified output
 */
export type ToolEventCallback = (input: any, output: any) => Promise<ToolCallbackResult> | ToolCallbackResult;

/**
 * Options for defTool and tool functions
 *
 * @property responseSchema - Optional Zod schema for validating/formatting tool responses
 * @property onSuccess - Callback fired when tool executes successfully
 * @property onError - Callback fired when tool throws an error
 * @property beforeCall - Callback fired before tool execution
 */
export interface ToolOptions {
  responseSchema?: any;  // Zod schema
  onSuccess?: ToolEventCallback;
  onError?: ToolEventCallback;
  beforeCall?: ToolEventCallback;
}
```

### Step 4: Create `src/types/agents.ts`

```typescript
/**
 * Agent-related type definitions.
 */

import type { Plugin } from './plugins';

/**
 * Options for defAgent and agent functions
 *
 * @property model - Override the language model for this agent
 * @property responseSchema - Optional Zod schema for validating/formatting agent responses
 * @property system - Custom system prompt for the agent
 * @property plugins - Additional plugins for the agent context
 */
export interface AgentOptions {
  model?: any;  // ModelInput from providers/resolver
  responseSchema?: any;  // Zod schema
  system?: string;
  plugins?: readonly Plugin[];
  [key: string]: any;  // Allow additional options
}
```

### Step 5: Create `src/types/effects.ts`

```typescript
/**
 * Effect system type definitions.
 */

import type { PromptContext } from './core';

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
```

### Step 6: Create `src/types/plugins.ts`

```typescript
/**
 * Plugin system type definitions.
 */

import type { StatefulPrompt } from '../StatefulPrompt';

/**
 * A plugin method that receives StatefulPrompt as `this` context.
 * Plugin methods can use all StatefulPrompt methods like defState, defTool, etc.
 */
export type PluginMethod<Args extends any[] = any[], Return = any> =
  (this: StatefulPrompt, ...args: Args) => Return;

/**
 * A plugin is an object containing named plugin methods.
 * Each method receives the StatefulPrompt instance as `this` when called.
 */
export type Plugin = Record<string, PluginMethod>;

/**
 * Utility type to remove the 'this' parameter from a function type.
 */
type OmitThisParameter<T> = T extends (this: any, ...args: infer A) => infer R
  ? (...args: A) => R
  : T;

/**
 * Utility type to transform a plugin's methods by removing their 'this' parameter.
 */
type BoundPlugin<P extends Plugin> = {
  [K in keyof P]: OmitThisParameter<P[K]>;
};

/**
 * Utility type to merge multiple plugin types into a single intersection type.
 */
export type MergePlugins<P extends readonly Plugin[]> =
  P extends readonly [infer First extends Plugin, ...infer Rest extends readonly Plugin[]]
    ? BoundPlugin<First> & MergePlugins<Rest>
    : P extends readonly Plugin[]
      ? P[number] extends Plugin
        ? { [K in keyof P[number]]: P[number][K] extends PluginMethod ? OmitThisParameter<P[number][K]> : never }
        : {}
      : {};

/**
 * Extended StatefulPrompt type with plugin methods merged in.
 */
export type PromptWithPlugins<P extends readonly Plugin[]> = StatefulPrompt & MergePlugins<P>;
```

### Step 7: Create `src/types/index.ts`

```typescript
/**
 * Central type exports for lmthing.
 *
 * This file re-exports all types for backward compatibility.
 * Types are organized into focused modules:
 * - core.ts: PromptContext, DefinitionProxy, LastToolInfo
 * - collections.ts: ToolCollection, SystemCollection, VariableCollection
 * - tools.ts: ToolOptions, ToolEventCallback
 * - agents.ts: AgentOptions
 * - effects.ts: Effect, StepModifier, StepModifications
 * - plugins.ts: Plugin, PluginMethod, MergePlugins
 */

// Core types
export type { DefinitionProxy, LastToolInfo, PromptContext } from './core';

// Collection types
export type { ToolCollection, SystemCollection, VariableCollection } from './collections';

// Tool types
export type { ToolCallbackResult, ToolEventCallback, ToolOptions } from './tools';

// Agent types
export type { AgentOptions } from './agents';

// Effect types
export type { StepModifier, Effect, StepModifications } from './effects';

// Plugin types
export type { PluginMethod, Plugin, MergePlugins, PromptWithPlugins } from './plugins';
```

### Step 8: Update `src/index.ts`

Change the types import to use the new directory:

```typescript
// Before:
export type {
  DefinitionProxy,
  PromptContext,
  // ...
} from './types';

// After:
export type {
  DefinitionProxy,
  PromptContext,
  // ...
} from './types/index';
```

### Step 9: Delete `src/types.ts`

After verifying all imports work, delete the old monolithic types file.

### Step 10: Update internal imports

Update files that import from `./types` or `../types`:

```typescript
// Before:
import { PromptContext, StepModifier } from './types';

// After (same import path works due to index.ts):
import { PromptContext, StepModifier } from './types';
// Or be explicit:
import { PromptContext } from './types/core';
import { StepModifier } from './types/effects';
```

## Files to Modify

1. **Create:** `src/types/index.ts`
2. **Create:** `src/types/core.ts`
3. **Create:** `src/types/collections.ts`
4. **Create:** `src/types/tools.ts`
5. **Create:** `src/types/agents.ts`
6. **Create:** `src/types/effects.ts`
7. **Create:** `src/types/plugins.ts`
8. **Delete:** `src/types.ts` (after migration)
9. **Modify:** `src/index.ts` - Update import path
10. **Verify:** All internal imports still work

## Expected Outcome

- Types organized by domain/concern
- Easier to find and modify related types
- Smaller, focused files are easier to understand
- Import paths remain backward compatible
- Better IDE navigation with logical groupings

## Testing

1. Run `npm run build` to verify TypeScript compilation
2. Run `npm test` to verify all tests pass
3. Verify that external imports work:
   ```typescript
   import { PromptContext, ToolOptions } from 'lmthing';
   ```

## Notes

- Keep plugin-specific types (Task, function types) in their plugin directories
- The `src/types/index.ts` ensures backward compatibility
- Consider adding a `Resettable` interface here after Refactor 02
- Consider adding error types here after Refactor 03
