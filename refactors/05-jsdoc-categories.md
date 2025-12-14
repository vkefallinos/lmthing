# Refactor 05: Add JSDoc @category Tags for Better Documentation

## Problem

When generating API documentation (e.g., with TypeDoc), all exports appear in a flat, alphabetical list. This makes it difficult to:

1. Navigate the API documentation
2. Understand which methods are related
3. Find the right method for a task
4. Onboard new developers to the codebase

## Current State

Methods in `StatefulPrompt` have JSDoc comments but no categorization:

```typescript
/**
 * Define a variable that will be included in the system prompt.
 */
def(name: string, value: any): DefinitionProxy

/**
 * Create a tool definition.
 */
defTool(...): DefinitionProxy

/**
 * Register an effect.
 */
defEffect(...): void
```

## Proposed Solution

Add `@category` JSDoc tags to group related methods and exports. This is supported by TypeDoc and helps organize generated documentation.

### Categories to Use

| Category | Description | Methods/Types |
|----------|-------------|---------------|
| `Definitions` | Variable and system definitions | `def`, `defData`, `defSystem`, `defMessage` |
| `Tools` | Tool creation and execution | `defTool`, `tool`, `ToolOptions` |
| `Agents` | Agent creation and execution | `defAgent`, `agent`, `AgentOptions` |
| `Hooks` | React-like hooks for state and effects | `defState`, `defEffect` |
| `Providers` | AI provider configuration | All provider exports |
| `Plugins` | Plugin system types and utilities | `Plugin`, `PluginMethod`, plugin exports |
| `Types` | Core type definitions | `PromptContext`, `DefinitionProxy`, etc. |
| `Errors` | Error classes | `LmthingError`, `ProviderError`, etc. |

### Step 1: Update `src/StatefulPrompt.ts`

Add `@category` tags to all public methods:

```typescript
/**
 * Define a variable that will be included in the system prompt.
 *
 * @category Definitions
 * @param name - Variable name (used as XML tag)
 * @param value - Variable value (string or will be converted)
 * @returns Proxy object that can be used in templates
 *
 * @example
 * ```typescript
 * const userName = prompt.def('USER_NAME', 'Alice');
 * prompt.$`Hello ${userName}`;
 * ```
 */
def(name: string, value: any): DefinitionProxy

/**
 * Define a data variable with YAML formatting.
 *
 * @category Definitions
 */
defData(name: string, data: any): DefinitionProxy

/**
 * Define a system prompt section.
 *
 * @category Definitions
 */
defSystem(name: string, content: string): DefinitionProxy

/**
 * Add a message to the conversation.
 *
 * @category Definitions
 */
defMessage(role: 'user' | 'assistant' | 'system', content: string): void

/**
 * Define a tool that the model can call.
 *
 * @category Tools
 */
defTool(...): DefinitionProxy

/**
 * Define an agent (tool that spawns a child prompt).
 *
 * @category Agents
 */
defAgent(...): DefinitionProxy

/**
 * Create persistent state across prompt re-executions.
 *
 * @category Hooks
 */
defState<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void]

/**
 * Register an effect to run based on dependency changes.
 *
 * @category Hooks
 */
defEffect(callback: EffectCallback, dependencies?: any[]): void

/**
 * Tagged template literal for adding user messages.
 *
 * @category Definitions
 */
$(strings: TemplateStringsArray, ...values: any[]): void
```

### Step 2: Update `src/types/` files (after Refactor 04)

Add categories to type definitions:

```typescript
// src/types/core.ts
/**
 * Interface for the prompt context passed to effects.
 *
 * @category Types
 */
export interface PromptContext { ... }

/**
 * Interface for definition proxy objects.
 *
 * @category Types
 */
export interface DefinitionProxy { ... }
```

```typescript
// src/types/tools.ts
/**
 * Options for defTool and tool functions.
 *
 * @category Tools
 */
export interface ToolOptions { ... }

/**
 * Tool event callback signature.
 *
 * @category Tools
 */
export type ToolEventCallback = ...
```

