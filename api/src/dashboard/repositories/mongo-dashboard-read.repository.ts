import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type PipelineStage } from 'mongoose';

import type { BodyArea } from '@dall-fit/types';

import type {
  AdminDashboardReadModel,
  DashboardExecutionTotals,
  PersonalDashboardReadModel,
} from '~/dashboard/domain/dashboard.types';
import {
  DashboardReadRepository,
  type DashboardReadRange,
} from '~/dashboard/repositories/dashboard-read.repository';
import { PersonDocument } from '~/person/repositories/person.schema';
import {
  PersonalTrainingPlanActiveDocument,
  PersonalTrainingPlanCatalogDocument,
} from '~/training-plan/repositories/personal-training-plan.schema';
import { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';
import { WorkoutExecutionDocument } from '~/training/repositories/workout-execution.schema';

interface PersonalAggregateResult {
  days: Array<{ _id: string; count: number }>;
  last30Days: Array<{
    completedWorkoutCount: number;
    fullCompletionCount: number;
    totalDurationSeconds: number;
  }>;
  recentWorkouts: Array<{
    _id: Types.ObjectId;
    bodyAreas: readonly BodyArea[];
    completedAt: Date;
    completedExerciseCount: number;
    durationSeconds: number;
    fullCompletion: boolean;
    planName: string;
    totalExerciseCount: number;
    workoutName: string;
  }>;
}

interface AdminExecutionAggregateResult {
  days: Array<{ _id: string; count: number; personIds: Types.ObjectId[] }>;
  last30Days: Array<{
    completedWorkoutCount: number;
    fullCompletionCount: number;
    personIds: Types.ObjectId[];
    totalDurationSeconds: number;
  }>;
}

@Injectable()
export class MongoDashboardReadRepository extends DashboardReadRepository {
  private readonly logger = new Logger(MongoDashboardReadRepository.name);

  constructor(
    @InjectModel(WorkoutExecutionDocument.name)
    private readonly executions: Model<WorkoutExecutionDocument>,
    @InjectModel(PersonDocument.name)
    private readonly people: Model<PersonDocument>,
    @InjectModel(PersonalTrainingPlanActiveDocument.name)
    private readonly activeSelections: Model<PersonalTrainingPlanActiveDocument>,
    @InjectModel(PersonalTrainingPlanCatalogDocument.name)
    private readonly catalog: Model<PersonalTrainingPlanCatalogDocument>,
    @InjectModel(TrainingPlanDocument.name)
    private readonly plans: Model<TrainingPlanDocument>,
  ) {
    super();
  }

  async readPersonal(
    personId: string,
    range: DashboardReadRange,
  ): Promise<PersonalDashboardReadModel> {
    this.logger.log('MongoDashboardReadRepository -> readPersonal -> params:', {
      params: { personId, periodDays: 56 },
    });
    const pipeline: PipelineStage[] = [
      {
        $match: {
          personId: new Types.ObjectId(personId),
          status: 'completed',
        },
      },
      {
        $facet: {
          days: [
            {
              $match: {
                completedAt: { $gte: range.start, $lt: range.end },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    date: '$completedAt',
                    format: '%Y-%m-%d',
                    timezone: range.timezone,
                  },
                },
                count: { $sum: 1 },
              },
            },
          ],
          last30Days: [
            {
              $match: {
                completedAt: {
                  $gte: range.last30DaysStart,
                  $lt: range.last30DaysEnd,
                },
              },
            },
            {
              $group: {
                _id: null,
                completedWorkoutCount: { $sum: 1 },
                fullCompletionCount: {
                  $sum: { $cond: ['$fullCompletion', 1, 0] },
                },
                totalDurationSeconds: { $sum: '$durationSeconds' },
              },
            },
          ],
          recentWorkouts: [
            { $sort: { completedAt: -1, _id: -1 } },
            { $limit: 5 },
            {
              $project: {
                bodyAreas: 1,
                completedAt: 1,
                completedExerciseCount: 1,
                durationSeconds: 1,
                fullCompletion: 1,
                planName: 1,
                totalExerciseCount: 1,
                workoutName: 1,
              },
            },
          ],
        },
      },
    ];
    const [aggregate] = await this.executions
      .aggregate<PersonalAggregateResult>(pipeline)
      .exec();
    const totals = this.totals(aggregate?.last30Days[0]);
    const result = {
      days: (aggregate?.days ?? []).map((day) => ({
        completedWorkoutCount: day.count,
        date: day._id,
      })),
      last30Days: totals,
      recentWorkouts: (aggregate?.recentWorkouts ?? []).map((execution) => ({
        ...execution,
        id: execution._id.toString(),
      })),
    };
    this.logger.log('MongoDashboardReadRepository -> readPersonal -> return:', {
      data: {
        completedWorkoutCount: totals.completedWorkoutCount,
        recentWorkoutCount: result.recentWorkouts.length,
      },
    });
    return result;
  }

  async readAdmin(range: DashboardReadRange): Promise<AdminDashboardReadModel> {
    this.logger.log('MongoDashboardReadRepository -> readAdmin -> params:', {
      params: { periodDays: 56 },
    });
    const [
      execution,
      totalPeople,
      newPeople,
      activePlans,
      globalTemplates,
      owned,
      references,
      activeSelections,
      topGlobalPlans,
    ] = await Promise.all([
      this.readAdminExecutions(range),
      this.people.countDocuments().exec(),
      this.people
        .countDocuments({
          createdAt: {
            $gte: range.last30DaysStart,
            $lt: range.last30DaysEnd,
          },
        })
        .exec(),
      this.activeSelections.distinct('personId').then((ids) => ids.length),
      this.plans.countDocuments({ ownerPersonId: null }).exec(),
      this.catalog.countDocuments({ kind: 'owned' }).exec(),
      this.catalog.countDocuments({ kind: 'global-reference' }).exec(),
      this.activeSelections.countDocuments().exec(),
      this.readTopGlobalPlans(),
    ]);
    this.logger.log(
      'MongoDashboardReadRepository -> readAdmin -> dependencies return:',
      { data: { topGlobalPlanCount: topGlobalPlans.length, totalPeople } },
    );
    const result = {
      days: execution.days.map((day) => ({
        completedWorkoutCount: day.count,
        date: day._id,
        personIds: day.personIds.map(String),
      })),
      last30Days: {
        ...this.totals(execution.last30Days[0]),
        personIds: (execution.last30Days[0]?.personIds ?? []).map(String),
      },
      people: {
        activePlanCount: activePlans,
        newLast30DaysCount: newPeople,
        totalCount: totalPeople,
      },
      plans: {
        activeSelectionCount: activeSelections,
        globalReferenceCount: references,
        globalTemplateCount: globalTemplates,
        ownedCount: owned,
      },
      topGlobalPlans,
    };
    this.logger.log('MongoDashboardReadRepository -> readAdmin -> return:', {
      data: {
        totalPeople,
        trainingCount: result.last30Days.completedWorkoutCount,
      },
    });
    return result;
  }

  private async readAdminExecutions(
    range: DashboardReadRange,
  ): Promise<AdminExecutionAggregateResult> {
    this.logger.log(
      'MongoDashboardReadRepository -> readAdminExecutions -> params:',
      { params: { periodStart: range.start.toISOString() } },
    );
    const [result] = await this.executions
      .aggregate<AdminExecutionAggregateResult>([
        {
          $match: {
            completedAt: { $gte: range.start, $lt: range.end },
            status: 'completed',
          },
        },
        {
          $facet: {
            days: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      date: '$completedAt',
                      format: '%Y-%m-%d',
                      timezone: range.timezone,
                    },
                  },
                  count: { $sum: 1 },
                  personIds: { $addToSet: '$personId' },
                },
              },
            ],
            last30Days: [
              {
                $match: {
                  completedAt: {
                    $gte: range.last30DaysStart,
                    $lt: range.last30DaysEnd,
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  completedWorkoutCount: { $sum: 1 },
                  fullCompletionCount: {
                    $sum: { $cond: ['$fullCompletion', 1, 0] },
                  },
                  personIds: { $addToSet: '$personId' },
                  totalDurationSeconds: { $sum: '$durationSeconds' },
                },
              },
            ],
          },
        },
      ])
      .exec();
    const output = result ?? { days: [], last30Days: [] };
    this.logger.log(
      'MongoDashboardReadRepository -> readAdminExecutions -> return:',
      {
        data: {
          dayCount: output.days.length,
          hasLast30Days: output.last30Days.length > 0,
        },
      },
    );
    return output;
  }

  private async readTopGlobalPlans(): Promise<
    AdminDashboardReadModel['topGlobalPlans']
  > {
    this.logger.log(
      'MongoDashboardReadRepository -> readTopGlobalPlans -> params:',
      { params: { limit: 5 } },
    );
    const rows = await this.catalog
      .aggregate<{
        _id: Types.ObjectId;
        activePeopleCount: number;
        linkedPeopleCount: number;
        name: string;
      }>([
        { $match: { kind: 'global-reference' } },
        {
          $lookup: {
            as: 'activeSelections',
            foreignField: 'catalogEntryId',
            from: 'training_plan_active_selections',
            localField: '_id',
          },
        },
        {
          $group: {
            _id: '$globalTrainingPlanId',
            activePeopleCount: {
              $sum: {
                $cond: [{ $gt: [{ $size: '$activeSelections' }, 0] }, 1, 0],
              },
            },
            linkedPeopleCount: { $sum: 1 },
          },
        },
        {
          $lookup: {
            as: 'plan',
            foreignField: '_id',
            from: 'training_plans',
            localField: '_id',
          },
        },
        { $unwind: '$plan' },
        {
          $project: {
            activePeopleCount: 1,
            linkedPeopleCount: 1,
            name: '$plan.name',
          },
        },
        {
          $sort: {
            activePeopleCount: -1,
            linkedPeopleCount: -1,
            name: 1,
            _id: 1,
          },
        },
        { $limit: 5 },
      ])
      .exec();
    const result = rows.map((row) => ({
      activePeopleCount: row.activePeopleCount,
      id: row._id.toString(),
      linkedPeopleCount: row.linkedPeopleCount,
      name: row.name,
    }));
    this.logger.log(
      'MongoDashboardReadRepository -> readTopGlobalPlans -> return:',
      { data: { count: result.length } },
    );
    return result;
  }

  private totals(
    value:
      | (Partial<DashboardExecutionTotals> & { personIds?: Types.ObjectId[] })
      | undefined,
  ): DashboardExecutionTotals {
    this.logger.log('MongoDashboardReadRepository -> totals -> params:', {
      params: { aggregatePresent: value !== undefined },
    });
    const result = {
      completedWorkoutCount: value?.completedWorkoutCount ?? 0,
      fullCompletionCount: value?.fullCompletionCount ?? 0,
      totalDurationSeconds: value?.totalDurationSeconds ?? 0,
    };
    this.logger.log('MongoDashboardReadRepository -> totals -> return:', {
      data: { completedWorkoutCount: result.completedWorkoutCount },
    });
    return result;
  }
}
