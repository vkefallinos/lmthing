import { PrepareStepOptions } from "./StreamText";
import { type ModelInput } from "./providers/resolver";
import {
  PromptContext,
  LastToolInfo,
  StepModifier,
  StepModifications
} from './types';
import { Prompt, DefHookResult } from './Prompt';
import { StateManager } from './state';
import { EffectsManager } from './effects';
import { DefinitionTracker } from './definitions';
import { createToolCollection, createSystemCollection, createVariableCollection } from './collections';

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
  private _stateManager = new StateManager();
  private _effectsManager = new EffectsManager();
  private _definitionTracker = new DefinitionTracker();
  private _promptFn?: (args: any) => any;
  private _stateful: boolean = false;
  private _stepModifications: StepModifications = {};
  private _lastTool: LastToolInfo | null = null;
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
    return this._stateManager.createStateAccessor(key, initialValue);
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
    this._effectsManager.register(callback, dependencies);
  }

  /**
   * Clear current definitions tracking for a new execution cycle
   */
  private _clearDefinitions(): void {
    this._definitionTracker.reset();
  }

  /**
   * Reconcile definitions after re-execution
   * Removes definitions that were not seen in the latest re-run
   */
  private _reconcileDefinitions(): void {
    this._definitionTracker.reconcile(this.variables, this.systems, this._tools);
  }

  /**
   * Get prompt methods for passing to promptFn
   */
  private _getPromptMethods() {
    return {
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
  }

  /**
   * Process effects and run those that have changed dependencies
   */
  private _processEffects(options: PrepareStepOptions<any>): void {
    // Create prompt context
    const context = this._createPromptContext(options);

    // Create step modifier function
    const stepModifier = this._createStepModifier();

    // Process effects via the manager
    this._effectsManager.process(context, stepModifier);
  }

  /**
   * Create prompt context for effects
   */
  private _createPromptContext(options: PrepareStepOptions<any>): PromptContext {
    return {
      messages: options.messages,
      tools: createToolCollection(this._tools),
      systems: createSystemCollection(this.systems),
      variables: createVariableCollection(this.variables),
      lastTool: this._lastTool,
      stepNumber: options.stepNumber
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
    // In non-stateful mode, just delegate to parent
    if (!this._stateful) {
      return super.run();
    }

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
        // Clear definition tracking for new execution cycle
        this._clearDefinitions();

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
    this._definitionTracker.mark('def', name);
    return super.def(name, value);
  }

  /**
   * Override defData to mark definitions as seen
   */
  defData(name: string, value: any) {
    this._definitionTracker.mark('defData', name);
    return super.defData(name, value);
  }

  /**
   * Override defSystem to mark definitions as seen
   */
  defSystem(name: string, value: string) {
    this._definitionTracker.mark('defSystem', name);
    return super.defSystem(name, value);
  }

  /**
   * Override defTool to mark definitions as seen
   */
  defTool(name: string, description: string, inputSchemaOrSubTools: any, execute?: Function) {
    this._definitionTracker.mark('defTool', name);
    return super.defTool(name, description, inputSchemaOrSubTools, execute);
  }

  /**
   * Override defAgent to mark definitions as seen
   */
  defAgent(name: string, description: string, inputSchemaOrSubAgents: any, execute?: Function, options?: any) {
    this._definitionTracker.mark('defAgent', name);
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