```typescript
// src/types/agents.ts
/**
 * Options for defAgent and agent functions.
 *
 * @category Agents
 */
export interface AgentOptions { ... }
```

```typescript
// src/types/plugins.ts
/**
 * A plugin is an object containing named plugin methods.
 *
 * @category Plugins
 */
export type Plugin = ...

/**
 * A plugin method that receives StatefulPrompt as this context.
 *
 * @category Plugins
 */
export type PluginMethod = ...
```

### Step 3: Update `src/providers/` files

Add categories to provider exports:

```typescript
// src/providers/openai.ts
/**
 * Create an OpenAI provider instance.
 *
 * @category Providers
 */
export function createOpenAIProvider(config?: OpenAIConfig) { ... }

/**
 * Default OpenAI provider instance.
 *
 * @category Providers
 */
export const openai = createOpenAIProvider();

/**
 * Common OpenAI model identifiers.
 *
 * @category Providers
 */
export const OpenAIModels = { ... }
```

### Step 4: Update `src/errors.ts` (after Refactor 03)

```typescript
/**
 * Base error class for all lmthing errors.
 *
 * @category Errors
 */
export class LmthingError extends Error { ... }

/**
 * Error thrown when provider resolution fails.
 *
 * @category Errors
 */
export class ProviderError extends LmthingError { ... }
```

### Step 5: Update `src/runPrompt.ts`

```typescript
/**
 * Main entry point for running prompts.
 * Creates a StatefulPrompt, executes the prompt function, and streams results.
 *
 * @category Core
 */
export async function runPrompt<P extends readonly Plugin[]>(...) { ... }
```

### Step 6: Update `src/plugins/` exports

```typescript
// src/plugins/taskList.ts
/**
 * Task list plugin for managing tasks in prompts.
 *
 * @category Plugins
 */
export const taskListPlugin = { ... }

// src/plugins/function/index.ts
/**
 * Function plugin for TypeScript-validated function execution.
 *
 * @category Plugins
 */
export const functionPlugin = { ... }
```

### Step 7: Add TypeDoc configuration (optional)

Create `typedoc.json` in project root:

```json
{
  "entryPoints": ["src/index.ts"],
  "out": "docs",
  "plugin": ["typedoc-plugin-markdown"],
  "categorizeByGroup": true,
  "categoryOrder": [
    "Core",
    "Definitions",
    "Tools",
    "Agents",
    "Hooks",
    "Providers",
    "Plugins",
    "Types",
    "Errors",
    "*"
  ],
  "defaultCategory": "Other",
  "excludePrivate": true,
  "excludeProtected": true
}
```

Add to `package.json`:

```json
{
  "scripts": {
    "docs": "typedoc"
  },
  "devDependencies": {
    "typedoc": "^0.25.0",
    "typedoc-plugin-markdown": "^3.17.0"
  }
}
```

## Files to Modify

1. **Modify:** `src/StatefulPrompt.ts` - Add @category to all public methods
2. **Modify:** `src/runPrompt.ts` - Add @category to runPrompt
3. **Modify:** `src/types/*.ts` - Add @category to all types (after Refactor 04)
4. **Modify:** `src/providers/*.ts` - Add @category to all exports
5. **Modify:** `src/plugins/*.ts` - Add @category to plugin exports
6. **Modify:** `src/errors.ts` - Add @category to error classes (after Refactor 03)
7. **Create:** `typedoc.json` (optional) - TypeDoc configuration

## Expected Outcome

- Generated documentation is organized by category
- Developers can quickly find related methods
- API is easier to navigate and understand
- Categories visible in IDE tooltips (some IDEs)
- Better onboarding experience

## Testing

1. Run `npm run build` to verify compilation
2. If TypeDoc is configured, run `npm run docs` and verify output
3. Check that categories appear correctly in generated docs
4. Verify IDE tooltips show category information

## Notes

- Categories should be consistent across the codebase
- Use singular form for category names ("Tool" not "Tools") - actually plural is more common
- The `@category` tag is a TSDoc/TypeDoc convention
- Some IDEs (VS Code with certain extensions) will show categories in hover tooltips
- This is purely a documentation enhancement - no runtime impact
