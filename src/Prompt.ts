import { PrepareStepOptions, StreamTextBuilder } from "./StreamText";
import yaml from 'js-yaml';


interface DefHookResult {
  system ?: string;
  activeTools ?: string[];
  messages ?: any[];
  variables ?: Record<string, any>;
}
export class Prompt extends StreamTextBuilder {
  private variables: Record<string, {
    type: 'string' | 'data';
    value: any;

  }> = {};
  private systems: Record<string, string> = {};
  private addVariable(name: string, value: any, type: 'string' | 'data') {
    this.variables[name] = { type, value };
  }

  private addSystemPart(name: string, part: string): void {
    this.systems[name] = part;
  }
  def(name: string, value: string) {
    this.addVariable(name, value, 'string');
    return `<${name}>`;
  }

  defData(name: string, value: any) {
    this.addVariable(name, value, 'data');
    return `<${name}>`;
  }
  defSystem(name: string, value: string) {
    this.addSystemPart(name, value);
  }
  defMessage(role: 'user' | 'assistant', content: string) {
    this.addMessage({ role, content });
  }
  defTool(name: string, description: string, inputSchema: any, execute: Function) {
    this.addTool(name, { description, inputSchema, execute });
  }
  defHook(hookFn: (opts: PrepareStepOptions<any> & {variables: Record<string, any>})=>DefHookResult) {
    this.addPrepareStep(({messages, model, steps, stepNumber})=>{
      const updates: DefHookResult = hookFn({ messages, model, steps, stepNumber, variables: this.variables });
      if (updates.variables) {
        this.variables = { ...this.variables, ...updates.variables };
      }
      return updates;
    })
  }
  defAgent(
    name: string, 
    description: string, 
    inputSchema: any, 
    execute: Function, 
    {model, ...options}: any
  ) {
    this.addTool(name, { description, inputSchema, execute: async (args:any)=>{
      const prompt = new Prompt(model || this.getModel());
      prompt.withOptions(options || this.getOptions());
      await execute({ ...args}, prompt);
      const result = await prompt.run();
      const lastResponse = await result.text;
      return { response: lastResponse, steps: prompt.steps };
    }});

  }
  $(strings: TemplateStringsArray, ...values: any[]) {
    const content = strings.reduce((acc, str, i) => {
      return acc + str + (values[i] !== undefined ? values[i] : '');
    }, '');
    this.addMessage({ role: 'user', content });
  }

  run() {
    this.setLastPrepareStep(()=>{
      // Final preparation before run
      let systemParts: string[] = [];
      for (const [name, part] of Object.entries(this.systems)) {
        systemParts.push(`${name}:\n${part}`);
      }
      const system = systemParts.length > 0 ? systemParts.join('\n') : undefined;
      let variableDefinitions: string[] = [];
      for (const [name, varDef] of Object.entries(this.variables)) {
        if (varDef.type === 'string') {
          variableDefinitions.push(`  <${name}>\n ${varDef.value}\n  </${name}>`);
        } else if (varDef.type === 'data') {
          const yamlData = yaml.dump(varDef.value);
          variableDefinitions.push(`  <${name}>\n${yamlData}\n  </${name}>`);
        }
      }
      if (variableDefinitions.length > 0) {
        const varsSystemPart = `<variables>\n${variableDefinitions.join('\n')}\n</variables>`;
        if (system) {
          return { system: `${system}\n${varsSystemPart}` };
        } else {
          return { system: varsSystemPart };
        }
      }
    });
    return this.execute();
  }
}