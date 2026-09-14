import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import { RegisterOfflineTrainingLeaseCommand } from '~/training/commands/register-offline-training-lease.command';
import { TakeoverOfflineTrainingLeaseCommand } from '~/training/commands/takeover-offline-training-lease.command';
import {
  OfflineTrainingLeaseTakeoverRequiredError,
  OfflineTrainingLeaseUnavailableError,
} from '~/training/errors/offline-training-lease.errors';
import type { OfflineTrainingLeaseService } from '~/training/services/offline-training-lease.service';

describe('offline training lease commands', () => {
  const active = { plan: { id: 'plan-001' } };
  const lease = {
    expiresAt: '2026-09-20T12:00:00.000Z',
    leaseId: 'lease-001',
    planId: 'plan-001',
    state: 'created' as const,
  };
  const personalPlans = { getActiveExecutionPlan: vi.fn() };
  const leases = { register: vi.fn(), takeover: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    personalPlans.getActiveExecutionPlan.mockResolvedValue(active);
    leases.register.mockResolvedValue(lease);
    leases.takeover.mockResolvedValue({ ...lease, state: 'taken-over' });
  });

  it('registers against the active plan derived on the server', async () => {
    const command = new RegisterOfflineTrainingLeaseCommand(
      personalPlans as unknown as PersonalTrainingPlanService,
      leases as unknown as OfflineTrainingLeaseService,
    );

    await expect(
      command.execute('person-001', 'installation-001'),
    ).resolves.toEqual({
      data: lease,
    });
    expect(leases.register).toHaveBeenCalledWith(
      'person-001',
      'plan-001',
      'installation-001',
    );
  });

  it('takes over against the active plan derived on the server', async () => {
    const command = new TakeoverOfflineTrainingLeaseCommand(
      personalPlans as unknown as PersonalTrainingPlanService,
      leases as unknown as OfflineTrainingLeaseService,
    );

    const result = await command.execute('person-001', 'installation-002');

    expect(result.data.state).toBe('taken-over');
    expect(leases.takeover).toHaveBeenCalledWith(
      'person-001',
      'plan-001',
      'installation-002',
    );
  });

  it.each([
    RegisterOfflineTrainingLeaseCommand,
    TakeoverOfflineTrainingLeaseCommand,
  ])(
    'fails before Redis when the active plan is absent',
    async (CommandType) => {
      personalPlans.getActiveExecutionPlan.mockResolvedValueOnce(null);
      const command = new CommandType(
        personalPlans as unknown as PersonalTrainingPlanService,
        leases as unknown as OfflineTrainingLeaseService,
      );

      const error = await command
        .execute('person-001', 'installation-001')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(404);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'ACTIVE_TRAINING_PLAN_NOT_FOUND',
      });
      expect(leases.register).not.toHaveBeenCalled();
      expect(leases.takeover).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      new OfflineTrainingLeaseTakeoverRequiredError(),
      409,
      'OFFLINE_LEASE_TAKEOVER_REQUIRED',
    ],
    [
      new OfflineTrainingLeaseUnavailableError(),
      503,
      'OFFLINE_LEASE_UNAVAILABLE',
    ],
  ] as const)(
    'maps domain failures to stable HTTP errors',
    async (failure, status, code) => {
      leases.register.mockRejectedValueOnce(failure);
      const command = new RegisterOfflineTrainingLeaseCommand(
        personalPlans as unknown as PersonalTrainingPlanService,
        leases as unknown as OfflineTrainingLeaseService,
      );

      const error = await command
        .execute('person-001', 'installation-001')
        .catch((caught: unknown) => caught);

      expect((error as HttpException).getStatus()).toBe(status);
      expect((error as HttpException).getResponse()).toMatchObject({ code });
    },
  );
});
