import { describe, it, expect } from 'vitest';
import { DefinitionTracker } from './DefinitionTracker';

describe('DefinitionTracker', () => {
  it('should mark and check definitions', () => {
    const tracker = new DefinitionTracker();

    tracker.mark('def', 'myVar');

    expect(tracker.isSeen('def', 'myVar')).toBe(true);
    expect(tracker.isSeen('def', 'otherVar')).toBe(false);
  });

  it('should distinguish between definition types', () => {
    const tracker = new DefinitionTracker();

    tracker.mark('def', 'name');
    tracker.mark('defData', 'name');

    expect(tracker.isSeen('def', 'name')).toBe(true);
    expect(tracker.isSeen('defData', 'name')).toBe(true);
    expect(tracker.isSeen('defSystem', 'name')).toBe(false);
  });

  it('should reset tracker', () => {
    const tracker = new DefinitionTracker();

    tracker.mark('def', 'myVar');
    expect(tracker.isSeen('def', 'myVar')).toBe(true);

    tracker.reset();
    expect(tracker.isSeen('def', 'myVar')).toBe(false);
  });

  it('should reconcile variables', () => {
    const tracker = new DefinitionTracker();
    const variables = {
      keep: { type: 'string', value: 'kept' },
      remove: { type: 'string', value: 'removed' }
    };

    tracker.mark('def', 'keep');
    tracker.reconcile(variables, {}, {});

    expect(variables.keep).toBeDefined();
    expect(variables.remove).toBeUndefined();
  });

  it('should reconcile defData variables', () => {
    const tracker = new DefinitionTracker();
    const variables = {
      dataVar: { type: 'data', value: { x: 1 } }
    };

    tracker.mark('defData', 'dataVar');
    tracker.reconcile(variables, {}, {});

    expect(variables.dataVar).toBeDefined();
  });

  it('should reconcile systems', () => {
    const tracker = new DefinitionTracker();
    const systems = {
      role: 'You are helpful',
      guidelines: 'Be concise'
    };

    tracker.mark('defSystem', 'role');
    tracker.reconcile({}, systems, {});

    expect(systems.role).toBe('You are helpful');
    expect(systems.guidelines).toBeUndefined();
  });

  it('should reconcile tools', () => {
    const tracker = new DefinitionTracker();
    const tools = {
      search: { description: 'Search tool' },
      calculate: { description: 'Calculate tool' }
    };

    tracker.mark('defTool', 'search');
    tracker.reconcile({}, {}, tools);

    expect(tools.search).toBeDefined();
    expect(tools.calculate).toBeUndefined();
  });

  it('should reconcile agents (as tools)', () => {
    const tracker = new DefinitionTracker();
    const tools = {
      researcher: { description: 'Research agent' },
      writer: { description: 'Writer agent' }
    };

    tracker.mark('defAgent', 'researcher');
    tracker.reconcile({}, {}, tools);

    expect(tools.researcher).toBeDefined();
    expect(tools.writer).toBeUndefined();
  });

  it('should get seen definitions', () => {
    const tracker = new DefinitionTracker();

    tracker.mark('def', 'var1');
    tracker.mark('defSystem', 'sys1');
    tracker.mark('defTool', 'tool1');

    const seen = tracker.getSeenDefinitions();

    expect(seen).toContain('def:var1');
    expect(seen).toContain('defSystem:sys1');
    expect(seen).toContain('defTool:tool1');
    expect(seen).toHaveLength(3);
  });
});
