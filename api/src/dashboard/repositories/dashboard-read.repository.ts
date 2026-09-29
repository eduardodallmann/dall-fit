import type {
  AdminDashboardReadModel,
  PersonalDashboardReadModel,
} from '~/dashboard/domain/dashboard.types';

export interface DashboardReadRange {
  end: Date;
  last30DaysEnd: Date;
  last30DaysStart: Date;
  start: Date;
  timezone: string;
}

export abstract class DashboardReadRepository {
  abstract readAdmin(
    range: DashboardReadRange,
  ): Promise<AdminDashboardReadModel>;
  abstract readPersonal(
    personId: string,
    range: DashboardReadRange,
  ): Promise<PersonalDashboardReadModel>;
}
