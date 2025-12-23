import { describe, it, expect } from 'vitest';
import { StateManager, createStateProxy } from './StateManager';

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
    const [value] = manager.createStateAccessor('count', 0);

    // Initial value should be accessible
    expect(String(value)).toBe('0');
  });

  it('should update state via setter', () => {
    const manager = new StateManager();
    const [value, setValue] = manager.createStateAccessor('count', 0);

    setValue(5);
    expect(manager.get('count')).toBe(5);
  });

  it('should update state via function setter', () => {
    const manager = new StateManager();
    const [, setValue] = manager.createStateAccessor('count', 10);

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
});

describe('createStateProxy', () => {
  it('should convert to string via toString', () => {
    const proxy = createStateProxy(() => 'hello');
    expect(proxy.toString()).toBe('hello');
  });

  it('should convert to primitive via valueOf', () => {
    const proxy = createStateProxy(() => 42);
    expect(proxy.valueOf()).toBe(42);
  });

  it('should work in template literals', () => {
    const proxy = createStateProxy(() => 'world');
    expect(`Hello ${proxy}`).toBe('Hello world');
  });

  it('should allow property access on object state', () => {
    const proxy = createStateProxy(() => ({ name: 'test', value: 123 }));
    expect((proxy as any).name).toBe('test');
    expect((proxy as any).value).toBe(123);
  });

  it('should support has check for object properties', () => {
    const proxy = createStateProxy(() => ({ name: 'test' }));
    expect('name' in proxy).toBe(true);
    expect('missing' in proxy).toBe(false);
  });
});
