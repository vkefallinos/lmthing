import { describe, it, expect } from 'vitest';
import { createToolCollection, createSystemCollection, createVariableCollection } from './index';

describe('createToolCollection', () => {
  it('should check if tool exists', () => {
    const collection = createToolCollection({
      search: { description: 'Search tool' },
      calculate: { description: 'Calculate tool' }
    });

    expect(collection.has('search')).toBe(true);
    expect(collection.has('unknown')).toBe(false);
  });

  it('should filter tools', () => {
    const collection = createToolCollection({
      search: { description: 'Search tool', type: 'query' },
      calculate: { description: 'Calculate tool', type: 'math' }
    });

    const mathTools = collection.filter((t: any) => t.type === 'math');
    expect(mathTools).toHaveLength(1);
    expect(mathTools[0].name).toBe('calculate');
  });

  it('should be iterable', () => {
    const collection = createToolCollection({
      search: { description: 'Search tool' },
      calculate: { description: 'Calculate tool' }
    });

    const names = [...collection].map((t: any) => t.name);
    expect(names).toContain('search');
    expect(names).toContain('calculate');
  });
});

describe('createSystemCollection', () => {
  it('should check if system exists', () => {
    const collection = createSystemCollection({
      role: 'You are helpful',
      guidelines: 'Be concise'
    });

    expect(collection.has('role')).toBe(true);
    expect(collection.has('unknown')).toBe(false);
  });

  it('should filter systems', () => {
    const collection = createSystemCollection({
      role: 'You are helpful',
      guidelines: 'Be concise'
    });

    const filtered = collection.filter(s => s.value.includes('helpful'));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('role');
  });

  it('should be iterable', () => {
    const collection = createSystemCollection({
      role: 'You are helpful',
      guidelines: 'Be concise'
    });

    const names = [...collection].map(s => s.name);
    expect(names).toContain('role');
    expect(names).toContain('guidelines');
  });
});

describe('createVariableCollection', () => {
  it('should check if variable exists', () => {
    const collection = createVariableCollection({
      userName: { type: 'string', value: 'Alice' },
      config: { type: 'data', value: { x: 1 } }
    });

    expect(collection.has('userName')).toBe(true);
    expect(collection.has('unknown')).toBe(false);
  });

  it('should filter variables', () => {
    const collection = createVariableCollection({
      userName: { type: 'string', value: 'Alice' },
      config: { type: 'data', value: { x: 1 } }
    });

    const dataVars = collection.filter(v => v.type === 'data');
    expect(dataVars).toHaveLength(1);
    expect(dataVars[0].name).toBe('config');
  });

  it('should be iterable', () => {
    const collection = createVariableCollection({
      userName: { type: 'string', value: 'Alice' },
      config: { type: 'data', value: { x: 1 } }
    });

    const names = [...collection].map(v => v.name);
    expect(names).toContain('userName');
    expect(names).toContain('config');
  });

  it('should include value in entries', () => {
    const collection = createVariableCollection({
      userName: { type: 'string', value: 'Alice' }
    });

    const entry = [...collection][0];
    expect(entry.value).toBe('Alice');
    expect(entry.type).toBe('string');
  });
});
