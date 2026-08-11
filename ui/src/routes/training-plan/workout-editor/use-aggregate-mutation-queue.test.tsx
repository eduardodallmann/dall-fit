import { act, renderHook } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { useAggregateMutationQueue } from './use-aggregate-mutation-queue';

describe('useAggregateMutationQueue', () => {
  it('serializes operations and supplies the version produced by the prior mutation', async () => {
    let finishFirst:
      ((value: { data: string; version: number }) => void) | undefined;
    const first = vi.fn(
      () =>
        new Promise<{ data: string; version: number }>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const second = vi.fn().mockResolvedValue({ data: 'second', version: 4 });
    const { result } = renderHook(() => useAggregateMutationQueue(2, vi.fn()));

    let firstTask: Promise<string> | undefined;
    let secondTask: Promise<string> | undefined;
    act(() => {
      firstTask = result.current.enqueue(first);
      secondTask = result.current.enqueue(second);
    });
    await vi.waitFor(() => expect(first).toHaveBeenCalledWith(2));
    expect(second).not.toHaveBeenCalled();
    await act(async () => {
      finishFirst?.({ data: 'first', version: 3 });
      await firstTask;
    });
    await expect(secondTask).resolves.toBe('second');
    expect(second).toHaveBeenCalledWith(3);
  });

  it('pauses after a 412 and never starts later queued work', async () => {
    const onConflict = vi.fn();
    const response = { status: 412 } as AxiosResponse;
    const conflict = new AxiosError(
      'conflict',
      undefined,
      undefined,
      undefined,
      response,
    );
    const { result } = renderHook(() =>
      useAggregateMutationQueue(0, onConflict),
    );
    const later = vi.fn().mockResolvedValue({ data: 'later', version: 1 });
    let conflictTask: Promise<string> | undefined;
    let laterTask: Promise<string> | undefined;
    act(() => {
      conflictTask = result.current.enqueue(() => Promise.reject(conflict));
      laterTask = result.current.enqueue(later);
    });
    await act(async () => {
      await expect(conflictTask).rejects.toBe(conflict);
      await expect(laterTask).rejects.toThrow('paused');
    });
    expect(later).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledOnce();
    expect(result.current.paused).toBe(true);
  });
});
