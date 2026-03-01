/**
 * Comprehensive tests for defMessage() method validation
 * 
 * These tests deeply validate that defMessage(role, content) correctly:
 * - Appends explicit conversation messages
 * - Respects anti-duplication behavior under prompt re-execution
 * - Handles user vs assistant messages differently
 * - Maintains correct message ordering with $ template messages
 * - Handles edge cases for repeated identical content and interleaved definitions
 * 
 * Related to issue #55
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockModel } from './test/createMockModel';
import { runPrompt } from './runPrompt';
import { z } from 'zod';

// Helper function to extract message content (handles both string and array formats)
function getMessageContent(message: any): string {
  if (!message || !message.content) return '';
  return Array.isArray(message.content) 
    ? message.content.map((c: any) => c.text).join('') 
    : message.content as string;
}

describe('defMessage() method validation', () => {
  describe('User message insertion and deduplication', () => {
    it('should add user message on first execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Hello' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        defMessage('user', 'First user message');
        $`Second user message`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check messages in first step
      const firstStep = prompt.fullSteps[0];
      const userMessages = firstStep.input.prompt.filter(m => m.role === 'user');
      
      expect(userMessages).toHaveLength(2);
      expect(getMessageContent(userMessages[0])).toBe('First user message');
      expect(getMessageContent(userMessages[1])).toBe('Second user message');
    });

    it('should deduplicate user messages on re-execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'First response' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'testTool', args: {} },
        { type: 'text', text: 'Second response' }
      ]);

      let executionCount = 0;

      const { result, prompt } = await runPrompt(async ({ defMessage, defTool, $ }) => {
        executionCount++;
        
        // These user messages should only appear once
        defMessage('user', 'User message from defMessage');
        $`User message from template`;
        
        defTool('testTool', 'Test tool', z.object({}), async () => {
          return { success: true };
        });
      }, {
        model: mockModel,
      });

      await result.text;

      // Prompt function should execute multiple times due to tool call
      expect(executionCount).toBeGreaterThan(1);

      // Count all user messages across all steps
      let totalUserMessages = 0;
      let defMessageCount = 0;
      let templateMessageCount = 0;

      for (const step of prompt.fullSteps) {
        const userMessages = step.input.prompt.filter(m => m.role === 'user');
        totalUserMessages += userMessages.length;
        
        userMessages.forEach(msg => {
          const content = getMessageContent(msg);
          if (content === 'User message from defMessage') {
            defMessageCount++;
          }
          if (content === 'User message from template') {
            templateMessageCount++;
          }
        });
      }

      // NOTE: This test documents actual behavior where defMessage adds message once per step
      // The first step has both messages, subsequent steps continue to have them
      // This is expected based on how _executedOnce works - it blocks adding NEW messages,
      // but messages already in the array persist across steps
      
      // Check that messages appear in first step
      const firstStep = prompt.fullSteps[0];
      const firstStepUserMessages = firstStep.input.prompt.filter(m => m.role === 'user');
      expect(firstStepUserMessages).toHaveLength(2);
      
      // Messages from first step persist to subsequent steps (conversation history)
      // but are not added AGAIN on re-execution
      for (let i = 1; i < prompt.fullSteps.length; i++) {
        const stepUserMessages = prompt.fullSteps[i].input.prompt.filter(m => m.role === 'user');
        // Should still have 2 messages (not 4, 6, etc.)
        expect(stepUserMessages).toHaveLength(2);
      }
    });

    it('should handle multiple distinct user messages without duplication', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'tool1', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, defTool, $ }) => {
        defMessage('user', 'Message 1');
        defMessage('user', 'Message 2');
        defMessage('user', 'Message 3');
        $`Template message`;
        
        defTool('tool1', 'Tool 1', z.object({}), async () => ({ ok: true }));
      }, {
        model: mockModel,
      });

      await result.text;

      // Check first step (initial execution)
      const firstStep = prompt.fullSteps[0];
      const userMessagesStep0 = firstStep.input.prompt.filter(m => m.role === 'user');
      
      // All user messages should be present in first step
      expect(userMessagesStep0).toHaveLength(4);
      expect(getMessageContent(userMessagesStep0[0])).toBe('Message 1');
      expect(getMessageContent(userMessagesStep0[1])).toBe('Message 2');
      expect(getMessageContent(userMessagesStep0[2])).toBe('Message 3');
      expect(getMessageContent(userMessagesStep0[3])).toBe('Template message');

      // Check if there are multiple steps
      if (prompt.fullSteps.length > 1) {
        // In subsequent steps, user messages should not be duplicated
        const secondStep = prompt.fullSteps[1];
        const userMessagesStep1 = secondStep.input.prompt.filter(m => m.role === 'user');
        
        // Should still have the same 4 messages (not 8)
        expect(userMessagesStep1).toHaveLength(4);
      }
    });
  });

  describe('Assistant message behavior', () => {
    it('should add assistant message on first execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        defMessage('assistant', 'Assistant context');
        $`User message`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const assistantMessages = firstStep.input.prompt.filter(m => m.role === 'assistant');
      
      expect(assistantMessages).toHaveLength(1);
      expect(getMessageContent(assistantMessages[0])).toBe('Assistant context');
    });

    it('should NOT deduplicate assistant messages on re-execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'First' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 't1', args: {} },
        { type: 'text', text: 'Second' }
      ]);

      let executionCount = 0;

      const { result, prompt } = await runPrompt(async ({ defMessage, defTool, $ }) => {
        executionCount++;
        
        // Assistant messages are NOT deduplicated
        defMessage('assistant', 'Assistant message');
        $`User message`;
        
        defTool('t1', 'Tool', z.object({}), async () => ({ ok: true }));
      }, {
        model: mockModel,
      });

      await result.text;

      expect(executionCount).toBeGreaterThan(1);

      // Count assistant messages with specific content across all steps
      let assistantMessageCount = 0;
      for (const step of prompt.fullSteps) {
        const assistantMessages = step.input.prompt.filter(m => 
          m.role === 'assistant' && getMessageContent(m) === 'Assistant message'
        );
        assistantMessageCount += assistantMessages.length;
      }

      // Assistant messages ARE added on each re-execution
      // This is expected behavior but could lead to duplication
      expect(assistantMessageCount).toBeGreaterThan(1);
    });

    it('should allow multiple assistant messages in single execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        defMessage('assistant', 'First assistant message');
        defMessage('assistant', 'Second assistant message');
        $`User message`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const assistantMessages = firstStep.input.prompt.filter(m => m.role === 'assistant');
      
      expect(assistantMessages).toHaveLength(2);
      expect(getMessageContent(assistantMessages[0])).toBe('First assistant message');
      expect(getMessageContent(assistantMessages[1])).toBe('Second assistant message');
    });
  });

  describe('Message ordering with $ template messages', () => {
    it('should maintain insertion order between defMessage and $', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        defMessage('user', 'Message 1');
        $`Message 2`;
        defMessage('user', 'Message 3');
        $`Message 4`;
        defMessage('assistant', 'Message 5');
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const messages = firstStep.input.prompt.filter(m => 
        m.role === 'user' || m.role === 'assistant'
      );
      
      expect(messages).toHaveLength(5);
      expect(messages[0].role).toBe('user');
      expect(getMessageContent(messages[0])).toBe('Message 1');
      expect(messages[1].role).toBe('user');
      expect(getMessageContent(messages[1])).toBe('Message 2');
      expect(messages[2].role).toBe('user');
      expect(getMessageContent(messages[2])).toBe('Message 3');
      expect(messages[3].role).toBe('user');
      expect(getMessageContent(messages[3])).toBe('Message 4');
      expect(messages[4].role).toBe('assistant');
      expect(getMessageContent(messages[4])).toBe('Message 5');
    });

    it('should maintain order with interleaved definitions', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defMessage, $ }) => {
        const var1 = def('VAR1', 'value1');
        defMessage('user', `First message with ${var1}`);
        
        const var2 = def('VAR2', 'value2');
        $`Second message with ${var2}`;
        
        defMessage('assistant', 'Assistant response');
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const messages = firstStep.input.prompt.filter(m => 
        m.role === 'user' || m.role === 'assistant'
      );
      
      expect(messages).toHaveLength(3);
      expect(getMessageContent(messages[0])).toBe('First message with <VAR1>');
      expect(getMessageContent(messages[1])).toBe('Second message with <VAR2>');
      expect(getMessageContent(messages[2])).toBe('Assistant response');
    });
  });

  describe('Edge cases for repeated identical content', () => {
    it('should handle repeated identical user message calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        // Call with same content multiple times in same execution
        defMessage('user', 'Same message');
        defMessage('user', 'Same message');
        defMessage('user', 'Same message');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const userMessages = firstStep.input.prompt.filter(m => 
        m.role === 'user' && getMessageContent(m) === 'Same message'
      );
      
      // All three calls should add messages (no content-based deduplication)
      expect(userMessages).toHaveLength(3);
    });

    it('should handle repeated identical assistant messages', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        defMessage('assistant', 'Repeated assistant');
        defMessage('assistant', 'Repeated assistant');
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const assistantMessages = firstStep.input.prompt.filter(m => 
        m.role === 'assistant' && getMessageContent(m) === 'Repeated assistant'
      );
      
      // All calls should add messages
      expect(assistantMessages).toHaveLength(2);
    });

    it('should handle empty string content', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        defMessage('user', '');
        defMessage('assistant', '');
        $`Non-empty message`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const messages = firstStep.input.prompt;
      
      const emptyUserMsg = messages.find(m => m.role === 'user' && getMessageContent(m) === '');
      const emptyAssistantMsg = messages.find(m => m.role === 'assistant' && getMessageContent(m) === '');
      
      // Empty messages should still be added
      expect(emptyUserMsg).toBeDefined();
      expect(emptyAssistantMsg).toBeDefined();
    });

    it('should handle whitespace-only content', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        defMessage('user', '   ');
        defMessage('assistant', '\n\t\n');
        $`Regular message`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const messages = firstStep.input.prompt;
      
      const whitespaceUserMsg = messages.find(m => m.role === 'user' && getMessageContent(m) === '   ');
      const whitespaceAssistantMsg = messages.find(m => m.role === 'assistant' && getMessageContent(m) === '\n\t\n');
      
      // Whitespace messages should be added as-is
      expect(whitespaceUserMsg).toBeDefined();
      expect(whitespaceAssistantMsg).toBeDefined();
    });
  });

  describe('Proxy variable interpolation', () => {
    it('should interpolate def() proxy in defMessage', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defMessage, $ }) => {
        const userName = def('USER_NAME', 'Alice');
        const userAge = def('USER_AGE', '30');
        
        defMessage('user', `Hello ${userName}, you are ${userAge} years old`);
        $`Process user info`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const userMessages = firstStep.input.prompt.filter(m => m.role === 'user');
      
      // Should have interpolated the proxy variables
      expect(getMessageContent(userMessages[0])).toBe('Hello <USER_NAME>, you are <USER_AGE> years old');
    });

    it('should interpolate defData() proxy in defMessage', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defData, defMessage, $ }) => {
        const config = defData('CONFIG', { debug: true, level: 5 });
        
        defMessage('user', `Use settings: ${config}`);
        $`Process`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const userMessages = firstStep.input.prompt.filter(m => m.role === 'user');
      
      expect(getMessageContent(userMessages[0])).toBe('Use settings: <CONFIG>');
    });

    it('should handle multiple proxy interpolations', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defData, defMessage, $ }) => {
        const name = def('NAME', 'Bob');
        const age = def('AGE', '25');
        const settings = defData('SETTINGS', { theme: 'dark' });
        
        defMessage('user', `User ${name} (${age}) with ${settings}`);
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const userMessages = firstStep.input.prompt.filter(m => m.role === 'user');
      
      expect(getMessageContent(userMessages[0])).toBe('User <NAME> (<AGE>) with <SETTINGS>');
    });
  });

  describe('Message history in recorded steps', () => {
    it('should record user messages in step history', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        defMessage('user', 'Explicit user message');
        $`Template user message`;
      }, {
        model: mockModel,
      });

      await result.text;

      // Check simplified steps
      expect(prompt.steps).toHaveLength(1);
      expect(prompt.steps[0].input.prompt).toBeDefined();
      
      const userMessages = prompt.steps[0].input.prompt.filter(m => m.role === 'user');
      expect(userMessages).toHaveLength(2);
    });

    it('should record assistant messages in step history', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Model response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        defMessage('assistant', 'Injected assistant message');
        $`User message`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.steps[0];
      const inputAssistantMessages = firstStep.input.prompt.filter(m => m.role === 'assistant');
      
      expect(inputAssistantMessages).toHaveLength(1);
      expect(getMessageContent(inputAssistantMessages[0])).toBe('Injected assistant message');
    });

    it('should show conversation structure across multiple steps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'First' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'tool1', args: { x: 1 } },
        { type: 'text', text: 'Second' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'tool1', args: { x: 2 } },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, defTool, $ }) => {
        defMessage('user', 'Initial request');
        $`Process this`;
        
        defTool('tool1', 'Test tool', z.object({ x: z.number() }), async ({ x }) => {
          return { result: x * 2 };
        });
      }, {
        model: mockModel,
      });

      await result.text;

      // Should have multiple steps due to tool calls
      expect(prompt.steps.length).toBeGreaterThan(1);
      
      // First step should have user messages
      const step0UserMsgs = prompt.steps[0].input.prompt.filter(m => m.role === 'user');
      expect(step0UserMsgs).toHaveLength(2);
      
      // Subsequent steps should maintain conversation history
      for (let i = 1; i < prompt.steps.length; i++) {
        const stepUserMsgs = prompt.steps[i].input.prompt.filter(m => m.role === 'user');
        // User messages should persist but not duplicate
        expect(stepUserMsgs).toHaveLength(2);
      }
    });

    it('should verify no message inflation across steps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'R1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 't1', args: {} },
        { type: 'text', text: 'R2' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 't1', args: {} },
        { type: 'text', text: 'R3' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, defTool, $ }) => {
        defMessage('user', 'Fixed user message');
        $`Template message`;
        
        defTool('t1', 'Tool', z.object({}), async () => ({ ok: true }));
      }, {
        model: mockModel,
      });

      await result.text;

      // Track user message count across steps
      const userMessageCounts = prompt.steps.map(step => 
        step.input.prompt.filter(m => m.role === 'user').length
      );

      // All steps should have the same number of user messages (no inflation)
      const firstCount = userMessageCounts[0];
      expect(firstCount).toBe(2); // Should have exactly 2 user messages
      
      for (const count of userMessageCounts) {
        expect(count).toBe(firstCount); // No message inflation
      }
    });
  });

  describe('Role handling limitations', () => {
    it('should only accept user and assistant roles', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'OK' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        // TypeScript should enforce this, but let's test runtime behavior
        defMessage('user', 'Valid user');
        defMessage('assistant', 'Valid assistant');
        // Note: 'system' role is not allowed by type signature
        $`Test`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const messages = firstStep.input.prompt.filter(m => 
        m.role === 'user' || m.role === 'assistant'
      );
      
      expect(messages).toHaveLength(3); // 2 defMessage + 1 $
    });

    it('should handle conditional message insertion', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const condition = true;

      const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
        if (condition) {
          defMessage('user', 'Conditional message');
        }
        $`Always present`;
      }, {
        model: mockModel,
      });

      await result.text;

      const firstStep = prompt.fullSteps[0];
      const userMessages = firstStep.input.prompt.filter(m => m.role === 'user');
      
      expect(userMessages).toHaveLength(2);
      expect(getMessageContent(userMessages[0])).toBe('Conditional message');
    });
  });
});
