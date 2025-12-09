import { PrepareStepOptions, StreamTextBuilder } from "./StreamText";
import yaml from 'js-yaml';
import { z } from 'zod';
import { type ModelInput } from "./providers/resolver";
import {
  DefinitionProxy,
  PromptContext,
  ToolCollection,
  SystemCollection,
  VariableCollection,
  LastToolInfo,
  StepModifier
} from './types';
import { Prompt } from './Prompt';

/**
 * Definition for a sub-tool used within a composite tool.
 */
export interface SubToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  execute: Function;
}

/**
 * Helper function to create a sub-tool definition for use with defTool arrays.
 *
 * @example
 * defTool('file', 'File operations', [
 *   tool('write', 'Write to file', z.object({ path: z.string(), content: z.string() }), writeFile),
 *   tool('append', 'Append to file', z.object({ path: z.string(), content: z.string() }), appendFile),
 * ]);
 */
export function tool(
  name: string,
  description: string,
  inputSchema: z.ZodType<any>,
  execute: Function
): SubToolDefinition {
  return { name, description, inputSchema, execute };
}

/**
 * Definition for a sub-agent used within a composite agent.
 */
export interface SubAgentDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  execute: Function;
  options?: { model?: ModelInput } & Record<string, any>;
}

/**
 * Helper function to create a sub-agent definition for use with defAgent arrays.
 *
 * @example
 * defAgent('specialists', 'Specialist agents', [
 *   agent('researcher', 'Research topics', z.object({ topic: z.string() }), researchFn, { model: 'openai:gpt-4o' }),
 *   agent('analyst', 'Analyze data', z.object({ data: z.string() }), analyzeFn),
 * ]);
 */
export function agent(
  name: string,
  description: string,
  inputSchema: z.ZodType<any>,
  execute: Function,
  options?: { model?: ModelInput } & Record<string, any>
): SubAgentDefinition {
  return { name, description, inputSchema, execute, options };
}

/**
 * Result object returned by defHook callbacks to modify step behavior.
 *
 * @property system - Override the system prompt for this step
 * @property activeTools - Limit which tools are available for this step
 * @property activeSystems - Filter which system parts to include (by name)
 * @property activeVariables - Filter which variables to include (by name)
 * @property messages - Override or modify the messages array
 * @property variables - Add or update variables (will be merged with existing)
 */
export interface DefHookResult {
  system ?: string;
  activeTools ?: string[];
  activeSystems ?: string[];
  activeVariables ?: string[];
  messages ?: any[];
  variables ?: Record<string, any>;
}

/**
 * Effect definition
 */
interface Effect {
  id: number;
  callback: (prompt: PromptContext, step: StepModifier) => void;
  dependencies?: any[];
}

/**
 * Step modifications accumulator
 */
interface StepModifications {
  messages?: any[];
  tools?: any[];
  systems?: { name: string; value: string }[];
  variables?: { name: string; type: string; value: any }[];
}

/**
 * StatefulPrompt extends Prompt with React-like hooks functionality
 *
 * This class implements:
 * - defState: For managing state across prompt re-executions
 * - defEffect: For running effects based on dependency changes
 * - Re-execution of promptFn on each step
 * - Definition reconciliation
 */
export class StatefulPrompt extends Prompt {
  private _stateStore: Map<string, any> = new Map();
  private _effects: Effect[] = [];
  private _effectDeps: Map<number, any[]> = new Map();
  private _promptFn?: (args: any) => any;
  private _stateful: boolean = false;
  private _effectIdCounter: number = 0;
  private _stepModifications: StepModifications = {};
  private _lastTool: LastToolInfo | null = null;
  private _seenDefinitions: Set<string> = new Set();
  private _executedOnce: boolean = false;

  /**
   * Override factory method to always return StatefulPrompt
   */
  static create(model: ModelInput): StatefulPrompt {
    return new StatefulPrompt(model, true);
  }

  constructor(model: ModelInput, stateful: boolean = false) {
    super(model);
    this._stateful = stateful;
  }

  /**
   * Set the prompt function for re-execution
   */
  setPromptFn(fn: (args: any) => any): void {
    this._promptFn = fn;
  }

