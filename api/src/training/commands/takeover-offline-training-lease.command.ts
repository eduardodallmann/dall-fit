import { Injectable, Logger } from '@nestjs/common';

import { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import type { OfflineTrainingLeaseResponse } from '~/training/domain/offline-training-lease.types';
import {
  activeTrainingPlanNotFoundException,
  mapOfflineTrainingLeaseHttpError,
} from '~/training/errors/offline-training-lease-http.errors';
import { OfflineTrainingLeaseService } from '~/training/services/offline-training-lease.service';

@Injectable()
export class TakeoverOfflineTrainingLeaseCommand {
  private readonly logger = new Logger(
    TakeoverOfflineTrainingLeaseCommand.name,
  );

  constructor(
    private readonly personalPlans: PersonalTrainingPlanService,
    private readonly leases: OfflineTrainingLeaseService,
  ) {}

  async execute(
    personId: string,
    installationId: string,
  ): Promise<OfflineTrainingLeaseResponse> {
    this.logger.log(
      'TakeoverOfflineTrainingLeaseCommand -> execute -> params:',
      { params: { operation: 'takeover' } },
    );
    const activePlans =
      await this.personalPlans.getActiveExecutionPlans(personId);
    this.logger.log(
      'TakeoverOfflineTrainingLeaseCommand -> execute -> personalPlans return:',
      { data: { activeCount: activePlans.length } },
    );
    if (activePlans.length === 0) {
      this.logger.warn(
        'TakeoverOfflineTrainingLeaseCommand -> execute -> activePlanMissing error:',
        { data: { code: 'ACTIVE_TRAINING_PLAN_NOT_FOUND' } },
      );
      throw activeTrainingPlanNotFoundException();
    }
    try {
      const data = await this.leases.takeover(personId, installationId);
      this.logger.log(
        'TakeoverOfflineTrainingLeaseCommand -> execute -> leases return:',
        { data: { state: data.state } },
      );
      const result = { data };
      this.logger.log(
        'TakeoverOfflineTrainingLeaseCommand -> execute -> return:',
        { data: { state: data.state } },
      );
      return result;
    } catch (error: unknown) {
      mapOfflineTrainingLeaseHttpError(error);
    }
  }
}
