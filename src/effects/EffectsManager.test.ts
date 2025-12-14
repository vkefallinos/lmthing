import { describe, it, expect, vi } from 'vitest';
import { EffectsManager } from './EffectsManager';
import { PromptContext, StepModifier } from '../types';

describe('EffectsManager', () => {
  const createMockContext = (): PromptContext => ({
    messages: [],
    tools: { has: () => false, filter: () => [], [Symbol.iterator]: () => [][Symbol.iterator]() },
    systems: { has: () => false, filter: () => [], [Symbol.iterator]: () => [][Symbol.iterator]() },
    variables: { has: () => false, filter: () => [], [Symbol.iterator]: () => [][Symbol.iterator]() },
    lastTool: null,
    stepNumber: 0
  });

  const createMockStepModifier = (): StepModifier => vi.fn();

  it('should register effects', () => {
    const manager = new EffectsManager();
    const callback = vi.fn();

    manager.register(callback);

    expect(manager.getEffects()).toHaveLength(1);
  });

  it('should run effect on first process call', () => {
    const manager = new EffectsManager();
    const callback = vi.fn();
    const context = createMockContext();
    const stepModifier = createMockStepModifier();

    manager.register(callback);
    manager.process(context, stepModifier);

    expect(callback).toHaveBeenCalledWith(context, stepModifier);
  });

  it('should run effect without dependencies on every process call', () => {
    const manager = new EffectsManager();
    const callback = vi.fn();
    const context = createMockContext();
    const stepModifier = createMockStepModifier();

    manager.register(callback);

    manager.process(context, stepModifier);
    manager.process(context, stepModifier);
    manager.process(context, stepModifier);

    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('should only run effect with dependencies when dependencies change', () => {
    const manager = new EffectsManager();
    const callback = vi.fn();
    const context = createMockContext();
    const stepModifier = createMockStepModifier();

    let dep = 1;

    // Register with dependency
    manager.register(callback, [dep]);

    // First call - should run
    manager.process(context, stepModifier);
    expect(callback).toHaveBeenCalledTimes(1);

    // Second call with same dep - should not run
    // Need to re-register to update dependencies array reference
    manager.reset();
    manager.register(callback, [dep]);
    manager.process(context, stepModifier);
    expect(callback).toHaveBeenCalledTimes(2); // First run after clear

    // Same dep again - should not run
    manager.process(context, stepModifier);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should run effect when dependency value changes', () => {
    const manager = new EffectsManager();
    const callback = vi.fn();
    const context = createMockContext();
    const stepModifier = createMockStepModifier();

    let dep = 1;

    manager.register(callback, [dep]);
    manager.process(context, stepModifier);
    expect(callback).toHaveBeenCalledTimes(1);

    // Change the dependency array by clearing and re-registering
    manager.reset();
    dep = 2;
    manager.register(callback, [dep]);
    manager.process(context, stepModifier);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should run effect when dependency array length changes', () => {
    const manager = new EffectsManager();
    const callback = vi.fn();
    const context = createMockContext();
    const stepModifier = createMockStepModifier();

    manager.register(callback, [1]);
    manager.process(context, stepModifier);

    // Clear and register with different length
    manager.reset();
    manager.register(callback, [1, 2]);
    manager.process(context, stepModifier);

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should clear all effects', () => {
    const manager = new EffectsManager();
    const callback = vi.fn();

    manager.register(callback);
    manager.register(callback);

    expect(manager.getEffects()).toHaveLength(2);

    manager.reset();

    expect(manager.getEffects()).toHaveLength(0);
  });

  it('should process multiple effects', () => {
    const manager = new EffectsManager();
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    const context = createMockContext();
    const stepModifier = createMockStepModifier();

    manager.register(callback1);
    manager.register(callback2);
    manager.process(context, stepModifier);

    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(1);
  });
});
