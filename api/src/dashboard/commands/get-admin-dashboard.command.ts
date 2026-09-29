import { Injectable, Logger } from '@nestjs/common';

import type { AdminDashboardResponse } from '@dall-fit/types';

import { DashboardService } from '~/dashboard/services/dashboard.service';

@Injectable()
export class GetAdminDashboardCommand {
  private readonly logger = new Logger(GetAdminDashboardCommand.name);

  constructor(private readonly service: DashboardService) {}

  async execute(timezone: string): Promise<AdminDashboardResponse> {
    this.logger.log('GetAdminDashboardCommand -> execute -> params:', {
      params: { timezonePresent: timezone.length > 0 },
    });
    const data = await this.service.admin(timezone);
    this.logger.log(
      'GetAdminDashboardCommand -> execute -> dashboardService return:',
      { data: { totalPeople: data.people.totalCount } },
    );
    const result = { data };
    this.logger.log('GetAdminDashboardCommand -> execute -> return:', {
      data: { totalPeople: result.data.people.totalCount },
    });
    return result;
  }
}
