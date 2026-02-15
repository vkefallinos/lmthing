/**
 * Unit tests for checkpoint plugin
 */

import { describe, it, expect } from 'vitest';
import { createMockModel } from '../test/createMockModel';
import { runPrompt } from '../runPrompt';
import { checkpointPlugin } from './checkpoint';
import type { CheckpointManager } from './checkpoint';

describe('checkpointPlugin', () => {
  it('should create a checkpoint manager', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    let manager: CheckpointManager | undefined;

    const { result } = await runPrompt(
      async ({ defCheckpoint, $ }) => {
        manager = defCheckpoint();
        $`Hello`;
      },
      { model: mockModel, plugins: [checkpointPlugin] }
    );

    await result.text;

    expect(manager).toBeDefined();
    expect(typeof manager!.save).toBe('function');
    expect(typeof manager!.rewind).toBe('function');
    expect(typeof manager!.list).toBe('function');
    expect(typeof manager!.delete).toBe('function');
  });

  it('should save and list checkpoints', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    let manager: CheckpointManager | undefined;

    const { result } = await runPrompt(
      async ({ defCheckpoint, $ }) => {
        manager = defCheckpoint();

        const cp = manager.save('initial');
        expect(cp.label).toBe('initial');
        expect(cp.timestamp).toBeGreaterThan(0);

        $`Hello`;
      },
      { model: mockModel, plugins: [checkpointPlugin] }
    );

    await result.text;

    const checkpoints = manager!.list();
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0].label).toBe('initial');
  });

  it('should delete checkpoints', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    let manager: CheckpointManager | undefined;

    const { result } = await runPrompt(
      async ({ defCheckpoint, $ }) => {
        manager = defCheckpoint();
        manager.save('cp1');
        manager.save('cp2');

        expect(manager.list().length).toBe(2);

        const deleted = manager.delete('cp1');
        expect(deleted).toBe(true);
        expect(manager.list().length).toBe(1);
        expect(manager.list()[0].label).toBe('cp2');

        $`Hello`;
      },
      { model: mockModel, plugins: [checkpointPlugin] }
    );

    await result.text;
  });

  it('should return false when deleting non-existent checkpoint', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    let manager: CheckpointManager | undefined;

    const { result } = await runPrompt(
      async ({ defCheckpoint, $ }) => {
        manager = defCheckpoint();
        const deleted = manager.delete('nonexistent');
        expect(deleted).toBe(false);

        $`Hello`;
      },
      { model: mockModel, plugins: [checkpointPlugin] }
    );

    await result.text;
  });

  it('should return false when rewinding to non-existent checkpoint', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    let manager: CheckpointManager | undefined;

    const { result } = await runPrompt(
      async ({ defCheckpoint, $ }) => {
        manager = defCheckpoint();
        const rewound = manager.rewind('nonexistent');
        expect(rewound).toBe(false);

        $`Hello`;
      },
      { model: mockModel, plugins: [checkpointPlugin] }
    );

    await result.text;
  });

  it('should overwrite checkpoint with same label', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Hello!' },
    ]);

    let manager: CheckpointManager | undefined;

    const { result } = await runPrompt(
      async ({ defCheckpoint, $ }) => {
        manager = defCheckpoint();

        manager.save('cp1');
        expect(manager.list().length).toBe(1);

        // Save again with same label - should overwrite
        manager.save('cp1');
        expect(manager.list().length).toBe(1);

        $`Hello`;
      },
      { model: mockModel, plugins: [checkpointPlugin] }
    );

    await result.text;
  });
});
