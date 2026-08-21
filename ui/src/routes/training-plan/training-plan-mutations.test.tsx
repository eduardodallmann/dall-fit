import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  GlobalTrainingPlanCollectionResponse,
  GlobalTrainingPlanSummary,
  TrainingPlanSummary,
} from '@dall-fit/types';

import {
  activateSession,
  endSession,
  resetSessionLifecycleForTests,
} from '~/auth/session-lifecycle';

import {
  useDeleteTrainingPlanMutation,
  useUpdateTrainingPlanMutation,
} from './training-plan-mutations';
import { trainingPlanKeys } from './training-plan-queries';
import type * as TrainingPlanServiceModule from './training-plan-service';
import {
  deleteGlobalTrainingPlan,
  updateGlobalTrainingPlan,
} from './training-plan-service';

vi.mock('./training-plan-service', async (importOriginal) => {
  const actual = await importOriginal<typeof TrainingPlanServiceModule>();
  return {
    ...actual,
    deleteGlobalTrainingPlan: vi.fn(),
    updateGlobalTrainingPlan: vi.fn(),
  };
});

const planA = createPlan('plan-a', 'Plano A');
const planB = createPlan('plan-b', 'Plano B');
let generation: number;

describe('training plan mutations', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    generation = await activateSession('person-1', 'success');
  });

  afterEach(() => {
    resetSessionLifecycleForTests();
  });

  it('rolls back only the failed plan while preserving another plan success', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);
    let rejectPlanA: ((reason: Error) => void) | undefined;
    vi.mocked(updateGlobalTrainingPlan).mockImplementation(
      async (trainingPlanId, changes) => {
        if (trainingPlanId === planA.id) {
          return new Promise<TrainingPlanSummary>((_resolve, reject) => {
            rejectPlanA = reject;
          });
        }
        return {
          ...planB,
          ...changes,
          version: 1,
          updatedAt: '2026-08-02T12:00:00.000Z',
        };
      },
    );
    const { result } = renderHook(
      () => useUpdateTrainingPlanMutation('success'),
      { wrapper: wrapper(queryClient) },
    );

    let failed: Promise<TrainingPlanSummary> | undefined;
    let succeeded: Promise<TrainingPlanSummary> | undefined;
    act(() => {
      failed = result.current.mutateAsync({
        changes: { name: 'Plano A otimista' },
        generation,
        trainingPlanId: planA.id,
        version: 0,
      });
      succeeded = result.current.mutateAsync({
        changes: { name: 'Plano B salvo' },
        generation,
        trainingPlanId: planB.id,
        version: 0,
      });
    });

    await expect(succeeded).resolves.toMatchObject({ name: 'Plano B salvo' });
    rejectPlanA?.(new Error('update failed'));
    await expect(failed).rejects.toThrow('update failed');

    await waitFor(() => {
      const collection =
        queryClient.getQueryData<GlobalTrainingPlanCollectionResponse>(
          trainingPlanKeys.list(1, 'success'),
        );
      expect(collection?.data).toEqual([
        planA,
        expect.objectContaining({ id: planB.id, name: 'Plano B salvo' }),
      ]);
    });
  });

  it('restores only the deleted item and total when deletion fails', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);
    let rejectDelete: ((reason: Error) => void) | undefined;
    vi.mocked(deleteGlobalTrainingPlan).mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectDelete = reject;
        }),
    );
    const { result } = renderHook(
      () => useDeleteTrainingPlanMutation('success'),
      { wrapper: wrapper(queryClient) },
    );

    let deletion: Promise<void> | undefined;
    act(() => {
      deletion = result.current.mutateAsync({
        generation,
        trainingPlanId: planA.id,
        version: 0,
      });
    });
    await waitFor(() => {
      const collection =
        queryClient.getQueryData<GlobalTrainingPlanCollectionResponse>(
          trainingPlanKeys.list(1, 'success'),
        );
      expect(collection?.data.map((plan) => plan.id)).toEqual([planB.id]);
      expect(collection?.total).toBe(1);
    });

    rejectDelete?.(new Error('delete failed'));
    await expect(deletion).rejects.toThrow('delete failed');
    await waitFor(() => {
      const collection =
        queryClient.getQueryData<GlobalTrainingPlanCollectionResponse>(
          trainingPlanKeys.list(1, 'success'),
        );
      expect(collection?.data).toEqual([planA, planB]);
      expect(collection?.total).toBe(2);
    });
  });

  it('rejects a mutation from an ended session before touching the service or cache', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);
    const { result } = renderHook(
      () => useUpdateTrainingPlanMutation('success'),
      { wrapper: wrapper(queryClient) },
    );
    const endedGeneration = generation;
    await endSession('logout');

    let mutation: Promise<TrainingPlanSummary> | undefined;
    act(() => {
      mutation = result.current.mutateAsync({
        changes: { name: 'Plano A obsoleto' },
        generation: endedGeneration,
        trainingPlanId: planA.id,
        version: 0,
      });
    });

    await expect(mutation).rejects.toMatchObject({ name: 'AbortError' });
    expect(updateGlobalTrainingPlan).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData<GlobalTrainingPlanCollectionResponse>(
        trainingPlanKeys.list(1, 'success'),
      ),
    ).toEqual({
      data: [planA, planB],
      page: 1,
      pageSize: 20,
      total: 2,
    });
  });
});

function createPlan(id: string, name: string): GlobalTrainingPlanSummary {
  return {
    id,
    name,
    description: `${name} description`,
    version: 0,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    usage: { activePeople: 0, linkedPeople: 0 },
  };
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

function seedList(queryClient: QueryClient): void {
  queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
    trainingPlanKeys.list(1, 'success'),
    {
      data: [planA, planB],
      page: 1,
      pageSize: 20,
      total: 2,
    },
  );
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