  /**
   * Define state that persists across prompt re-executions
   *
   * @param key - Unique identifier for the state
   * @param initialValue - Initial value for the state
   * @returns Tuple of [stateProxy, setterFunction]
   */
  defState<T>(key: string, initialValue: T): [T, (newValue: T | ((prev: T) => T)) => void] {
    // Initialize state if not exists
    if (!this._stateStore.has(key)) {
      this._stateStore.set(key, initialValue);
    }

    // Create a getter function that returns the current value
    const stateGetter = () => this._stateStore.get(key) as T;

    // Create setter function
    const setter = (newValue: T | ((prev: T) => T)) => {
      const currentValue = this._stateStore.get(key);
      const valueToSet = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(currentValue)
        : newValue;
      this._stateStore.set(key, valueToSet);
    };

    // Return a wrapper that works in template literals
    const stateWrapper = new Proxy(stateGetter, {
      get(target, prop) {
        if (prop === 'valueOf' || prop === 'toString' || prop === Symbol.toPrimitive) {
          return () => target();
        }
        if (typeof prop === 'string' && !isNaN(Number(prop))) {
          return undefined;
        }
        // For property access, try to get from the state value
        const value = target();
        if (value && typeof value === 'object' && prop in value) {
          return (value as any)[prop];
        }
        return value;
      },
      has(_target, prop) {
        const value = _target();
        return value && typeof value === 'object' && prop in value;
      },
      ownKeys(_target) {
        const value = _target();
        return (value && typeof value === 'object' ? Object.keys(value) : []) as string[];
      },
      apply(_target, _thisArg, _argArray) {
        return _target();
      }
    }) as unknown as T;

    return [stateWrapper, setter];
  }

  /**
   * Define an effect that runs based on dependency changes
   *
   * @param callback - Function to run when dependencies change
   * @param dependencies - Optional array of dependencies to track
   */
  defEffect(
    callback: (prompt: PromptContext, step: StepModifier) => void,
    dependencies?: any[]
  ): void {
    const effect: Effect = {
      id: this._effectIdCounter++,
      callback,
      dependencies
    };
    this._effects.push(effect);
  }

  /**
   * Clear current definitions
   */
  private _clearDefinitions(): void {
    // Note: We don't actually clear everything to maintain state across re-runs
    // Instead, we track which definitions are seen in this re-run
    this._seenDefinitions.clear();
  }

  /**
   * Reconcile definitions after re-execution
   * Removes definitions that were not seen in the latest re-run
   */
  private _reconcileDefinitions(): void {
    // Remove unseen variables
    const variablesToRemove = Object.keys(this.variables).filter(
      name => !this._seenDefinitions.has(`def:${name}`) && !this._seenDefinitions.has(`defData:${name}`)
    );
    for (const name of variablesToRemove) {
      delete this.variables[name];
    }

    // Remove unseen systems
    const systemsToRemove = Object.keys(this.systems).filter(
      name => !this._seenDefinitions.has(`defSystem:${name}`)
    );
    for (const name of systemsToRemove) {
      delete this.systems[name];
    }

    // Remove unseen tools (from base class)
    const toolsToRemove = Object.keys(this._tools).filter(
      name => !this._seenDefinitions.has(`defTool:${name}`) && !this._seenDefinitions.has(`defAgent:${name}`)
    );
    for (const name of toolsToRemove) {
      delete this._tools[name];
    }
  }

  /**
   * Get prompt methods for passing to promptFn
   */
  private _getPromptMethods() {
    // Return the prompt methods (def, defTool, etc.) with proper binding
    const methods = {
      $: this.$.bind(this),
      def: this.def.bind(this),
      defData: this.defData.bind(this),
      defSystem: this.defSystem.bind(this),
      defTool: this.defTool.bind(this),
      defAgent: this.defAgent.bind(this),
      defHook: this.defHook.bind(this),
      defState: this.defState.bind(this),
      defEffect: this.defEffect.bind(this),
      defMessage: this.defMessage.bind(this),
    };

    // Wrap in a proxy for method access
    return new Proxy(methods, {
      get(target, prop) {
        const value = target[prop as keyof typeof target];
        return typeof value === 'function' ? value : value;
      }
    });
  }

