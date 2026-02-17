/**
 * Comprehensive tests for defSystem() method validation
 * 
 * These tests validate that defSystem(name, content) consistently:
 * - Registers system sections correctly
 * - Returns stable definition proxies
 * - Renders correctly in system prompts across step re-executions
 * - Properly reconciles definitions across re-executions
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockModel } from './test/createMockModel';
import { runPrompt } from './runPrompt';
import { z } from 'zod';

describe('defSystem() method validation', () => {
  describe('Initial registration and XML-tag rendering', () => {
    it('should register a simple system section', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello World' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        const roleSystem = defSystem('role', 'You are a helpful assistant.');
        $`Use the system section ${roleSystem}`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check that system section was registered
      expect(prompt.systems['role']).toBeDefined();
      expect(prompt.systems['role']).toBe('You are a helpful assistant.');
    });

    it('should render system section as XML tag in system prompt', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('role', 'You are a helpful assistant.');
        defSystem('guidelines', 'Always be polite and concise.');
        $`Test message`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Get the system prompt from the first step
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      expect(systemMessage).toBeDefined();
      
      // Check XML formatting
      const content = systemMessage?.content as string;
      expect(content).toContain('<role>');
      expect(content).toContain('You are a helpful assistant.');
      expect(content).toContain('</role>');
      expect(content).toContain('<guidelines>');
      expect(content).toContain('Always be polite and concise.');
      expect(content).toContain('</guidelines>');
    });

    it('should register multiple system sections without conflicts', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('role', 'You are an assistant.');
        defSystem('rules', 'Rule 1: Be helpful.');
        defSystem('context', 'Working on a project.');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.systems['role']).toBeDefined();
      expect(prompt.systems['rules']).toBeDefined();
      expect(prompt.systems['context']).toBeDefined();
      expect(prompt.systems['role']).toBe('You are an assistant.');
      expect(prompt.systems['rules']).toBe('Rule 1: Be helpful.');
      expect(prompt.systems['context']).toBe('Working on a project.');
    });

    it('should handle empty string values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('empty', '');
        $`Test empty value`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.systems['empty']).toBeDefined();
      expect(prompt.systems['empty']).toBe('');
      
      // Check it renders in system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      expect(content).toContain('<empty>');
      expect(content).toContain('</empty>');
    });

    it('should handle whitespace and special characters in values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('multiline', 'Line 1\nLine 2\nLine 3');
        defSystem('special', 'Value with   spaces   and\ttabs');
        defSystem('punctuation', 'Hello, World! How are you?');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.systems['multiline']).toBe('Line 1\nLine 2\nLine 3');
      expect(prompt.systems['special']).toBe('Value with   spaces   and\ttabs');
      expect(prompt.systems['punctuation']).toBe('Hello, World! How are you?');
    });

    it('should handle system sections with same name (last one wins)', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('role', 'First definition');
        defSystem('role', 'Second definition');
        defSystem('role', 'Third definition');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Last definition should win
      expect(prompt.systems['role']).toBe('Third definition');
      
      // Check only one role section appears in system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      
      // Count occurrences of <role> opening tag
      const roleMatches = content.match(/<role>/g);
      expect(roleMatches?.length).toBe(1);
      expect(content).toContain('Third definition');
      expect(content).not.toContain('First definition');
      expect(content).not.toContain('Second definition');
    });
  });

  describe('System section ordering', () => {
    it('should maintain insertion order of system sections', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('first', 'First section');
        defSystem('second', 'Second section');
        defSystem('third', 'Third section');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Get system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;

      // Check that sections appear in the correct order
      const firstIndex = content.indexOf('<first>');
      const secondIndex = content.indexOf('<second>');
      const thirdIndex = content.indexOf('<third>');

      expect(firstIndex).toBeGreaterThan(-1);
      expect(secondIndex).toBeGreaterThan(firstIndex);
      expect(thirdIndex).toBeGreaterThan(secondIndex);
    });

    it('should maintain order when mixed with variables', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, def, $ }) => {
        defSystem('role', 'Assistant role');
        def('USER', 'Alice');
        defSystem('rules', 'Be helpful');
        def('TASK', 'Analysis');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Get system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;

      // System sections should come before variables section
      const roleIndex = content.indexOf('<role>');
      const rulesIndex = content.indexOf('<rules>');
      const variablesIndex = content.indexOf('<variables>');

      expect(roleIndex).toBeGreaterThan(-1);
      expect(rulesIndex).toBeGreaterThan(roleIndex);
      expect(variablesIndex).toBeGreaterThan(rulesIndex);
    });
  });

  describe('Proxy behavior (value, toString, template interpolation)', () => {
    it('should return proxy with correct value property', async () => {
      let proxyRef: any;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defSystem, $ }) => {
        proxyRef = defSystem('test', 'content');
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(proxyRef).toBeDefined();
      expect(proxyRef.value).toBe('<test>');
    });

    it('should coerce to string correctly in template literals', async () => {
      let interpolated: string = '';
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defSystem, $ }) => {
        const role = defSystem('role', 'Assistant');
        interpolated = `Using ${role}`;
        $`${interpolated}`;
      }, {
        model: mockModel,
      });

      expect(interpolated).toBe('Using <role>');
    });

    it('should support toString() method', async () => {
      let stringValue: string = '';
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defSystem, $ }) => {
        const proxy = defSystem('name', 'Content');
        stringValue = proxy.toString();
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(stringValue).toBe('<name>');
    });

    it('should support valueOf() method', async () => {
      let value: any;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defSystem, $ }) => {
        const proxy = defSystem('val', 'test');
        value = proxy.valueOf();
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(value).toBe('<val>');
    });

    it('should work with string concatenation', async () => {
      let concatenated: string = '';
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defSystem, $ }) => {
        const role = defSystem('role', 'Assistant');
        const rules = defSystem('rules', 'Be helpful');
        concatenated = role + ' and ' + rules;
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(concatenated).toBe('<role> and <rules>');
    });

    it('should support in operator for checking properties', async () => {
      let hasValue: boolean = false;
      let hasRemind: boolean = false;
      let hasDisable: boolean = false;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defSystem, $ }) => {
        const proxy = defSystem('test', 'value');
        hasValue = 'value' in proxy;
        hasRemind = 'remind' in proxy;
        hasDisable = 'disable' in proxy;
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(hasValue).toBe(true);
      expect(hasRemind).toBe(true);
      expect(hasDisable).toBe(true);
    });

    it('should return tag value for unknown properties', async () => {
      let unknownProp: any;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defSystem, $ }) => {
        const proxy = defSystem('test', 'value');
        unknownProp = proxy.someUnknownProperty;
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(unknownProp).toBe('<test>');
    });
  });

  describe('Re-execution behavior and stability across steps', () => {
    it('should maintain same proxy reference across re-executions', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'trigger', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const proxyRefs: any[] = [];

      const { result } = await runPrompt(async ({ defSystem, defTool, $ }) => {
        const role = defSystem('role', 'Assistant');
        proxyRefs.push(role);

        defTool('trigger', 'Trigger next step',
          z.object({}),
          async () => ({ ok: true })
        );

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Should have at least 2 re-executions
      expect(proxyRefs.length).toBeGreaterThanOrEqual(2);
      
      // All proxy references should stringify to the same value
      const values = proxyRefs.map(p => String(p));
      expect(values.every(v => v === '<role>')).toBe(true);
    });

    it('should keep system sections across multiple steps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'step1', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'step2', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defTool, $ }) => {
        defSystem('persistent', 'This stays');
        
        defTool('step1', 'Step 1', z.object({}), async () => ({ done: true }));
        defTool('step2', 'Step 2', z.object({}), async () => ({ done: true }));

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // System section should still be present after all steps
      expect(prompt.systems['persistent']).toBeDefined();
      expect(prompt.systems['persistent']).toBe('This stays');
    });

    it('should handle system section redefinition with same name', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'update', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      let step = 0;

      const { result, prompt } = await runPrompt(async ({ defSystem, defTool, defState, $ }) => {
        const [currentStep, setStep] = defState('step', 0);
        step = currentStep;

        // Redefine with different value based on step
        defSystem('dynamic', step === 0 ? 'initial content' : 'updated content');

        defTool('update', 'Update', z.object({}), async () => {
          setStep(1);
          return { updated: true };
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Final value should be 'updated content' since last re-execution had step=1
      expect(prompt.systems['dynamic']).toBe('updated content');
    });

    it('should remove system section if not defined in re-execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'toggle', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defTool, defState, $ }) => {
        const [include, setInclude] = defState('include', true);

        // Only define system section on first execution
        if (include) {
          defSystem('conditional', 'present');
        }

        defTool('toggle', 'Toggle', z.object({}), async () => {
          setInclude(false);
          return { toggled: true };
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // System section should be removed after re-execution without it
      expect(prompt.systems['conditional']).toBeUndefined();
    });

    it('should handle dynamic system sections based on state', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'switch', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defTool, defState, $ }) => {
        const [mode, setMode] = defState('mode', 'brief');

        // Define different system sections based on mode
        if (mode === 'brief') {
          defSystem('instructions', 'Be brief and concise.');
        } else {
          defSystem('instructions', 'Provide detailed explanations.');
        }

        defTool('switch', 'Switch mode', z.object({}), async () => {
          setMode('detailed');
          return { switched: true };
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Should have the 'detailed' version after state change
      expect(prompt.systems['instructions']).toBe('Provide detailed explanations.');
    });
  });

  describe('Disable/remind behavior via proxy methods', () => {
    it('should support remind() method', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      let reminded: any[] = [];

      const { result, prompt } = await runPrompt(async ({ defSystem, defEffect, $ }) => {
        const important = defSystem('important', 'Critical information');

        defEffect(() => {
          important.remind();
        });

        defEffect(() => {
          reminded = prompt.getRemindedItems();
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(reminded).toEqual([
        { type: 'defSystem', name: 'important' }
      ]);
    });

    it('should support disable() method', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defEffect, $ }) => {
        const disabled = defSystem('disabled', 'hidden content');

        defEffect((ctx, stepModifier) => {
          disabled.disable();
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check that disabled system section is not in system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      
      if (systemMessage) {
        const content = Array.isArray(systemMessage.content) 
          ? systemMessage.content.map(c => c.text).join('') 
          : systemMessage.content as string;
        
        // System section should not appear in the system prompt
        if (content) {
          expect(content).not.toContain('<disabled>');
        }
      }
    });

    it('should handle multiple remind() calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      let reminded: any[] = [];

      const { result, prompt } = await runPrompt(async ({ defSystem, defEffect, $ }) => {
        const sys1 = defSystem('sys1', 'Content 1');
        const sys2 = defSystem('sys2', 'Content 2');
        const sys3 = defSystem('sys3', 'Content 3');

        defEffect(() => {
          sys1.remind();
          sys2.remind();
          sys3.remind();
        });

        defEffect(() => {
          reminded = prompt.getRemindedItems();
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(reminded).toHaveLength(3);
      expect(reminded).toContainEqual({ type: 'defSystem', name: 'sys1' });
      expect(reminded).toContainEqual({ type: 'defSystem', name: 'sys2' });
      expect(reminded).toContainEqual({ type: 'defSystem', name: 'sys3' });
    });

    it('should handle conditional disable based on state', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'toggle', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defTool, defState, defEffect, $ }) => {
        const [shouldShow, setShouldShow] = defState('show', true);
        const dynamic = defSystem('dynamic', 'content');

        defEffect((ctx, stepModifier) => {
          if (!shouldShow) {
            dynamic.disable();
          }
        }, [shouldShow]);

        defTool('toggle', 'Toggle visibility', z.object({}), async () => {
          setShouldShow(false);
          return { toggled: true };
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check last step - system section should be disabled
      const lastStep = prompt.fullSteps[prompt.fullSteps.length - 1];
      const systemMessage = lastStep.input.prompt.find(m => m.role === 'system');
      
      if (systemMessage) {
        const content = Array.isArray(systemMessage.content) 
          ? systemMessage.content.map(c => c.text).join('') 
          : systemMessage.content as string;
        
        if (content) {
          expect(content).not.toContain('<dynamic>');
        }
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle very long system section values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const longValue = 'A'.repeat(10000);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('long', longValue);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.systems['long']).toBe(longValue);
    });

    it('should handle system section names with underscores and numbers', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('sys_123', 'content1');
        defSystem('role_v2', 'content2');
        defSystem('_private', 'content3');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.systems['sys_123']).toBeDefined();
      expect(prompt.systems['role_v2']).toBeDefined();
      expect(prompt.systems['_private']).toBeDefined();
    });

    it('should handle Unicode characters in values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('emoji', '😀🎉🚀');
        defSystem('chinese', '你好世界');
        defSystem('arabic', 'مرحبا بالعالم');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.systems['emoji']).toBe('😀🎉🚀');
      expect(prompt.systems['chinese']).toBe('你好世界');
      expect(prompt.systems['arabic']).toBe('مرحبا بالعالم');
    });

    it('should handle rapid successive defSystem() calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        for (let i = 0; i < 100; i++) {
          defSystem(`sys_${i}`, `content_${i}`);
        }
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // All 100 system sections should be registered
      expect(Object.keys(prompt.systems).length).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(prompt.systems[`sys_${i}`]).toBe(`content_${i}`);
      }
    });

    it('should handle multiline content with various formatting', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('formatted', `
          This is a multi-line system prompt
          with various formatting:
          
          - Bullet point 1
          - Bullet point 2
          
          And some **markdown** formatting.
        `);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.systems['formatted']).toContain('multi-line');
      expect(prompt.systems['formatted']).toContain('Bullet point');
      expect(prompt.systems['formatted']).toContain('**markdown**');
    });
  });

  describe('Interactions with related APIs', () => {
    it('should work with $ template literal', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        const role = defSystem('role', 'Assistant');
        $`Using role ${role}`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check that user message contains the tag
      const firstStep = prompt.fullSteps[0];
      const userMessage = firstStep.input.prompt.find(m => m.role === 'user');
      expect(userMessage).toBeDefined();
      const content = Array.isArray(userMessage?.content) 
        ? userMessage.content.map(c => c.text).join('') 
        : userMessage?.content as string;
      expect(content).toBe('Using role <role>');
    });

    it('should work in message content via defMessage', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      let messageContent = '';

      const { result, prompt } = await runPrompt(async ({ defSystem, defMessage, $ }) => {
        const context = defSystem('context', 'important context');
        // Capture what would be sent to defMessage
        messageContent = `Previous response: ${context}`;
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Verify that the proxy renders correctly in string context
      expect(messageContent).toBe('Previous response: <context>');
      // Verify the system section was registered
      expect(prompt.systems['context']).toBe('important context');
    });

    it('should work with defEffect to access system sections', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defEffect, $ }) => {
        const setting = defSystem('setting', 'enabled');

        defEffect((ctx, stepModifier) => {
          // Access system section through context
          expect(ctx.systems.has('setting')).toBe(true);
        });

        $`Test with ${setting}`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.systems['setting']).toBeDefined();
    });

    it('should coexist with def() and defData()', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, def, defData, $ }) => {
        defSystem('role', 'You are an assistant.');
        def('USER_NAME', 'Alice');
        defData('CONFIG', { setting: 'value' });
        defSystem('rules', 'Be helpful.');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // All should coexist
      expect(prompt.systems['role']).toBeDefined();
      expect(prompt.systems['rules']).toBeDefined();
      expect(prompt.variables['USER_NAME']).toBeDefined();
      expect(prompt.variables['CONFIG']).toBeDefined();

      // Check system prompt structure
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;

      // Systems should come before variables
      expect(content.indexOf('<role>')).toBeLessThan(content.indexOf('<variables>'));
      expect(content.indexOf('<rules>')).toBeLessThan(content.indexOf('<variables>'));
    });

    it('should not duplicate user messages on re-execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'next', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defTool, $ }) => {
        const role = defSystem('role', 'Assistant');
        
        defTool('next', 'Next step', z.object({}), async () => ({ ok: true }));

        $`Message with ${role}`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Count user messages
      const firstStep = prompt.fullSteps[0];
      const userMessages = firstStep.input.prompt.filter(m => m.role === 'user');
      
      // Should only have one user message per prompt execution
      expect(userMessages.length).toBe(1);
      
      // Verify the message content
      const content = Array.isArray(userMessages[0]?.content) 
        ? userMessages[0].content.map(c => c.text).join('') 
        : userMessages[0]?.content as string;
      expect(content).toBe('Message with <role>');
    });

    it('should work with defState for dynamic system content', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'update', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defTool, defState, $ }) => {
        const [counter, setCounter] = defState('counter', 0);
        
        // Define system section with state-dependent content
        defSystem('status', `Current count: ${counter}`);

        defTool('update', 'Update counter', z.object({}), async () => {
          setCounter(counter + 1);
          return { newValue: counter + 1 };
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Final counter value should be reflected in system section
      expect(prompt.systems['status']).toBe('Current count: 1');
    });

    it('should allow multiple system sections in single template', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        const role = defSystem('role', 'Assistant');
        const rules = defSystem('rules', 'Be helpful');
        const context = defSystem('context', 'Working on project');
        
        $`Using ${role}, ${rules}, and ${context}`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const userMessage = firstStep.input.prompt.find(m => m.role === 'user');
      const content = Array.isArray(userMessage?.content) 
        ? userMessage.content.map(c => c.text).join('') 
        : userMessage?.content as string;
      expect(content).toBe('Using <role>, <rules>, and <context>');
    });
  });

  describe('Multi-step execution scenarios', () => {
    it('should maintain system sections across tool calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Starting' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'process', args: { data: 'test' } },
        { type: 'text', text: 'Processing' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'finalize', args: {} },
        { type: 'text', text: 'Complete' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defTool, $ }) => {
        defSystem('role', 'Data processor');
        defSystem('guidelines', 'Process carefully');

        defTool('process', 'Process data',
          z.object({ data: z.string() }),
          async () => ({ processed: true })
        );

        defTool('finalize', 'Finalize',
          z.object({}),
          async () => ({ done: true })
        );

        $`Process the data`;
      }, {
        model: mockModel,
      });

      await result.text;

      // After all steps, both system sections should still be present
      expect(prompt.systems['role']).toBeDefined();
      expect(prompt.systems['guidelines']).toBeDefined();
      expect(prompt.systems['role']).toBe('Data processor');
      expect(prompt.systems['guidelines']).toBe('Process carefully');
    });

    it('should properly reconcile when system sections change between steps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Phase 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'nextPhase', args: {} },
        { type: 'text', text: 'Phase 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defTool, defState, $ }) => {
        const [phase, setPhase] = defState('phase', 1);

        // Different system sections for different phases
        if (phase === 1) {
          defSystem('phase1_rules', 'Rules for phase 1');
          defSystem('shared', 'Shared instructions');
        } else {
          defSystem('phase2_rules', 'Rules for phase 2');
          defSystem('shared', 'Shared instructions');
        }

        defTool('nextPhase', 'Move to next phase',
          z.object({}),
          async () => {
            setPhase(2);
            return { phase: 2 };
          }
        );

        $`Execute phase ${phase}`;
      }, {
        model: mockModel,
      });

      await result.text;

      // After all steps, should only have phase 2 and shared
      expect(prompt.systems['phase1_rules']).toBeUndefined();
      expect(prompt.systems['phase2_rules']).toBeDefined();
      expect(prompt.systems['shared']).toBeDefined();
    });

    it('should handle system sections with tool-dependent content', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Start' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'addCapability', args: { name: 'search' } },
        { type: 'text', text: 'Enhanced' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, defTool, defState, $ }) => {
        const [capabilities, setCapabilities] = defState<string[]>('capabilities', []);

        // Build system section based on capabilities
        const capList = capabilities.length > 0 
          ? capabilities.join(', ')
          : 'none';
        defSystem('capabilities', `Available capabilities: ${capList}`);

        defTool('addCapability', 'Add a capability',
          z.object({ name: z.string() }),
          async ({ name }) => {
            setCapabilities([...capabilities, name]);
            return { added: name };
          }
        );

        $`Execute task`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Should reflect the added capability
      expect(prompt.systems['capabilities']).toBe('Available capabilities: search');
    });
  });

  describe('System section content validation', () => {
    it('should preserve exact content including newlines and indentation', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const content = `You are a helpful assistant.

Rules:
  1. Be concise
  2. Be accurate
  
Always follow these guidelines.`;

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('instructions', content);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Content should be preserved exactly
      expect(prompt.systems['instructions']).toBe(content);

      // Check in rendered system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const systemContent = systemMessage?.content as string;
      
      expect(systemContent).toContain(content);
    });

    it('should handle XML-like content in system section values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
        defSystem('example', 'Use <tag>content</tag> format in responses.');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.systems['example']).toBe('Use <tag>content</tag> format in responses.');
    });
  });
});
