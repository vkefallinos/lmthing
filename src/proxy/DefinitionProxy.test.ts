import { describe, it, expect } from 'vitest';
import { createDefinitionProxy, type DefType } from './DefinitionProxy';

describe('createDefinitionProxy', () => {
  it('returns tag value from .value property', () => {
    const proxy = createDefinitionProxy({
      tag: '<USER>',
      type: 'def',
      name: 'USER',
      onRemind: () => {},
      onDisable: () => {},
    });

    expect(proxy.value).toBe('<USER>');
  });

  it('returns tag when used in string coercion', () => {
    const proxy = createDefinitionProxy({
      tag: '<NAME>',
      type: 'def',
      name: 'NAME',
      onRemind: () => {},
      onDisable: () => {},
    });

    expect(`Hello ${proxy}`).toBe('Hello <NAME>');
    expect(proxy.toString()).toBe('<NAME>');
    expect(proxy.valueOf()).toBe('<NAME>');
  });

  it('calls onRemind when .remind() is invoked', () => {
    let reminded = false;
    const proxy = createDefinitionProxy({
      tag: '<TOOL>',
      type: 'defTool',
      name: 'TOOL',
      onRemind: () => { reminded = true; },
      onDisable: () => {},
    });

    proxy.remind();
    expect(reminded).toBe(true);
  });

  it('calls onDisable when .disable() is invoked', () => {
    let disabled = false;
    const proxy = createDefinitionProxy({
      tag: '<SYS>',
      type: 'defSystem',
      name: 'SYS',
      onRemind: () => {},
      onDisable: () => { disabled = true; },
    });

    proxy.disable();
    expect(disabled).toBe(true);
  });

  it('returns tag for unknown properties', () => {
    const proxy = createDefinitionProxy({
      tag: '<X>',
      type: 'def',
      name: 'X',
      onRemind: () => {},
      onDisable: () => {},
    });

    expect(proxy.unknownProp).toBe('<X>');
  });

  it('supports ownKeys enumeration', () => {
    const proxy = createDefinitionProxy({
      tag: '<Y>',
      type: 'def',
      name: 'Y',
      onRemind: () => {},
      onDisable: () => {},
    });

    const keys = Object.keys(proxy);
    expect(keys).toContain('value');
    expect(keys).toContain('remind');
    expect(keys).toContain('disable');
  });

  it('supports in operator', () => {
    const proxy = createDefinitionProxy({
      tag: '<Z>',
      type: 'def',
      name: 'Z',
      onRemind: () => {},
      onDisable: () => {},
    });

    expect('value' in proxy).toBe(true);
    expect('remind' in proxy).toBe(true);
    expect('disable' in proxy).toBe(true);
    expect('toString' in proxy).toBe(true);
    expect('nonexistent' in proxy).toBe(false);
  });
});
