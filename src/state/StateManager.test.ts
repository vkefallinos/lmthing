import { describe, it, expect } from 'vitest';
import { StateManager } from './StateManager';

describe('StateManager', () => {
  it('should store and retrieve state', () => {
    const manager = new StateManager();
    manager.set('test', 'value');
    expect(manager.get('test')).toBe('value');
  });

  it('should check if state exists', () => {
    const manager = new StateManager();
    expect(manager.has('test')).toBe(false);
    manager.set('test', 'value');
    expect(manager.has('test')).toBe(true);
  });

  it('should create state accessor with initial value', () => {
    const manager = new StateManager();
    const [value, setValue] = manager.createStateAccessor('count', 0);

    // Value should be the actual value, not a proxy
    expect(value).toBe(0);
  });

  it('should update state via setter', () => {
    const manager = new StateManager();
    const [value, setValue] = manager.createStateAccessor('count', 0);

    setValue(5);
    expect(manager.get('count')).toBe(5);
  });

  it('should update state via function setter', () => {
    const manager = new StateManager();
    const [value, setValue] = manager.createStateAccessor('count', 10);

    setValue((prev) => prev + 5);
    expect(manager.get('count')).toBe(15);
  });

  it('should not reinitialize existing state', () => {
    const manager = new StateManager();
    manager.set('existing', 'original');

    const [value, setValue] = manager.createStateAccessor('existing', 'new');
    expect(manager.get('existing')).toBe('original');
  });

  it('should clear all state', () => {
    const manager = new StateManager();
    manager.set('a', 1);
    manager.set('b', 2);

    manager.clear();

    expect(manager.has('a')).toBe(false);
    expect(manager.has('b')).toBe(false);
  });

  it('should work with strict equality for state values', () => {
    const manager = new StateManager();
    const [value, setValue] = manager.createStateAccessor('phase', 'initialization');

    // Strict equality should work since we return actual values
    expect(value === 'initialization').toBe(true);
    expect(value).toBe('initialization');
  });

  it('should work in template literals', () => {
    const manager = new StateManager();
    const [value, setValue] = manager.createStateAccessor('name', 'world');

    expect(`Hello ${value}`).toBe('Hello world');
  });
});
