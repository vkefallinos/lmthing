import { StreamTextResult } from "ai";
import { Prompt } from "./Prompt";
import { StreamTextOptions } from "./StreamText";
import { type ModelInput } from "./providers/resolver";

interface PromptConfig {
  model: ModelInput;
  // Allow passing any streamText options except the ones we handle internally
  options?: Partial<Omit<StreamTextOptions, 'model' | 'system' | 'messages' | 'tools' | 'onFinish' | 'onStepFinish' | 'prepareStep'>>;
}

interface RunPromptResult {
  prompt: Prompt;
  result: StreamTextResult<any, any>;
}

/**
 * Creates a proxy around the Prompt instance that automatically binds methods
 * so they can be destructured without losing 'this' context
 */
function createPromptProxy(prompt: Prompt): Prompt {
  return new Proxy(prompt, {
    get(target, prop) {
      const value = target[prop as keyof Prompt];
      // If it's a function, bind it to the target
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    }
  });
}

export const runPrompt = async (
  promptFn: (prompt: Prompt) => Promise<void>,
  config: PromptConfig
): Promise<RunPromptResult> => {
  // Model resolution happens in StreamTextBuilder constructor
  const prompt = new Prompt(config.model);

  // Apply any additional options if provided
  if (config.options) {
    prompt.withOptions(config.options);
  }

  // Wrap prompt in a proxy that auto-binds methods
  const proxiedPrompt = createPromptProxy(prompt);
  await promptFn(proxiedPrompt);
  const result = prompt.run();
  // Return the actual prompt instance (not the proxy) for accessing properties like steps
  return { result, prompt };
}