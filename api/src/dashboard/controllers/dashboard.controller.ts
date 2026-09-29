import { Controller, Get, Header, Logger, Query } from '@nestjs/common';

import type {
  AdminDashboardResponse,
  DashboardResponse,
} from '@dall-fit/types';

import { AdminOnly } from '~/auth/decorators/admin-only';
import { Authenticated } from '~/auth/decorators/authenticated';
import { CurrentPerson } from '~/auth/decorators/current-person';
import { GetAdminDashboardCommand } from '~/dashboard/commands/get-admin-dashboard.command';
import { GetDashboardCommand } from '~/dashboard/commands/get-dashboard.command';
import { DashboardQueryDto } from '~/dashboard/dto/dashboard.dto';
import type { PersonEntity } from '~/person/domain/person.entity';

@Controller()
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(
    private readonly getDashboard: GetDashboardCommand,
    private readonly getAdminDashboard: GetAdminDashboardCommand,
  ) {}

  @Get('dashboard')
  @Authenticated()
  @Header('Cache-Control', 'private, no-store')
  async personal(
    @CurrentPerson() person: PersonEntity,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardResponse> {
    this.logger.log('DashboardController -> personal -> params:', {
      params: {
        personId: person.id,
        timezonePresent: query.timezone.length > 0,
      },
    });
    const result = await this.getDashboard.execute(person.id, query.timezone);
    this.logger.log('DashboardController -> personal -> getDashboard return:', {
      data: { action: result.data.nextAction.type },
    });
    this.logger.log('DashboardController -> personal -> return:', {
      data: { action: result.data.nextAction.type },
    });
    return result;
  }

  @Get('admin/dashboard')
  @AdminOnly()
  @Header('Cache-Control', 'private, no-store')
  async admin(
    @Query() query: DashboardQueryDto,
  ): Promise<AdminDashboardResponse> {
    this.logger.log('DashboardController -> admin -> params:', {
      params: { timezonePresent: query.timezone.length > 0 },
    });
    const result = await this.getAdminDashboard.execute(query.timezone);
    this.logger.log(
      'DashboardController -> admin -> getAdminDashboard return:',
      { data: { totalPeople: result.data.people.totalCount } },
    );
    this.logger.log('DashboardController -> admin -> return:', {
      data: { totalPeople: result.data.people.totalCount },
    });
    return result;
  }
}
