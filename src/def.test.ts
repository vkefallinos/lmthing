/**
 * Comprehensive tests for def() method validation
 * 
 * These tests validate that def(name, value) consistently:
 * - Registers scalar variables correctly
 * - Returns stable definition proxies
 * - Renders correctly in system prompts across step re-executions
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockModel } from './test/createMockModel';
import { runPrompt } from './runPrompt';
import { z } from 'zod';

describe('def() method validation', () => {
  describe('Initial registration and XML-tag rendering', () => {
    it('should register a simple scalar variable', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello World' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        const userName = def('USER_NAME', 'Alice');
        $`Use the variable ${userName}`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check that variable was registered
      expect(prompt.variables['USER_NAME']).toBeDefined();
      const variable = prompt.variables['USER_NAME'];
      expect(variable).toEqual({ type: 'string', value: 'Alice' });
    });

    it('should render variable as XML tag in system prompt', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        def('USER_NAME', 'Bob');
        def('USER_AGE', '30');
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
      expect(content).toContain('<variables>');
      expect(content).toContain('<USER_NAME>');
      expect(content).toContain('Bob');
      expect(content).toContain('</USER_NAME>');
      expect(content).toContain('<USER_AGE>');
      expect(content).toContain('30');
      expect(content).toContain('</USER_AGE>');
      expect(content).toContain('</variables>');
    });

    it('should register multiple variables without conflicts', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        def('VAR1', 'value1');
        def('VAR2', 'value2');
        def('VAR3', 'value3');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['VAR1']).toBeDefined();
      expect(prompt.variables['VAR2']).toBeDefined();
      expect(prompt.variables['VAR3']).toBeDefined();
      expect(prompt.variables['VAR1']).toEqual({ type: 'string', value: 'value1' });
      expect(prompt.variables['VAR2']).toEqual({ type: 'string', value: 'value2' });
      expect(prompt.variables['VAR3']).toEqual({ type: 'string', value: 'value3' });
    });

    it('should handle empty string values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        def('EMPTY', '');
        $`Test empty value`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['EMPTY']).toBeDefined();
      expect(prompt.variables['EMPTY']).toEqual({ type: 'string', value: '' });
      
      // Check it renders in system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      expect(content).toContain('<EMPTY>');
      expect(content).toContain('</EMPTY>');
    });

    it('should handle whitespace and special characters in values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        def('MULTILINE', 'Line 1\nLine 2\nLine 3');
        def('SPECIAL', 'Value with   spaces   and\ttabs');
        def('PUNCTUATION', 'Hello, World! How are you?');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['MULTILINE']).toEqual({ 
        type: 'string', 
        value: 'Line 1\nLine 2\nLine 3' 
      });
      expect(prompt.variables['SPECIAL']).toEqual({ 
        type: 'string', 
        value: 'Value with   spaces   and\ttabs' 
      });
      expect(prompt.variables['PUNCTUATION']).toEqual({ 
        type: 'string', 
        value: 'Hello, World! How are you?' 
      });
    });
  });

  describe('Proxy behavior (value, toString, template interpolation)', () => {
    it('should return proxy with correct value property', async () => {
      let proxyRef: any;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ def, $ }) => {
        proxyRef = def('TEST', 'value');
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(proxyRef).toBeDefined();
      expect(proxyRef.value).toBe('<TEST>');
    });

    it('should coerce to string correctly in template literals', async () => {
      let interpolated: string = '';
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ def, $ }) => {
        const userName = def('USER', 'Alice');
        interpolated = `Hello ${userName}`;
        $`${interpolated}`;
      }, {
        model: mockModel,
      });

      expect(interpolated).toBe('Hello <USER>');
    });

    it('should support toString() method', async () => {
      let stringValue: string = '';
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ def, $ }) => {
        const proxy = def('NAME', 'Bob');
        stringValue = proxy.toString();
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(stringValue).toBe('<NAME>');
    });

    it('should support valueOf() method', async () => {
      let value: any;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ def, $ }) => {
        const proxy = def('VAL', 'test');
        value = proxy.valueOf();
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(value).toBe('<VAL>');
    });

    it('should work with string concatenation', async () => {
      let concatenated: string = '';
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ def, $ }) => {
        const prefix = def('PREFIX', 'Hello');
        const suffix = def('SUFFIX', 'World');
        concatenated = prefix + ' ' + suffix;
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(concatenated).toBe('<PREFIX> <SUFFIX>');
    });

    it('should support in operator for checking properties', async () => {
      let hasValue: boolean = false;
      let hasRemind: boolean = false;
      let hasDisable: boolean = false;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ def, $ }) => {
        const proxy = def('TEST', 'value');
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

      await runPrompt(async ({ def, $ }) => {
        const proxy = def('TEST', 'value');
        unknownProp = proxy.someUnknownProperty;
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(unknownProp).toBe('<TEST>');
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

      const { result } = await runPrompt(async ({ def, defTool, $ }) => {
        const userName = def('USER', 'Alice');
        proxyRefs.push(userName);

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
      expect(values.every(v => v === '<USER>')).toBe(true);
    });

    it('should keep variable definitions across multiple steps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'step1', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'step2', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defTool, $ }) => {
        def('PERSISTENT', 'stays');
        
        defTool('step1', 'Step 1', z.object({}), async () => ({ done: true }));
        defTool('step2', 'Step 2', z.object({}), async () => ({ done: true }));

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Variable should still be present after all steps
      expect(prompt.variables['PERSISTENT']).toBeDefined();
      expect(prompt.variables['PERSISTENT']).toEqual({ 
        type: 'string', 
        value: 'stays' 
      });
    });

    it('should handle variable redefinition with same name', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'update', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      let step = 0;

      const { result, prompt } = await runPrompt(async ({ def, defTool, defState, $ }) => {
        const [currentStep, setStep] = defState('step', 0);
        step = currentStep;

        // Redefine with different value based on step
        def('DYNAMIC', step === 0 ? 'initial' : 'updated');

        defTool('update', 'Update', z.object({}), async () => {
          setStep(1);
          return { updated: true };
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Final value should be 'updated' since last re-execution had step=1
      expect(prompt.variables['DYNAMIC']).toEqual({ 
        type: 'string', 
        value: 'updated' 
      });
    });

    it('should remove variable if not defined in re-execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'toggle', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defTool, defState, $ }) => {
        const [include, setInclude] = defState('include', true);

        // Only define variable on first execution
        if (include) {
          def('CONDITIONAL', 'present');
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

      // Variable should be removed after re-execution without it
      expect(prompt.variables['CONDITIONAL']).toBeUndefined();
    });
  });

  describe('Disable/remind behavior via proxy methods', () => {
    it('should support remind() method', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      let reminded: any[] = [];

      const { result, prompt } = await runPrompt(async ({ def, defEffect, $ }) => {
        const important = def('IMPORTANT', 'value');

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
        { type: 'def', name: 'IMPORTANT' }
      ]);
    });

    it('should support disable() method', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defEffect, $ }) => {
        const disabled = def('DISABLED', 'hidden');

        defEffect((ctx, stepModifier) => {
          disabled.disable();
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check that disabled variable is not in system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      
      if (systemMessage) {
        const content = Array.isArray(systemMessage.content) 
          ? systemMessage.content.map(c => c.text).join('') 
          : systemMessage.content as string;
        
        // Variable should not appear in the system prompt
        if (content) {
          expect(content).not.toContain('<DISABLED>');
        }
      }
    });

    it('should handle multiple remind() calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      let reminded: any[] = [];

      const { result, prompt } = await runPrompt(async ({ def, defEffect, $ }) => {
        const var1 = def('VAR1', 'v1');
        const var2 = def('VAR2', 'v2');
        const var3 = def('VAR3', 'v3');

        defEffect(() => {
          var1.remind();
          var2.remind();
          var3.remind();
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
      expect(reminded).toContainEqual({ type: 'def', name: 'VAR1' });
      expect(reminded).toContainEqual({ type: 'def', name: 'VAR2' });
      expect(reminded).toContainEqual({ type: 'def', name: 'VAR3' });
    });

    it('should handle conditional disable based on state', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'toggle', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defTool, defState, defEffect, $ }) => {
        const [shouldShow, setShouldShow] = defState('show', true);
        const dynamic = def('DYNAMIC', 'value');

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

      // Check last step - variable should be disabled
      const lastStep = prompt.fullSteps[prompt.fullSteps.length - 1];
      const systemMessage = lastStep.input.prompt.find(m => m.role === 'system');
      
      if (systemMessage) {
        const content = Array.isArray(systemMessage.content) 
          ? systemMessage.content.map(c => c.text).join('') 
          : systemMessage.content as string;
        
        if (content) {
          expect(content).not.toContain('<DYNAMIC>');
        }
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle very long variable values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const longValue = 'A'.repeat(10000);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        def('LONG', longValue);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['LONG']).toEqual({ 
        type: 'string', 
        value: longValue 
      });
    });

    it('should handle variable names with underscores and numbers', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        def('VAR_123', 'value1');
        def('USER_NAME_2', 'value2');
        def('_PRIVATE', 'value3');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['VAR_123']).toBeDefined();
      expect(prompt.variables['USER_NAME_2']).toBeDefined();
      expect(prompt.variables['_PRIVATE']).toBeDefined();
    });

    it('should handle Unicode characters in values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        def('EMOJI', '😀🎉🚀');
        def('CHINESE', '你好世界');
        def('ARABIC', 'مرحبا بالعالم');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['EMOJI']).toEqual({ 
        type: 'string', 
        value: '😀🎉🚀' 
      });
      expect(prompt.variables['CHINESE']).toEqual({ 
        type: 'string', 
        value: '你好世界' 
      });
      expect(prompt.variables['ARABIC']).toEqual({ 
        type: 'string', 
        value: 'مرحبا بالعالم' 
      });
    });

    it('should handle rapid successive def() calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        for (let i = 0; i < 100; i++) {
          def(`VAR_${i}`, `value_${i}`);
        }
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // All 100 variables should be registered
      expect(Object.keys(prompt.variables).length).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(prompt.variables[`VAR_${i}`]).toEqual({ 
          type: 'string', 
          value: `value_${i}` 
        });
      }
    });
  });

  describe('Interactions with related APIs', () => {
    it('should work with $ template literal', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello Alice' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        const name = def('NAME', 'Alice');
        $`Hello ${name}`;
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
      expect(content).toBe('Hello <NAME>');
    });

    it('should work with defMessage', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defMessage, $ }) => {
        const context = def('CONTEXT', 'important context');
        defMessage('system', `Additional context: ${context}`);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check that message was added with variable tag
      const firstStep = prompt.fullSteps[0];
      const systemMessages = firstStep.input.prompt.filter(m => m.role === 'system');
      const contextMessage = systemMessages.find(m => 
        (m.content as string).includes('Additional context')
      );
      expect(contextMessage).toBeDefined();
      expect(contextMessage?.content).toContain('<CONTEXT>');
    });

    it('should work with defEffect to conditionally modify variables', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defEffect, $ }) => {
        const setting = def('SETTING', 'enabled');

        defEffect((ctx, stepModifier) => {
          // Access variable through context
          expect(ctx.variables.has('SETTING')).toBe(true);
        });

        $`Test with ${setting}`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['SETTING']).toBeDefined();
    });

    it('should not duplicate user messages on re-execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'next', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defTool, $ }) => {
        const var1 = def('VAR', 'value');
        
        defTool('next', 'Next step', z.object({}), async () => ({ ok: true }));

        $`Message with ${var1}`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Count user messages - the same message should appear in each step's input
      // but it should only be added once (not duplicated as separate messages)
      const firstStep = prompt.fullSteps[0];
      const userMessages = firstStep.input.prompt.filter(m => m.role === 'user');
      
      // Should only have one user message per prompt execution
      expect(userMessages.length).toBe(1);
      
      // Verify the message content
      const content = Array.isArray(userMessages[0]?.content) 
        ? userMessages[0].content.map(c => c.text).join('') 
        : userMessages[0]?.content as string;
      expect(content).toBe('Message with <VAR>');
    });

    it('should work with defState for dynamic variable values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'update', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defTool, defState, $ }) => {
        const [counter, setCounter] = defState('counter', 0);
        
        // Define variable with state-dependent value
        def('COUNTER_VALUE', String(counter));

        defTool('update', 'Update counter', z.object({}), async () => {
          setCounter(counter + 1);
          return { newValue: counter + 1 };
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Final counter value should be reflected in variable
      expect(prompt.variables['COUNTER_VALUE']).toEqual({ 
        type: 'string', 
        value: '1' 
      });
    });

    it('should allow multiple variables in single template', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, $ }) => {
        const name = def('NAME', 'Alice');
        const age = def('AGE', '30');
        const city = def('CITY', 'NYC');
        
        $`User ${name} is ${age} years old and lives in ${city}`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const userMessage = firstStep.input.prompt.find(m => m.role === 'user');
      const content = Array.isArray(userMessage?.content) 
        ? userMessage.content.map(c => c.text).join('') 
        : userMessage?.content as string;
      expect(content).toBe('User <NAME> is <AGE> years old and lives in <CITY>');
    });
  });
});
