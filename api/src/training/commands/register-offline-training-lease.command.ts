import { Injectable, Logger } from '@nestjs/common';

import { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import type { OfflineTrainingLeaseResponse } from '~/training/domain/offline-training-lease.types';
import {
  activeTrainingPlanNotFoundException,
  mapOfflineTrainingLeaseHttpError,
} from '~/training/errors/offline-training-lease-http.errors';
import { OfflineTrainingLeaseService } from '~/training/services/offline-training-lease.service';

@Injectable()
export class RegisterOfflineTrainingLeaseCommand {
  private readonly logger = new Logger(
    RegisterOfflineTrainingLeaseCommand.name,
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
      'RegisterOfflineTrainingLeaseCommand -> execute -> params:',
      { params: { operation: 'register' } },
    );
    const activePlans =
      await this.personalPlans.getActiveExecutionPlans(personId);
    this.logger.log(
      'RegisterOfflineTrainingLeaseCommand -> execute -> personalPlans return:',
      { data: { activeCount: activePlans.length } },
    );
    if (activePlans.length === 0) {
      this.logger.warn(
        'RegisterOfflineTrainingLeaseCommand -> execute -> activePlanMissing error:',
        { data: { code: 'ACTIVE_TRAINING_PLAN_NOT_FOUND' } },
      );
      throw activeTrainingPlanNotFoundException();
    }
    try {
      const data = await this.leases.register(personId, installationId);
      this.logger.log(
        'RegisterOfflineTrainingLeaseCommand -> execute -> leases return:',
        { data: { state: data.state } },
      );
      const result = { data };
      this.logger.log(
        'RegisterOfflineTrainingLeaseCommand -> execute -> return:',
        { data: { state: data.state } },
      );
      return result;
    } catch (error: unknown) {
      mapOfflineTrainingLeaseHttpError(error);
    }
  }
}
