import { Injectable, Logger } from '@nestjs/common';

import type { DashboardNextAction } from '@dall-fit/types';

import { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import { WorkoutExecutionRepository } from '~/training/repositories/workout-execution.repository';
import { WorkoutSessionStore } from '~/training/stores/workout-session.store';

export interface TrainingDashboardContext {
  nextAction: DashboardNextAction;
  workoutCount: number | null;
}

@Injectable()
export class TrainingDashboardContextService {
  private readonly logger = new Logger(TrainingDashboardContextService.name);

  constructor(
    private readonly personalPlans: PersonalTrainingPlanService,
    private readonly executions: WorkoutExecutionRepository,
    private readonly sessions: WorkoutSessionStore,
  ) {}

  async resolve(personId: string): Promise<TrainingDashboardContext> {
    this.logger.log('TrainingDashboardContextService -> resolve -> params:', {
      params: { personId },
    });
    const [session, active] = await Promise.all([
      this.sessions.get(personId),
      this.personalPlans.getActiveExecutionPlan(personId),
    ]);
    this.logger.log(
      'TrainingDashboardContextService -> resolve -> dependencies return:',
      {
        data: {
          activePlanFound: active !== null,
          sessionFound: session !== null,
        },
      },
    );
    if (session !== null) {
      const result = {
        nextAction: {
          planName: session.plan.name,
          type: 'resume-workout' as const,
          workoutId: session.workout.id,
          workoutName: session.workout.name,
        },
        workoutCount: session.plan.workoutCount,
      };
      this.logger.log('TrainingDashboardContextService -> resolve -> return:', {
        data: { action: result.nextAction.type, personId },
      });
      return result;
    }
    if (active === null || active.plan.workouts.length === 0) {
      const result = {
        nextAction: { type: 'select-plan' as const },
        workoutCount: active?.plan.workouts.length ?? null,
      };
      this.logger.log('TrainingDashboardContextService -> resolve -> return:', {
        data: { action: result.nextAction.type, personId },
      });
      return result;
    }
    const last = await this.executions.findLastForPlan(
      personId,
      active.plan.id,
    );
    this.logger.log(
      'TrainingDashboardContextService -> resolve -> workoutExecutionRepository return:',
      { data: { found: last !== null } },
    );
    const lastIndex = active.plan.workouts.findIndex(
      (workout) => workout.id === last?.workoutId,
    );
    const nextIndex =
      lastIndex < 0 ? 0 : (lastIndex + 1) % active.plan.workouts.length;
    const workout = active.plan.workouts[nextIndex];
    if (workout === undefined) throw new Error('Active plan has no workout.');
    const result = {
      nextAction: {
        catalogEntryId: active.catalogEntryId,
        planName: active.plan.name,
        type: 'start-workout' as const,
        workoutId: workout.id,
        workoutName: workout.name,
      },
      workoutCount: active.plan.workouts.length,
    };
    this.logger.log('TrainingDashboardContextService -> resolve -> return:', {
      data: { action: result.nextAction.type, personId },
    });
    return result;
  }
}
