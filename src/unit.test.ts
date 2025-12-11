import { describe, it, expect, vi } from 'vitest';
import { Prompt, tool, agent } from './StatefulPrompt';
import { createMockModel } from './test/createMockModel';
import { z } from 'zod';
import { runPrompt } from './runPrompt';

describe('defEffect', () => {
  it('should run on every step', async () => {
  });
  it('should access updated state[set state,read state]', async () => {})
  it('should work with plugins', async () => {})
  it('should work with agents[disable,remind]', async () => {})
});