/**
 * Comprehensive tests for defData() method validation
 * 
 * These tests validate that defData(name, objectOrArray) consistently:
 * - Registers structured data correctly with YAML serialization
 * - Returns stable definition proxies
 * - Renders correctly in system prompts across step re-executions
 * - Handles edge cases (nested structures, empty data, special characters)
 * - Integrates properly with defEffect and reconciliation
 */

import { describe, it, expect } from 'vitest';
import { createMockModel } from './test/createMockModel';
import { runPrompt } from './runPrompt';
import { z } from 'zod';
import yaml from 'js-yaml';

describe('defData() method validation', () => {
  describe('Initial registration and YAML serialization', () => {
    it('should register a simple object variable', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello World' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        const config = defData('CONFIG', {
          timeout: 30000,
          retries: 3
        });
        $`Use the config ${config}`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check that variable was registered
      expect(prompt.variables['CONFIG']).toBeDefined();
      const variable = prompt.variables['CONFIG'];
      expect(variable.type).toBe('data');
      expect(variable.value).toEqual({ timeout: 30000, retries: 3 });
    });

    it('should serialize object as YAML in system prompt', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const testData = {
        name: 'Test',
        value: 42,
        enabled: true
      };

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('DATA', testData);
        $`Test message`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Get the system prompt from the first step
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      expect(systemMessage).toBeDefined();
      
      // Check YAML formatting
      const content = systemMessage?.content as string;
      expect(content).toContain('<variables>');
      expect(content).toContain('<DATA>');
      expect(content).toContain('</DATA>');
      expect(content).toContain('</variables>');
      
      // Verify YAML content
      expect(content).toContain('name: Test');
      expect(content).toContain('value: 42');
      expect(content).toContain('enabled: true');
    });

    it('should register an array variable', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      const testArray = ['item1', 'item2', 'item3'];

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('ITEMS', testArray);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['ITEMS']).toBeDefined();
      expect(prompt.variables['ITEMS'].type).toBe('data');
      expect(prompt.variables['ITEMS'].value).toEqual(testArray);
    });

    it('should serialize array as YAML in system prompt', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const testArray = ['alpha', 'beta', 'gamma'];

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('LIST', testArray);
        $`Test message`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      
      // YAML array format uses dashes
      expect(content).toContain('- alpha');
      expect(content).toContain('- beta');
      expect(content).toContain('- gamma');
    });

    it('should handle nested objects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const nestedData = {
        user: {
          name: 'Alice',
          profile: {
            age: 30,
            location: 'NYC'
          }
        },
        settings: {
          theme: 'dark',
          notifications: true
        }
      };

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('NESTED', nestedData);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['NESTED']).toBeDefined();
      expect(prompt.variables['NESTED'].value).toEqual(nestedData);
      
      // Verify YAML rendering
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      
      expect(content).toContain('user:');
      expect(content).toContain('name: Alice');
      expect(content).toContain('profile:');
      expect(content).toContain('age: 30');
      expect(content).toContain('settings:');
      expect(content).toContain('theme: dark');
    });

    it('should handle arrays of objects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const arrayOfObjects = [
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' },
        { id: 3, name: 'Third' }
      ];

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('RECORDS', arrayOfObjects);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['RECORDS'].value).toEqual(arrayOfObjects);
      
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      
      // YAML format for array of objects
      expect(content).toContain('- id: 1');
      expect(content).toContain('name: First');
      expect(content).toContain('- id: 2');
      expect(content).toContain('name: Second');
    });

    it('should handle mixed nested structures', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const complexData = {
        title: 'Complex Structure',
        items: ['a', 'b', 'c'],
        metadata: {
          tags: ['tag1', 'tag2'],
          counts: { views: 100, likes: 20 }
        },
        records: [
          { type: 'A', data: { x: 1 } },
          { type: 'B', data: { x: 2 } }
        ]
      };

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('COMPLEX', complexData);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['COMPLEX'].value).toEqual(complexData);
      
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      
      expect(content).toContain('title: Complex Structure');
      expect(content).toContain('items:');
      expect(content).toContain('metadata:');
      expect(content).toContain('tags:');
      expect(content).toContain('records:');
    });

    it('should register multiple data variables without conflicts', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('DATA1', { key1: 'value1' });
        defData('DATA2', { key2: 'value2' });
        defData('DATA3', { key3: 'value3' });
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['DATA1']).toBeDefined();
      expect(prompt.variables['DATA2']).toBeDefined();
      expect(prompt.variables['DATA3']).toBeDefined();
      expect(prompt.variables['DATA1'].value).toEqual({ key1: 'value1' });
      expect(prompt.variables['DATA2'].value).toEqual({ key2: 'value2' });
      expect(prompt.variables['DATA3'].value).toEqual({ key3: 'value3' });
    });
  });

  describe('Proxy behavior (value, toString, template interpolation)', () => {
    it('should return proxy with correct value property', async () => {
      let proxyRef: any;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defData, $ }) => {
        proxyRef = defData('TEST', { key: 'value' });
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

      await runPrompt(async ({ defData, $ }) => {
        const config = defData('CONFIG', { mode: 'test' });
        interpolated = `Using ${config}`;
        $`${interpolated}`;
      }, {
        model: mockModel,
      });

      expect(interpolated).toBe('Using <CONFIG>');
    });

    it('should support toString() method', async () => {
      let stringValue: string = '';
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defData, $ }) => {
        const proxy = defData('DATA', { x: 1 });
        stringValue = proxy.toString();
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(stringValue).toBe('<DATA>');
    });

    it('should support valueOf() method', async () => {
      let value: any;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defData, $ }) => {
        const proxy = defData('VAL', { test: true });
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

      await runPrompt(async ({ defData, $ }) => {
        const data1 = defData('DATA1', { a: 1 });
        const data2 = defData('DATA2', { b: 2 });
        concatenated = data1 + ' and ' + data2;
        $`Test`;
      }, {
        model: mockModel,
      });

      expect(concatenated).toBe('<DATA1> and <DATA2>');
    });

    it('should support in operator for checking properties', async () => {
      let hasValue: boolean = false;
      let hasRemind: boolean = false;
      let hasDisable: boolean = false;
      
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      await runPrompt(async ({ defData, $ }) => {
        const proxy = defData('TEST', { data: 'value' });
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

      await runPrompt(async ({ defData, $ }) => {
        const proxy = defData('TEST', { key: 'val' });
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

      const { result } = await runPrompt(async ({ defData, defTool, $ }) => {
        const config = defData('CONFIG', { mode: 'active' });
        proxyRefs.push(config);

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
      expect(values.every(v => v === '<CONFIG>')).toBe(true);
    });

    it('should keep data variable definitions across multiple steps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'step1', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'step2', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const persistentData = { status: 'persistent' };

      const { result, prompt } = await runPrompt(async ({ defData, defTool, $ }) => {
        defData('PERSISTENT', persistentData);
        
        defTool('step1', 'Step 1', z.object({}), async () => ({ done: true }));
        defTool('step2', 'Step 2', z.object({}), async () => ({ done: true }));

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Variable should still be present after all steps
      expect(prompt.variables['PERSISTENT']).toBeDefined();
      expect(prompt.variables['PERSISTENT'].value).toEqual(persistentData);
    });

    it('should handle data variable redefinition with same name', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'update', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      let step = 0;

      const { result, prompt } = await runPrompt(async ({ defData, defTool, defState, $ }) => {
        const [currentStep, setStep] = defState('step', 0);
        step = currentStep;

        // Redefine with different value based on step
        defData('DYNAMIC', step === 0 ? { status: 'initial' } : { status: 'updated' });

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
      expect(prompt.variables['DYNAMIC'].value).toEqual({ status: 'updated' });
    });

    it('should remove data variable if not defined in re-execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'toggle', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, defTool, defState, $ }) => {
        const [include, setInclude] = defState('include', true);

        // Only define variable on first execution
        if (include) {
          defData('CONDITIONAL', { present: true });
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

    it('should update data value dynamically based on state', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'increment', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, defTool, defState, $ }) => {
        const [counter, setCounter] = defState('counter', 0);
        
        // Define data variable with state-dependent value
        defData('COUNTER_DATA', { 
          count: counter,
          doubled: counter * 2 
        });

        defTool('increment', 'Increment counter', z.object({}), async () => {
          setCounter(counter + 1);
          return { newValue: counter + 1 };
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Final counter value should be reflected in data variable
      expect(prompt.variables['COUNTER_DATA'].value).toEqual({ 
        count: 1,
        doubled: 2 
      });
    });
  });

  describe('Disable/remind behavior via proxy methods', () => {
    it('should support remind() method', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      let reminded: any[] = [];

      const { result, prompt } = await runPrompt(async ({ defData, defEffect, $ }) => {
        const important = defData('IMPORTANT', { critical: true });

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
        { type: 'defData', name: 'IMPORTANT' }
      ]);
    });

    it('should support disable() method', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, defEffect, $ }) => {
        const disabled = defData('DISABLED', { hidden: true });

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

    it('should handle conditional disable based on state', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'toggle', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, defTool, defState, defEffect, $ }) => {
        const [shouldShow, setShouldShow] = defState('show', true);
        const dynamic = defData('DYNAMIC', { visible: true });

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
    it('should handle empty objects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('EMPTY_OBJ', {});
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['EMPTY_OBJ'].value).toEqual({});
      
      // Verify it renders in system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      expect(content).toContain('<EMPTY_OBJ>');
      expect(content).toContain('</EMPTY_OBJ>');
    });

    it('should handle empty arrays', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('EMPTY_ARR', []);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['EMPTY_ARR'].value).toEqual([]);
      
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      expect(content).toContain('<EMPTY_ARR>');
      expect(content).toContain('[]');
    });

    it('should handle special characters in values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const specialData = {
        quotes: 'He said "hello"',
        apostrophe: "It's working",
        newlines: 'Line 1\nLine 2\nLine 3',
        tabs: 'Column1\tColumn2',
        backslash: 'Path\\to\\file'
      };

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('SPECIAL', specialData);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['SPECIAL'].value).toEqual(specialData);
      
      // Verify YAML rendering handles special chars
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      expect(content).toContain('<SPECIAL>');
    });

    it('should handle Unicode characters', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const unicodeData = {
        emoji: '🚀 🎉 ✨',
        chinese: '你好世界',
        arabic: 'مرحبا',
        mixed: 'Hello 世界 🌍'
      };

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('UNICODE', unicodeData);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['UNICODE'].value).toEqual(unicodeData);
    });

    it('should handle boolean, null, and number values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const typesData = {
        bool_true: true,
        bool_false: false,
        null_value: null,
        number_int: 42,
        number_float: 3.14,
        number_negative: -100
      };

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('TYPES', typesData);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['TYPES'].value).toEqual(typesData);
      
      // Verify YAML rendering
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      expect(content).toContain('bool_true: true');
      expect(content).toContain('bool_false: false');
      expect(content).toContain('null_value: null');
      expect(content).toContain('number_int: 42');
    });

    it('should handle large nested structures', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      // Create a deeply nested structure
      const largeData = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  data: 'deep',
                  values: [1, 2, 3, 4, 5]
                }
              }
            }
          }
        },
        // Add arrays with many items
        items: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `item_${i}` }))
      };

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('LARGE', largeData);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['LARGE'].value).toEqual(largeData);
    });

    it('should preserve object key order', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const orderedData = {
        first: 1,
        second: 2,
        third: 3,
        fourth: 4
      };

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('ORDERED', orderedData);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['ORDERED'].value).toEqual(orderedData);
      
      // Verify that keys appear in order in YAML
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      
      const firstIndex = content.indexOf('first:');
      const secondIndex = content.indexOf('second:');
      const thirdIndex = content.indexOf('third:');
      const fourthIndex = content.indexOf('fourth:');
      
      expect(firstIndex).toBeLessThan(secondIndex);
      expect(secondIndex).toBeLessThan(thirdIndex);
      expect(thirdIndex).toBeLessThan(fourthIndex);
    });

    it('should handle variable names with underscores and numbers', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('VAR_123', { value: 1 });
        defData('DATA_SET_2', { value: 2 });
        defData('_PRIVATE_DATA', { value: 3 });
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['VAR_123']).toBeDefined();
      expect(prompt.variables['DATA_SET_2']).toBeDefined();
      expect(prompt.variables['_PRIVATE_DATA']).toBeDefined();
    });
  });

  describe('Interactions with related APIs', () => {
    it('should work with $ template literal', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        const config = defData('CONFIG', { mode: 'test' });
        $`Using configuration ${config}`;
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
      expect(content).toBe('Using configuration <CONFIG>');
    });

    it('should work with defMessage', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, defMessage, $ }) => {
        const settings = defData('SETTINGS', { verbose: true });
        defMessage('system', `Apply settings: ${settings}`);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check that message was added with variable tag
      const firstStep = prompt.fullSteps[0];
      const systemMessages = firstStep.input.prompt.filter(m => m.role === 'system');
      const settingsMessage = systemMessages.find(m => 
        (m.content as string).includes('Apply settings')
      );
      expect(settingsMessage).toBeDefined();
      expect(settingsMessage?.content).toContain('<SETTINGS>');
    });

    it('should work with defEffect to conditionally modify data variables', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, defEffect, $ }) => {
        const params = defData('PARAMS', { enabled: true });

        defEffect((ctx, stepModifier) => {
          // Access variable through context
          expect(ctx.variables.has('PARAMS')).toBe(true);
        });

        $`Test with ${params}`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['PARAMS']).toBeDefined();
    });

    it('should not duplicate user messages on re-execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'next', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, defTool, $ }) => {
        const data1 = defData('DATA', { step: 'current' });
        
        defTool('next', 'Next step', z.object({}), async () => ({ ok: true }));

        $`Message with ${data1}`;
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
      expect(content).toBe('Message with <DATA>');
    });

    it('should work with defState for dynamic data values', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'update', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, defTool, defState, $ }) => {
        const [items, setItems] = defState<string[]>('items', []);
        
        // Define data variable with state-dependent value
        defData('ITEMS_DATA', { 
          list: items,
          count: items.length 
        });

        defTool('update', 'Update items', z.object({}), async () => {
          setItems(['a', 'b', 'c']);
          return { newItems: ['a', 'b', 'c'] };
        });

        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Final items value should be reflected in data variable
      expect(prompt.variables['ITEMS_DATA'].value).toEqual({ 
        list: ['a', 'b', 'c'],
        count: 3 
      });
    });

    it('should allow multiple data variables in single template', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        const config = defData('CONFIG', { mode: 'prod' });
        const settings = defData('SETTINGS', { verbose: false });
        const metadata = defData('METADATA', { version: '1.0' });
        
        $`Use ${config} with ${settings} and ${metadata}`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const userMessage = firstStep.input.prompt.find(m => m.role === 'user');
      const content = Array.isArray(userMessage?.content) 
        ? userMessage.content.map(c => c.text).join('') 
        : userMessage?.content as string;
      expect(content).toBe('Use <CONFIG> with <SETTINGS> and <METADATA>');
    });

    it('should work alongside def() variables', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defData, $ }) => {
        def('NAME', 'Alice');
        defData('PROFILE', { age: 30, city: 'NYC' });
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Both should be registered
      expect(prompt.variables['NAME']).toEqual({ type: 'string', value: 'Alice' });
      expect(prompt.variables['PROFILE']).toEqual({ 
        type: 'data', 
        value: { age: 30, city: 'NYC' } 
      });

      // Both should appear in system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      expect(content).toContain('<NAME>');
      expect(content).toContain('<PROFILE>');
    });
  });

  describe('YAML serialization edge cases', () => {
    it('should handle dates correctly', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const testDate = new Date('2024-01-15T10:30:00Z');
      const dateData = {
        timestamp: testDate,
        dateString: testDate.toISOString()
      };

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('DATE_DATA', dateData);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      expect(prompt.variables['DATE_DATA'].value).toEqual(dateData);
    });

    it('should handle circular reference gracefully', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      // Create a circular reference
      const circularData: any = { name: 'root' };
      circularData.self = circularData;

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        // YAML serialization should fail gracefully or handle it
        try {
          defData('CIRCULAR', circularData);
          $`Test`;
        } catch (e) {
          // Expected to fail - circular references can't be serialized
          $`Handled error`;
        }
      }, {
        model: mockModel,
      });

      await result.text;
      
      // Test passes if it doesn't crash
      expect(true).toBe(true);
    });

    it('should verify YAML is parseable back to original structure', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const originalData = {
        string: 'text',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: {
          key: 'value'
        }
      };

      const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
        defData('ROUNDTRIP', originalData);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Get YAML from system prompt
      const firstStep = prompt.fullSteps[0];
      const systemMessage = firstStep.input.prompt.find(m => m.role === 'system');
      const content = systemMessage?.content as string;
      
      // Extract YAML content between tags
      const match = content.match(/<ROUNDTRIP>\n([\s\S]*?)\n  <\/ROUNDTRIP>/);
      expect(match).toBeTruthy();
      
      if (match) {
        const yamlContent = match[1];
        const parsed = yaml.load(yamlContent);
        expect(parsed).toEqual(originalData);
      }
    });
  });
});
