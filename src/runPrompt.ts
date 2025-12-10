import { StreamTextResult } from "ai";
import { StatefulPrompt } from "./StatefulPrompt";
import { StreamTextOptions } from "./StreamText";
import { type ModelInput } from "./providers/resolver";

interface PromptConfig {
  model: ModelInput;
  // Allow passing any streamText options except the ones we handle internally
  options?: Partial<Omit<StreamTextOptions, 'model' | 'system' | 'messages' | 'tools' | 'onFinish' | 'onStepFinish' | 'prepareStep'>>;
}

interface RunPromptResult {
  prompt: StatefulPrompt;
  result: StreamTextResult<any, any>;
}

/**
 * Creates a proxy around the StatefulPrompt instance that automatically binds methods
 * so they can be destructured without losing 'this' context
 */
function createPromptProxy(prompt: StatefulPrompt): StatefulPrompt {
  return new Proxy(prompt, {
    get(target, prop) {
      const value = target[prop as keyof StatefulPrompt];
      // If it's a function, bind it to the target
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    }
  });
}

export const runPrompt = async (
  promptFn: (prompt: StatefulPrompt) => Promise<void>,
  config: PromptConfig
): Promise<RunPromptResult> => {
  // Always create a StatefulPrompt
  const prompt = new StatefulPrompt(config.model);

  // Apply any additional options if provided
  if (config.options) {
    prompt.withOptions(config.options);
  }

  // Set the prompt function for re-execution
  prompt.setPromptFn(promptFn);

  // Wrap prompt in a proxy that auto-binds methods
  const proxiedPrompt = createPromptProxy(prompt);

  // Execute the prompt function once to set up initial state
  await promptFn(proxiedPrompt);

  // Run with stateful re-execution (will re-execute promptFn on subsequent steps)
  const result = prompt.run();

  return { result, prompt };
}