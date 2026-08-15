import { describe, expect, it } from 'vitest';

import { AggregateMutationCoordinator } from './aggregate-mutation-coordinator';

describe('AggregateMutationCoordinator external invalidation', () => {
  it('pauses immediately when another document changes a dirty aggregate', () => {
    const coordinator = new AggregateMutationCoordinator();
    coordinator.seed('plan-a', 2);
    coordinator.setLocalWork('plan-a', 'editor', true);

    const paused = coordinator.notifyExternalChange({
      resource: 'global-training-plan',
      resourceId: 'plan-a',
      state: 'present',
      version: 3,
    });

    expect(paused).toBe(true);
    expect(coordinator.snapshot('plan-a')).toMatchObject({
      pauseReason: 'conflict',
      paused: true,
    });
  });

  it('leaves a clean aggregate active for automatic reconciliation', () => {
    const coordinator = new AggregateMutationCoordinator();
    coordinator.seed('plan-a', 2);

    const paused = coordinator.notifyExternalChange({
      resource: 'global-training-plan',
      resourceId: 'plan-a',
      state: 'deleted',
    });

    expect(paused).toBe(false);
    expect(coordinator.snapshot('plan-a')).toMatchObject({
      externalChange: { state: 'deleted' },
      paused: false,
    });
  });

  it('coalesces stale and repeated versions without requesting reconciliation', () => {
    const coordinator = new AggregateMutationCoordinator();
    coordinator.seed('plan-a', 4);

    expect(
      coordinator.notifyExternalChange({
        resource: 'global-training-plan',
        resourceId: 'plan-a',
        state: 'present',
        version: 4,
      }),
    ).toBeUndefined();
    expect(
      coordinator.notifyExternalChange({
        resource: 'global-training-plan',
        resourceId: 'plan-a',
        state: 'present',
        version: 5,
      }),
    ).toBe(false);
    expect(
      coordinator.notifyExternalChange({
        resource: 'global-training-plan',
        resourceId: 'plan-a',
        state: 'present',
        version: 5,
      }),
    ).toBeUndefined();
  });

  it('lets an in-flight mutation converge before deciding whether to stay paused', async () => {
    const coordinator = new AggregateMutationCoordinator();
    let finish!: (value: { data: string; version: number }) => void;
    const operation = new Promise<{ data: string; version: number }>(
      (resolve) => {
        finish = resolve;
      },
    );
    const task = coordinator.enqueue('plan-a', 2, () => operation);
    await Promise.resolve();

    expect(
      coordinator.notifyExternalChange({
        resource: 'global-training-plan',
        resourceId: 'plan-a',
        state: 'present',
        version: 3,
      }),
    ).toBe(true);
    finish({ data: 'confirmed', version: 3 });

    await expect(task).resolves.toBe('confirmed');
    expect(coordinator.snapshot('plan-a')).toMatchObject({ paused: false });
  });
});
