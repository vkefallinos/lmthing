import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { runPrompt } from './runPrompt';
import { createMockModel } from './test/createMockModel';
import { tool } from './StatefulPrompt';

describe('defTool end-to-end behavior', () => {
  it('reconciles tool definitions across step re-executions', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'step 0' },
      { type: 'tool-call', toolCallId: 'c1', toolName: 'alpha', args: { value: 1 } },
      { type: 'text', text: 'step 1' },
      { type: 'tool-call', toolCallId: 'c2', toolName: 'beta', args: { value: 2 } },
      { type: 'text', text: 'done' }
    ]);

    const alphaExecute = vi.fn(async ({ value }: { value: number }) => ({ alpha: value }));
    const betaExecute = vi.fn(async ({ value }: { value: number }) => ({ beta: value }));

    const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
      const [mode, setMode] = defState<'alpha' | 'beta'>('mode', 'alpha');

      if (mode === 'alpha') {
        defTool('alpha', 'Alpha tool', z.object({ value: z.number() }), async ({ value }) => {
          const output = await alphaExecute({ value });
          setMode('beta');
          return output;
        });
      } else {
        defTool('beta', 'Beta tool', z.object({ value: z.number() }), betaExecute);
      }

      $`switching tools`;
    }, { model: mockModel });

    await result.text;

    expect(alphaExecute).toHaveBeenCalledTimes(1);
    expect(betaExecute).toHaveBeenCalledTimes(1);

    const stepWithAlpha = prompt.steps.find(step =>
      step.output.content.some((c: any) => c.type === 'tool-call' && c.toolName === 'alpha')
    );
    const stepWithBeta = prompt.steps.find(step =>
      step.output.content.some((c: any) => c.type === 'tool-call' && c.toolName === 'beta')
    );

    expect(stepWithAlpha?.activeTools).toEqual(['alpha']);
    expect(stepWithBeta?.activeTools).toEqual(['beta']);
  });

  it('dispatches composite sub-tools with callback overrides and keeps tool results structured', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'composite' },
      {
        type: 'tool-call',
        toolCallId: 'combo1',
        toolName: 'combo',
        args: {
          calls: [
            { name: 'first', args: { value: 1 } },
            { name: 'second', args: { value: 0 } }
          ]
        }
      },
      { type: 'text', text: 'after' }
    ]);

    const firstExecute = vi.fn(async ({ value }: { value: number }) => ({ first: value }));
    const secondExecute = vi.fn(async ({ value }: { value: number }) => ({ second: value }));

    const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
      defTool('combo', 'Composite tool', [
        tool(
          'first',
          'First sub-tool',
          z.object({ value: z.number() }),
          async ({ value }) => firstExecute({ value }),
          {
            beforeCall: async () => ({ cached: true })
          }
        ),
        tool(
          'second',
          'Second sub-tool',
          z.object({ value: z.number() }),
          async ({ value }) => {
            if (value === 0) throw new Error('boom');
            return secondExecute({ value });
          },
          {
            onError: async (_input, error) => ({ recovered: true, message: error.error })
          }
        )
      ]);

      $`use combo`;
    }, { model: mockModel });

    await result.text;

    expect(firstExecute).not.toHaveBeenCalled();
    expect(secondExecute).not.toHaveBeenCalled();

    const stepWithToolResult = prompt.steps.find(step =>
      step.input.prompt.some((msg: any) => msg.role === 'tool')
    );

    const toolMessage = stepWithToolResult?.input.prompt.find((msg: any) => msg.role === 'tool');
    const toolResultPart = toolMessage?.content.find((part: any) => part.type === 'tool-result');
    const outputValue = toolResultPart?.output?.value ?? toolResultPart?.output;

    expect(outputValue).toEqual({
      results: [
        { name: 'first', result: { cached: true } },
        { name: 'second', result: { recovered: true, message: 'boom' } }
      ]
    });
  });
});
