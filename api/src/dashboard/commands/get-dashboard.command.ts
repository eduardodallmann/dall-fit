import { Injectable, Logger } from '@nestjs/common';

import type { DashboardResponse } from '@dall-fit/types';

import { DashboardService } from '~/dashboard/services/dashboard.service';

@Injectable()
export class GetDashboardCommand {
  private readonly logger = new Logger(GetDashboardCommand.name);

  constructor(private readonly service: DashboardService) {}

  async execute(
    personId: string,
    timezone: string,
  ): Promise<DashboardResponse> {
    this.logger.log('GetDashboardCommand -> execute -> params:', {
      params: { personId, timezonePresent: timezone.length > 0 },
    });
    const data = await this.service.personal(personId, timezone);
    this.logger.log(
      'GetDashboardCommand -> execute -> dashboardService return:',
      {
        data: { action: data.nextAction.type },
      },
    );
    const result = { data };
    this.logger.log('GetDashboardCommand -> execute -> return:', {
      data: { action: result.data.nextAction.type },
    });
    return result;
  }
}
