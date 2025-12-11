import { describe, it, expect, beforeEach } from 'vitest';
import { runPrompt } from '../src/runPrompt';
import { createMockModel } from '../src/test/createMockModel';

describe('defState()', () => {
  it('creates state with initial value', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      const [count] = defState('count', 0);
      $`Count: ${count}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('persists state across re-executions', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'text', text: 'c' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      const [count, setCount] = defState('count', 0);
      if (count < 2) setCount(count + 1);
      $`Count: ${count}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('updates state with direct value', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      const [val, setVal] = defState('val', 'init');
      if (val === 'init') setVal('updated');
      $`Val: ${val}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('updates state with function', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      const [count, setCount] = defState('count', 0);
      if (count === 0) setCount(prev => prev + 10);
      $`Count: ${count}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles object state', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      const [user, setUser] = defState('user', { name: 'Alice', age: 30 });
      if (user.age === 30) setUser(prev => ({ ...prev, age: 31 }));
      $`User: ${user.name}, ${user.age}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles array state', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      const [items, setItems] = defState('items', ['a']);
      if (items.length === 1) setItems(prev => [...prev, 'b']);
      $`Items: ${items.join(', ')}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('supports multiple state variables', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      const [x, setX] = defState('x', 1);
      const [y, setY] = defState('y', 2);
      const [z, setZ] = defState('z', 3);
      if (x === 1) {
        setX(10);
        setY(20);
        setZ(30);
      }
      $`${x} ${y} ${z}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('state proxy works in templates', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      const [val] = defState('val', 'test');
      $`Value: ${val}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles boolean state', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      const [flag, setFlag] = defState('flag', false);
      if (!flag) setFlag(true);
      $`Flag: ${flag}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles null state', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      const [val, setVal] = defState<string | null>('val', null);
      if (val === null) setVal('set');
      $`Val: ${val}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });
});