  /**
   * Process effects and run those that have changed dependencies
   */
  private _processEffects(options: PrepareStepOptions<any>): void {
    // Create prompt context
    const context = this._createPromptContext(options);

    // Create step modifier function
    const stepModifier = this._createStepModifier();

    // Process each effect
    for (const effect of this._effects) {
      if (this._shouldRunEffect(effect)) {
        // Update stored dependencies
        if (effect.dependencies) {
          this._effectDeps.set(effect.id, effect.dependencies);
        }

        // Run the effect
        effect.callback(context, stepModifier);
      }
    }
  }

  /**
   * Create prompt context for effects
   */
  private _createPromptContext(options: PrepareStepOptions<any>): PromptContext {
    const tools = this._createToolCollection();
    const systems = this._createSystemCollection();
    const variables = this._createVariableCollection();

    return {
      messages: options.messages,
      tools,
      systems,
      variables,
      lastTool: this._lastTool,
      stepNumber: options.stepNumber
    };
  }

  /**
   * Create tool collection utility
   */
  private _createToolCollection(): ToolCollection {
    // Get tools from base class
    const tools = Object.entries(this._tools).map(([name, tool]) => ({ name, ...tool }));

    return {
      has(name: string): boolean {
        return tools.some(t => t.name === name);
      },
      filter(predicate: (tool: any) => boolean): any[] {
        return tools.filter(predicate);
      },
      [Symbol.iterator]() {
        return tools[Symbol.iterator]();
      }
    };
  }

  /**
   * Create system collection utility
   */
  private _createSystemCollection(): SystemCollection {
    // Get systems from base class
    const systems = Object.entries(this.systems).map(([name, value]) => ({ name, value }));

    return {
      has(name: string): boolean {
        return systems.some(s => s.name === name);
      },
      filter(predicate: (system: { name: string; value: string }) => boolean): { name: string; value: string }[] {
        return systems.filter(predicate);
      },
      [Symbol.iterator]() {
        return systems[Symbol.iterator]();
      }
    };
  }

  /**
   * Create variable collection utility
   */
  private _createVariableCollection(): VariableCollection {
    // Get variables from base class
    const variables = Object.entries(this.variables).map(([name, varDef]) => ({ name, type: varDef.type, value: varDef.value }));

    return {
      has(name: string): boolean {
        return variables.some(v => v.name === name);
      },
      filter(predicate: (variable: { name: string; type: string; value: any }) => boolean): { name: string; type: string; value: any }[] {
        return variables.filter(predicate);
      },
      [Symbol.iterator]() {
        return variables[Symbol.iterator]();
      }
    };
  }

  /**
   * Create step modifier function
   */
  private _createStepModifier(): StepModifier {
    return (aspect: 'messages' | 'tools' | 'systems' | 'variables', items: any[]) => {
      if (!this._stepModifications[aspect]) {
        this._stepModifications[aspect] = [];
      }
      this._stepModifications[aspect]!.push(...items);
    };
  }

