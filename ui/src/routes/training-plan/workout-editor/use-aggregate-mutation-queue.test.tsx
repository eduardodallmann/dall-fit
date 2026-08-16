import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { AggregateMutationCoordinator } from '../aggregate-mutation-coordinator';
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
    const queryClient = new QueryClient();
    const { result } = renderHook(
      () => useAggregateMutationQueue('plan-1', 2),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      },
    );

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

  it('keeps the produced version when a later operation starts after the queue becomes idle', async () => {
    const first = vi.fn().mockResolvedValue({ data: 'first', version: 3 });
    const second = vi.fn().mockResolvedValue({ data: 'second', version: 4 });
    const queryClient = new QueryClient();
    const { result } = renderHook(
      () => useAggregateMutationQueue('plan-1', 2),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      },
    );

    await act(async () => {
      await expect(result.current.enqueue(first)).resolves.toBe('first');
    });
    await vi.waitFor(() => expect(result.current.isPending).toBe(false));
    await act(async () => {
      await expect(result.current.enqueue(second)).resolves.toBe('second');
    });

    expect(first).toHaveBeenCalledWith(2);
    expect(second).toHaveBeenCalledWith(3);
  });

  it('does not regress the produced version when a stale screen seeds the idle coordinator', async () => {
    const coordinator = new AggregateMutationCoordinator();
    const first = vi.fn().mockResolvedValue({ data: 'first', version: 3 });
    const second = vi.fn().mockResolvedValue({ data: 'second', version: 4 });

    await expect(coordinator.enqueue('plan-1', 2, first)).resolves.toBe(
      'first',
    );
    coordinator.seed('plan-1', 2);
    await expect(coordinator.enqueue('plan-1', 2, second)).resolves.toBe(
      'second',
    );

    expect(first).toHaveBeenCalledWith(2);
    expect(second).toHaveBeenCalledWith(3);
  });

  it('pauses after a domain version conflict and never starts later queued work', async () => {
    const response = {
      status: 412,
      data: { code: 'TRAINING_PLAN_VERSION_CONFLICT' },
    } as AxiosResponse;
    const conflict = new AxiosError(
      'conflict',
      undefined,
      undefined,
      undefined,
      response,
    );
    const queryClient = new QueryClient();
    const { result } = renderHook(
      () => useAggregateMutationQueue('plan-1', 0),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      },
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
    expect(result.current.paused).toBe(true);
  });

  it('does not pause after an external 412 without the domain error code', async () => {
    const response = {
      status: 412,
      data: 'PRECONDITION_FAILED',
      headers: { 'x-vercel-error': 'PRECONDITION_FAILED' },
    } as unknown as AxiosResponse;
    const externalFailure = new AxiosError(
      'external precondition failure',
      undefined,
      undefined,
      undefined,
      response,
    );
    const queryClient = new QueryClient();
    const { result } = renderHook(
      () => useAggregateMutationQueue('plan-1', 0),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      },
    );
    const later = vi.fn().mockResolvedValue({ data: 'later', version: 1 });

    let failedTask: Promise<string> | undefined;
    let laterTask: Promise<string> | undefined;
    act(() => {
      failedTask = result.current.enqueue(() =>
        Promise.reject(externalFailure),
      );
      laterTask = result.current.enqueue(later);
    });

    await act(async () => {
      await expect(failedTask).rejects.toBe(externalFailure);
      await expect(laterTask).resolves.toBe('later');
    });
    expect(later).toHaveBeenCalledWith(0);
    expect(result.current.paused).toBe(false);
  });

  it('pauses for canonical reconciliation when a mutation response is unknown', async () => {
    const coordinator = new AggregateMutationCoordinator();
    const timeout = new AxiosError('timeout', 'ETIMEDOUT');

    await expect(
      coordinator.enqueue('plan-1', 3, () => Promise.reject(timeout)),
    ).rejects.toBe(timeout);

    expect(coordinator.snapshot('plan-1')).toEqual({
      isPending: false,
      pauseReason: 'uncertain',
      paused: true,
    });
    await expect(
      coordinator.enqueue('plan-1', 3, () =>
        Promise.resolve({ data: 'unsafe', version: 4 }),
      ),
    ).rejects.toThrow('paused');

    await coordinator.reset('plan-1', 4);
    await expect(
      coordinator.enqueue('plan-1', 3, () =>
        Promise.resolve({ data: 'safe', version: 5 }),
      ),
    ).resolves.toBe('safe');
  });

  it('keeps different training plans independent', async () => {
    const queryClient = new QueryClient();
    let finishPlanA:
      ((value: { data: string; version: number }) => void) | undefined;
    const firstPlanA = vi.fn(
      () =>
        new Promise<{ data: string; version: number }>((resolve) => {
          finishPlanA = resolve;
        }),
    );
    const secondPlanA = vi
      .fn()
      .mockResolvedValue({ data: 'second-a', version: 2 });
    const planB = vi.fn().mockResolvedValue({ data: 'plan-b', version: 1 });
    const { result } = renderHook(
      () => ({
        planA: useAggregateMutationQueue('plan-a', 0),
        planB: useAggregateMutationQueue('plan-b', 0),
      }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      },
    );

    let firstTask: Promise<string> | undefined;
    let secondTask: Promise<string> | undefined;
    let planBTask: Promise<string> | undefined;
    act(() => {
      firstTask = result.current.planA.enqueue(firstPlanA);
      secondTask = result.current.planA.enqueue(secondPlanA);
      planBTask = result.current.planB.enqueue(planB);
    });

    await expect(planBTask).resolves.toBe('plan-b');
    expect(secondPlanA).not.toHaveBeenCalled();
    finishPlanA?.({ data: 'first-a', version: 1 });
    await expect(firstTask).resolves.toBe('first-a');
    await expect(secondTask).resolves.toBe('second-a');
    expect(secondPlanA).toHaveBeenCalledWith(1);
  });

  it('cancels running and queued work when the session resource is cleared', async () => {
    const coordinator = new AggregateMutationCoordinator();
    let finish:
      ((value: { data: string; version: number }) => void) | undefined;
    const running = vi.fn(
      () =>
        new Promise<{ data: string; version: number }>((resolve) => {
          finish = resolve;
        }),
    );
    const queued = vi.fn().mockResolvedValue({ data: 'queued', version: 2 });
    const runningTask = coordinator.enqueue('plan-1', 0, running);
    const queuedTask = coordinator.enqueue('plan-1', 0, queued);
    await vi.waitFor(() => expect(running).toHaveBeenCalledOnce());

    coordinator.clear();
    finish?.({ data: 'running', version: 1 });

    await expect(runningTask).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await expect(queuedTask).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(queued).not.toHaveBeenCalled();
    expect(coordinator.snapshot('plan-1')).toEqual({
      isPending: false,
      paused: false,
    });
  });
});
