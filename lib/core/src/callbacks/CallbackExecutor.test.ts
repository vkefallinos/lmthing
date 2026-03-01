import { describe, it, expect, vi } from 'vitest';
import { executeWithCallbacks } from './CallbackExecutor';

describe('executeWithCallbacks', () => {
  it('executes function without callbacks', async () => {
    const execute = vi.fn().mockResolvedValue({ result: 42 });
    const output = await executeWithCallbacks(execute, { a: 1 }, undefined);
    expect(output).toEqual({ result: 42 });
    expect(execute).toHaveBeenCalledWith({ a: 1 }, undefined);
  });

  it('calls beforeCall and short-circuits if it returns a value', async () => {
    const execute = vi.fn().mockResolvedValue({ result: 42 });
    const beforeCall = vi.fn().mockResolvedValue({ early: true });

    const output = await executeWithCallbacks(execute, { a: 1 }, undefined, { beforeCall });
    expect(output).toEqual({ early: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('continues execution when beforeCall returns undefined', async () => {
    const execute = vi.fn().mockResolvedValue({ result: 42 });
    const beforeCall = vi.fn().mockResolvedValue(undefined);

    const output = await executeWithCallbacks(execute, { a: 1 }, undefined, { beforeCall });
    expect(output).toEqual({ result: 42 });
    expect(execute).toHaveBeenCalled();
  });

  it('calls onSuccess and uses returned value', async () => {
    const execute = vi.fn().mockResolvedValue({ result: 42 });
    const onSuccess = vi.fn().mockResolvedValue({ modified: true });

    const output = await executeWithCallbacks(execute, { a: 1 }, undefined, { onSuccess });
    expect(output).toEqual({ modified: true });
    expect(onSuccess).toHaveBeenCalledWith({ a: 1 }, { result: 42 });
  });

  it('keeps original output when onSuccess returns undefined', async () => {
    const execute = vi.fn().mockResolvedValue({ result: 42 });
    const onSuccess = vi.fn().mockResolvedValue(undefined);

    const output = await executeWithCallbacks(execute, { a: 1 }, undefined, { onSuccess });
    expect(output).toEqual({ result: 42 });
  });

  it('calls onError when execute throws', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('failed'));
    const onError = vi.fn().mockResolvedValue({ recovered: true });

    const output = await executeWithCallbacks(execute, { a: 1 }, undefined, { onError });
    expect(output).toEqual({ recovered: true });
  });

  it('returns error output when onError returns undefined', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('failed'));
    const onError = vi.fn().mockResolvedValue(undefined);

    const output = await executeWithCallbacks(execute, { a: 1 }, undefined, { onError });
    expect(output).toEqual({ error: 'failed' });
  });

  it('applies formatOutput to result', async () => {
    const execute = vi.fn().mockResolvedValue({ result: 42 });
    const formatOutput = vi.fn().mockReturnValue({ formatted: true });

    const output = await executeWithCallbacks(execute, { a: 1 }, undefined, undefined, formatOutput);
    expect(output).toEqual({ formatted: true });
    expect(formatOutput).toHaveBeenCalledWith({ result: 42 }, undefined);
  });

  it('applies formatOutput to error output', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('failed'));
    const formatOutput = vi.fn().mockImplementation((output) => ({ ...output, formatted: true }));

    const output = await executeWithCallbacks(execute, { a: 1 }, undefined, undefined, formatOutput);
    expect(output).toEqual({ error: 'failed', formatted: true });
  });
});