  /**
   * Check if effect should run based on dependencies
   */
  private _shouldRunEffect(effect: Effect): boolean {
    // First run always executes
    if (!this._effectDeps.has(effect.id)) {
      return true;
    }

    // If no dependencies, run every time
    if (!effect.dependencies) {
      return true;
    }

    // Compare dependencies
    const oldDeps = this._effectDeps.get(effect.id);
    if (!oldDeps) {
      return true;
    }

    if (oldDeps.length !== effect.dependencies.length) {
      return true;
    }

    for (let i = 0; i < effect.dependencies.length; i++) {
      if (oldDeps[i] !== effect.dependencies[i]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Apply step modifications to the prepare step result
   */
  private _applyStepModifications(): DefHookResult {
    const result: DefHookResult = {};

    if (this._stepModifications.messages) {
      result.messages = this._stepModifications.messages;
    }

    if (this._stepModifications.tools) {
      result.activeTools = this._stepModifications.tools.map((t: any) => t.name);
    }

    if (this._stepModifications.systems) {
      result.activeSystems = this._stepModifications.systems.map((s: any) => s.name);
    }

    if (this._stepModifications.variables) {
      result.variables = {};
      for (const variable of this._stepModifications.variables) {
        result.variables[variable.name] = {
          type: variable.type,
          value: variable.value
        };
      }
    }

    return result;
  }

  /**
   * Override the template literal handler to avoid duplicate messages
   */
  $(strings: TemplateStringsArray, ...values: any[]) {
    const content = strings.reduce((acc, str, i) => {
      if (values[i] !== undefined) {
        // Check if value is a proxy with a 'value' property
        if (values[i] && typeof values[i] === 'object' && 'value' in values[i]) {
          return acc + str + values[i].value;
        }
        return acc + str + values[i];
      }
      return acc + str;
    }, '');

    // Only add user messages during the first execution
    // Subsequent executions will have the messages already in the history
    if (!this._executedOnce) {
      this.addMessage({ role: 'user', content });
    }
  }

  
  /**
   * Override the run method to support re-execution in stateful mode
   */
  run(): any {
    if (!this._stateful) {
      return super.run();
    }

    // Add hook to track last tool call
    this.addOnStepFinish(async (_result) => {
      // Extract last tool call from result if exists
      // This would need to be implemented based on the result structure
    });

    return super.run();
  }

  /**
   * Override setLastPrepareStep to handle re-execution
   */
  setLastPrepareStep(prepareStepFn: (options: any) => any): void {
    // Stateful mode: re-execute promptFn on each step after the first
    this.addPrepareStep(async (options: PrepareStepOptions<any>) => {
      // Clear step modifications
      this._stepModifications = {};

      // Only re-execute after the first step
      if (this._executedOnce) {
        // Clear current definitions
        this._clearDefinitions();

        // Mark all definitions as unseen
        this._seenDefinitions.clear();

        // Re-execute promptFn
        if (this._promptFn) {
          const promptMethods = this._getPromptMethods();
          await this._promptFn(promptMethods);
        }

        // Reconcile definitions after re-execution
        this._reconcileDefinitions();
      }

      this._executedOnce = true;

      // Process effects
      this._processEffects(options);

      // Apply step modifications
      const modifications = this._applyStepModifications();

      // Call the original prepareStep function
      const baseResult = prepareStepFn(options);

      // Merge results
      return { ...baseResult, ...modifications };
    });
  }

  /**
   * Override def to mark definitions as seen
   */
  def(name: string, value: string) {
    this._seenDefinitions.add(`def:${name}`);
    return super.def(name, value);
  }

  /**
   * Override defData to mark definitions as seen
   */
  defData(name: string, value: any) {
    this._seenDefinitions.add(`defData:${name}`);
    return super.defData(name, value);
  }

  /**
   * Override defSystem to mark definitions as seen
   */
  defSystem(name: string, value: string) {
    this._seenDefinitions.add(`defSystem:${name}`);
    return super.defSystem(name, value);
  }

  /**
   * Override defTool to mark definitions as seen
   */
  defTool(name: string, description: string, inputSchemaOrSubTools: any, execute?: Function) {
    this._seenDefinitions.add(`defTool:${name}`);
    return super.defTool(name, description, inputSchemaOrSubTools, execute);
  }

  /**
   * Override defAgent to mark definitions as seen
   */
  defAgent(name: string, description: string, inputSchemaOrSubAgents: any, execute?: Function, options?: any) {
    this._seenDefinitions.add(`defAgent:${name}`);
    return super.defAgent(name, description, inputSchemaOrSubAgents, execute, options);
  }

  /**
   * Override defHook
   */
  defHook(hookFn: (opts: any) => DefHookResult) {
    // Hook function doesn't need to be tracked for reconciliation
    return super.defHook(hookFn);
  }

  /**
   * Override defMessage
   */
  defMessage(role: 'user' | 'assistant', content: string) {
    // Only add user messages during the first execution
    if (role === 'user' && this._executedOnce) {
      // Return undefined to indicate no proxy was created
      // This maintains API compatibility while preventing duplicate messages
      return undefined;
    }
    return super.defMessage(role, content);
  }
}