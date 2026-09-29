import { Injectable, Logger } from '@nestjs/common';

import type {
  AdminDashboard,
  AdminDashboardWeeklyTrendItem,
  Dashboard,
  DashboardWeeklyTrendItem,
} from '@dall-fit/types';

import type {
  AdminDashboardExecutionDay,
  DashboardExecutionDay,
  DashboardExecutionTotals,
} from '~/dashboard/domain/dashboard.types';
import { createDashboardTimezoneInvalidException } from '~/dashboard/errors/dashboard.errors';
import { DashboardReadRepository } from '~/dashboard/repositories/dashboard-read.repository';
import {
  assertValidTimezone,
  CIVIL_DAY_MS,
  civilDateFromOrdinal,
  getEightWeekRange,
  getLast30DaysRange,
  getWeekRange,
} from '~/training/domain/training-calendar';
import { TrainingClockService } from '~/training/services/training-clock.service';
import { TrainingDashboardContextService } from '~/training/services/training-dashboard-context.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly repository: DashboardReadRepository,
    private readonly trainingContext: TrainingDashboardContextService,
    private readonly clock: TrainingClockService,
  ) {}

  async personal(personId: string, timezone: string): Promise<Dashboard> {
    this.logger.log('DashboardService -> personal -> params:', {
      params: { personId, timezonePresent: timezone.length > 0 },
    });
    this.validateTimezone(timezone);
    const now = this.clock.now();
    const ranges = this.ranges(now, timezone);
    const [readModel, context] = await Promise.all([
      this.repository.readPersonal(personId, {
        end: ranges.trend.end,
        last30DaysEnd: ranges.last30Days.end,
        last30DaysStart: ranges.last30Days.start,
        start: ranges.trend.start,
        timezone,
      }),
      this.trainingContext.resolve(personId),
    ]);
    this.logger.log('DashboardService -> personal -> dependencies return:', {
      data: {
        action: context.nextAction.type,
        completedWorkoutCount: readModel.last30Days.completedWorkoutCount,
      },
    });
    const days = new Map(
      readModel.days.map((item) => [item.date, item.completedWorkoutCount]),
    );
    const result: Dashboard = {
      currentWeek: {
        completedWorkoutCount: this.countRange(
          readModel.days,
          ranges.week.startDate,
          ranges.week.endDate,
        ),
        days: Array.from({ length: 7 }, (_, index) => {
          const date = civilDateFromOrdinal(
            ranges.week.startOrdinal + index * CIVIL_DAY_MS,
          );
          return {
            completed: (days.get(date) ?? 0) > 0,
            date,
            weekday: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
          };
        }),
        endDate: ranges.week.endDate,
        startDate: ranges.week.startDate,
        workoutCount: context.workoutCount,
      },
      generatedAt: now.toISOString(),
      last30Days: this.metrics(readModel.last30Days),
      nextAction: context.nextAction,
      recentWorkouts: readModel.recentWorkouts.map((execution) => ({
        ...execution,
        completedAt: execution.completedAt.toISOString(),
      })),
      weeklyTrend: this.weeklyTrend(readModel.days, ranges.trend.startOrdinal),
    };
    this.logger.log('DashboardService -> personal -> return:', {
      data: {
        action: result.nextAction.type,
        completedWorkoutCount: result.last30Days.completedWorkoutCount,
        personId,
      },
    });
    return result;
  }

  async admin(timezone: string): Promise<AdminDashboard> {
    this.logger.log('DashboardService -> admin -> params:', {
      params: { timezonePresent: timezone.length > 0 },
    });
    this.validateTimezone(timezone);
    const now = this.clock.now();
    const ranges = this.ranges(now, timezone);
    const readModel = await this.repository.readAdmin({
      end: ranges.trend.end,
      last30DaysEnd: ranges.last30Days.end,
      last30DaysStart: ranges.last30Days.start,
      start: ranges.trend.start,
      timezone,
    });
    this.logger.log('DashboardService -> admin -> repository return:', {
      data: {
        totalPeople: readModel.people.totalCount,
        trainingCount: readModel.last30Days.completedWorkoutCount,
      },
    });
    const result: AdminDashboard = {
      generatedAt: now.toISOString(),
      people: {
        ...readModel.people,
        trainedLast30DaysCount: readModel.last30Days.personIds.length,
      },
      plans: readModel.plans,
      topGlobalPlans: readModel.topGlobalPlans,
      training: this.metrics(readModel.last30Days),
      weeklyTrend: this.adminWeeklyTrend(
        readModel.days,
        ranges.trend.startOrdinal,
      ),
    };
    this.logger.log('DashboardService -> admin -> return:', {
      data: {
        totalPeople: result.people.totalCount,
        trainingCount: result.training.completedWorkoutCount,
      },
    });
    return result;
  }

  private validateTimezone(timezone: string): void {
    this.logger.log('DashboardService -> validateTimezone -> params:', {
      params: { timezonePresent: timezone.length > 0 },
    });
    try {
      assertValidTimezone(timezone);
    } catch {
      this.logger.warn(
        'DashboardService -> validateTimezone -> invalid error:',
        {
          data: { timezoneValid: false },
        },
      );
      throw createDashboardTimezoneInvalidException();
    }
    this.logger.log('DashboardService -> validateTimezone -> completed:', {
      data: { timezoneValid: true },
    });
  }

  private ranges(now: Date, timezone: string) {
    this.logger.log('DashboardService -> ranges -> params:', {
      params: { referenceInstant: now.toISOString(), timezonePresent: true },
    });
    const result = {
      last30Days: getLast30DaysRange(now, timezone),
      trend: getEightWeekRange(now, timezone),
      week: getWeekRange(now, timezone),
    };
    this.logger.log('DashboardService -> ranges -> return:', {
      data: {
        last30DaysStart: result.last30Days.startDate,
        trendStart: result.trend.startDate,
        weekStart: result.week.startDate,
      },
    });
    return result;
  }

  private metrics(totals: DashboardExecutionTotals) {
    this.logger.log('DashboardService -> metrics -> params:', {
      params: { completedWorkoutCount: totals.completedWorkoutCount },
    });
    const result = {
      completedWorkoutCount: totals.completedWorkoutCount,
      fullCompletionCount: totals.fullCompletionCount,
      fullCompletionPercentage:
        totals.completedWorkoutCount === 0
          ? 0
          : Math.round(
              (totals.fullCompletionCount / totals.completedWorkoutCount) * 100,
            ),
      totalDurationSeconds: totals.totalDurationSeconds,
    };
    this.logger.log('DashboardService -> metrics -> return:', {
      data: {
        completedWorkoutCount: result.completedWorkoutCount,
        fullCompletionPercentage: result.fullCompletionPercentage,
      },
    });
    return result;
  }

  private weeklyTrend(
    days: readonly DashboardExecutionDay[],
    startOrdinal: number,
  ): DashboardWeeklyTrendItem[] {
    this.logger.log('DashboardService -> weeklyTrend -> params:', {
      params: {
        dayCount: days.length,
        trendStart: civilDateFromOrdinal(startOrdinal),
      },
    });
    const result = Array.from({ length: 8 }, (_, index) => {
      const weekStart = startOrdinal + index * 7 * CIVIL_DAY_MS;
      const startDate = civilDateFromOrdinal(weekStart);
      const endDate = civilDateFromOrdinal(weekStart + 6 * CIVIL_DAY_MS);
      return {
        completedWorkoutCount: this.countRange(days, startDate, endDate),
        endDate,
        startDate,
      };
    });
    this.logger.log('DashboardService -> weeklyTrend -> return:', {
      data: { bucketCount: result.length },
    });
    return result;
  }

  private adminWeeklyTrend(
    days: readonly AdminDashboardExecutionDay[],
    startOrdinal: number,
  ): AdminDashboardWeeklyTrendItem[] {
    this.logger.log('DashboardService -> adminWeeklyTrend -> params:', {
      params: { dayCount: days.length },
    });
    const result = this.weeklyTrend(days, startOrdinal).map((week) => {
      const people = new Set(
        days
          .filter(
            (day) => day.date >= week.startDate && day.date <= week.endDate,
          )
          .flatMap((day) => day.personIds),
      );
      return { ...week, activePeopleCount: people.size };
    });
    this.logger.log('DashboardService -> adminWeeklyTrend -> return:', {
      data: { bucketCount: result.length },
    });
    return result;
  }

  private countRange(
    days: readonly DashboardExecutionDay[],
    startDate: string,
    endDate: string,
  ): number {
    this.logger.log('DashboardService -> countRange -> params:', {
      params: { dayCount: days.length, endDate, startDate },
    });
    const result = days
      .filter((day) => day.date >= startDate && day.date <= endDate)
      .reduce((total, day) => total + day.completedWorkoutCount, 0);
    this.logger.log('DashboardService -> countRange -> return:', {
      data: { completedWorkoutCount: result },
    });
    return result;
  }
}
