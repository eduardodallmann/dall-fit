import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type {
  BodyArea,
  TrainingExerciseExecution,
  TrainingExercisePreview,
  TrainingOverview,
  TrainingSession,
  TrainingWorkoutCard,
  TrainingWorkoutMedia,
  TrainingWorkoutPreview,
  WorkoutExecutionSummary,
} from '@dall-fit/types';

import type { PersonalTrainingExecutionPlan } from '~/training-plan/domain/personal-training-plan.entity';
import type {
  StoredExercise,
  WorkoutAggregate,
} from '~/training-plan/domain/training-plan.entity';
import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import type {
  NewWorkoutExecution,
  StoredTrainingExerciseExecution,
  StoredTrainingWorkoutCard,
  StoredWorkoutExecution,
  WorkoutSessionSnapshot,
} from '~/training/domain/training.types';
import {
  createActiveTrainingPlanNotFoundException,
  createTrainingWorkoutNotFoundException,
  createWorkoutExecutionNotFoundException,
  createWorkoutExerciseNotFoundException,
  createWorkoutExerciseTypeInvalidException,
  createWorkoutIncompleteException,
  createWorkoutLoadInvalidException,
  createWorkoutSeriesAlreadyCompletedException,
  createWorkoutSeriesNotFoundException,
  createWorkoutSessionAlreadyActiveException,
  createWorkoutSessionExpiredException,
  createWorkoutSessionNotFoundException,
  createWorkoutSessionVersionConflictException,
  createWorkoutTimerAlreadyActiveException,
  createWorkoutTimerNotFoundException,
  createWorkoutTimerOutcomeInvalidException,
  createWorkoutTimezoneInvalidException,
} from '~/training/errors/training.errors';
import { WorkoutExecutionRepository } from '~/training/repositories/workout-execution.repository';
import { TrainingClockService } from '~/training/services/training-clock.service';
import { TrainingLoadProfileService } from '~/training/services/training-load-profile.service';
import { WorkoutSessionStore } from '~/training/stores/workout-session.store';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const OFFLINE_PLAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  constructor(
    private readonly personalPlans: PersonalTrainingPlanService,
    private readonly images: ExerciseImageService,
    private readonly loadProfiles: TrainingLoadProfileService,
    private readonly executions: WorkoutExecutionRepository,
    private readonly sessions: WorkoutSessionStore,
    private readonly clock: TrainingClockService,
  ) {}

  async overview(personId: string): Promise<TrainingOverview> {
    this.logger.log('TrainingService -> overview -> params:', {
      params: { personId },
    });
    const [session, active] = await Promise.all([
      this.sessions.get(personId),
      this.personalPlans.getActiveExecutionPlan(personId),
    ]);
    this.logger.log('TrainingService -> overview -> dependencies return:', {
      data: {
        activePlanFound: active !== null,
        sessionFound: session !== null,
      },
    });
    const validatedAt = this.clock.now();
    this.logger.log('TrainingService -> overview -> clock return:', {
      data: { resolved: true },
    });
    const offlineValidity =
      active === null
        ? null
        : {
            expiresAt: new Date(
              validatedAt.getTime() + OFFLINE_PLAN_TTL_MS,
            ).toISOString(),
            validatedAt: validatedAt.toISOString(),
          };
    const offlinePreparation =
      active === null
        ? null
        : {
            plan: this.planSummary(active),
            workoutIds: active.plan.workouts.map((workout) => workout.id),
          };
    if (session !== null) {
      const workouts = await Promise.all(
        session.planWorkouts.map(async (workout) => ({
          ...(await this.toWorkoutCard(workout)),
          indicator:
            workout.id === session.workout.id ? ('in-progress' as const) : null,
        })),
      );
      const result = {
        offlinePreparation,
        offlineValidity,
        plan: session.plan,
        workouts,
      };
      this.logger.log('TrainingService -> overview -> return:', {
        data: { personId, source: 'session', workoutCount: workouts.length },
      });
      return result;
    }
    if (active === null) {
      const result = {
        offlinePreparation: null,
        offlineValidity: null,
        plan: null,
        workouts: [],
      };
      this.logger.log('TrainingService -> overview -> return:', {
        data: { personId, source: 'empty', workoutCount: 0 },
      });
      return result;
    }
    const last = await this.executions.findLastForPlan(
      personId,
      active.plan.id,
    );
    this.logger.log(
      'TrainingService -> overview -> workoutExecutionRepository return:',
      { data: { executionFound: last !== null } },
    );
    const currentId = this.resolveCurrentWorkoutId(active, last?.workoutId);
    const workouts = await Promise.all(
      active.plan.workouts.map(async (workout) => ({
        ...(await this.toWorkoutCard(this.snapshotWorkoutCard(workout))),
        indicator: workout.id === currentId ? ('current' as const) : null,
      })),
    );
    const result = {
      offlinePreparation,
      offlineValidity,
      plan: this.planSummary(active),
      workouts,
    };
    this.logger.log('TrainingService -> overview -> return:', {
      data: { personId, source: 'active-plan', workoutCount: workouts.length },
    });
    return result;
  }

  async preview(
    personId: string,
    workoutId: string,
  ): Promise<TrainingWorkoutPreview> {
    this.logger.log('TrainingService -> preview -> params:', {
      params: { personId, workoutId },
    });
    const active = await this.requireActivePlan(personId);
    const workout = this.requireWorkout(active, workoutId);
    const setExerciseIds = workout.exercises
      .filter(isSetExercise)
      .map((exercise) => exercise.id);
    const profiles = await this.loadProfiles.findForExercises(
      personId,
      active.plan.id,
      setExerciseIds,
    );
    const loadsByExercise = new Map(
      profiles.map((profile) => [profile.exerciseId, profile.loadsKg]),
    );
    const publicExercises = await this.images.hydrateExercises(
      workout.exercises,
    );
    const exercises = publicExercises.map(
      (exercise, index): TrainingExercisePreview => {
        if (exercise.type === 'image') {
          const storedExercise = workout.exercises[index];
          const image =
            exercise.image !== null &&
            storedExercise?.type === 'image' &&
            storedExercise.image !== null
              ? {
                  ...exercise.image,
                  offlineMediaId: this.images.createOfflineMediaId(
                    storedExercise.image,
                  ),
                }
              : null;
          return {
            ...exercise,
            image,
            lastLoadsKg: Array.from(
              { length: exercise.sets },
              (_, index) => loadsByExercise.get(exercise.id)?.[index] ?? null,
            ),
          };
        }
        if (exercise.type === 'youtube-short') {
          return {
            ...exercise,
            lastLoadsKg: Array.from(
              { length: exercise.sets },
              (_, index) => loadsByExercise.get(exercise.id)?.[index] ?? null,
            ),
          };
        }
        return exercise;
      },
    );
    const result = {
      exercises,
      plan: this.planSummary(active),
      workout: { id: workout.id, name: workout.name },
    };
    this.logger.log('TrainingService -> preview -> return:', {
      data: { exerciseCount: exercises.length, personId, workoutId },
    });
    return result;
  }

  async start(personId: string, workoutId: string): Promise<TrainingSession> {
    this.logger.log('TrainingService -> start -> params:', {
      params: { personId, workoutId },
    });
    if ((await this.sessions.get(personId)) !== null)
      throw createWorkoutSessionAlreadyActiveException();
    const active = await this.requireActivePlan(personId);
    const workout = this.requireWorkout(active, workoutId);
    const profiles = await this.loadProfiles.findForExercises(
      personId,
      active.plan.id,
      workout.exercises.filter(isSetExercise).map((exercise) => exercise.id),
    );
    const loadsByExercise = new Map(
      profiles.map((profile) => [profile.exerciseId, profile.loadsKg]),
    );
    const now = this.clock.now();
    const snapshot: WorkoutSessionSnapshot = {
      activeTimer: null,
      exercises: workout.exercises.map((exercise) =>
        this.snapshotExercise(exercise, loadsByExercise.get(exercise.id)),
      ),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      id: randomUUID(),
      personId,
      plan: this.planSummary(active),
      planWorkouts: active.plan.workouts.map((item) =>
        this.snapshotWorkoutCard(item),
      ),
      startedAt: now.toISOString(),
      version: 0,
      workout: { id: workout.id, name: workout.name },
    };
    await this.sessions.create(snapshot);
    const result = await this.toPublicSession(snapshot, now);
    this.logger.log('TrainingService -> start -> return:', {
      data: { personId, sessionId: snapshot.id, version: result.version },
    });
    return result;
  }

  async getSession(personId: string): Promise<TrainingSession> {
    this.logger.log('TrainingService -> getSession -> params:', {
      params: { personId },
    });
    let session = await this.requireSession(personId);
    const now = this.clock.now();
    if (
      session.activeTimer !== null &&
      new Date(session.activeTimer.endsAt).getTime() <= now.getTime()
    ) {
      const timer = session.activeTimer;
      session = await this.sessions.update(
        personId,
        session.id,
        session.version,
        (current) => this.resolveTimerState(current, timer.kind, 'finish', now),
      );
    }
    const result = await this.toPublicSession(session, now);
    this.logger.log('TrainingService -> getSession -> return:', {
      data: { personId, sessionId: session.id, version: result.version },
    });
    return result;
  }

  async abandon(personId: string): Promise<void> {
    this.logger.log('TrainingService -> abandon -> params:', {
      params: { personId },
    });
    const session = await this.requireSession(personId);
    await this.sessions.delete(personId, session.id);
    this.logger.log('TrainingService -> abandon -> completed:', {
      data: { personId, sessionId: session.id },
    });
  }

  async updateLoad(
    personId: string,
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
    expectedVersion: number,
  ): Promise<TrainingSession> {
    this.logMutationParams('updateLoad', {
      exerciseId,
      expectedVersion,
      loadPresent: loadKg !== null,
      personId,
      seriesNumber,
    });
    this.assertLoad(loadKg);
    const result = await this.mutateSession(
      personId,
      expectedVersion,
      (session) => {
        this.assertNoTimer(session);
        const exercise = this.requireSetExercise(session, exerciseId);
        const series = this.requireSeries(exercise, seriesNumber);
        if (series.completedAt !== null)
          throw createWorkoutSeriesAlreadyCompletedException();
        return this.replaceExercise(session, exerciseId, {
          ...exercise,
          series: exercise.series?.map((item) =>
            item.number === seriesNumber ? { ...item, loadKg } : item,
          ),
        });
      },
    );
    this.logSessionReturn('updateLoad', personId, result);
    return result;
  }

  async completeSeries(
    personId: string,
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
    expectedVersion: number,
  ): Promise<TrainingSession> {
    this.logMutationParams('completeSeries', {
      exerciseId,
      expectedVersion,
      loadPresent: loadKg !== null,
      personId,
      seriesNumber,
    });
    this.assertLoad(loadKg);
    const now = this.clock.now();
    const result = await this.mutateSession(
      personId,
      expectedVersion,
      (session) => {
        this.assertNoTimer(session);
        const exercise = this.requireSetExercise(session, exerciseId);
        const series = this.requireSeries(exercise, seriesNumber);
        const firstIncomplete = exercise.series?.find(
          (item) => item.completedAt === null,
        );
        if (
          series.completedAt !== null ||
          firstIncomplete?.number !== seriesNumber
        )
          throw createWorkoutSeriesAlreadyCompletedException();
        const completedAt = now.toISOString();
        const nextSeries = exercise.series?.map((item) =>
          item.number === seriesNumber
            ? { ...item, completedAt, loadKg }
            : item,
        );
        const completed = nextSeries?.every(
          (item) => item.completedAt !== null,
        );
        const nextExercise = {
          ...exercise,
          completedAt: completed ? completedAt : null,
          series: nextSeries,
        };
        const next = this.replaceExercise(session, exerciseId, nextExercise);
        if (completed || exercise.restSeconds <= 0) return next;
        return {
          ...next,
          activeTimer: {
            endsAt: new Date(
              now.getTime() + exercise.restSeconds * 1000,
            ).toISOString(),
            exerciseId,
            kind: 'series-rest',
            seriesNumber,
            startedAt: completedAt,
          },
        };
      },
    );
    this.logSessionReturn('completeSeries', personId, result);
    return result;
  }

  async completeRemainingSeries(
    personId: string,
    exerciseId: string,
    loadsKg: readonly (number | null)[],
    expectedVersion: number,
  ): Promise<TrainingSession> {
    this.logMutationParams('completeRemainingSeries', {
      exerciseId,
      expectedVersion,
      personId,
      seriesCount: loadsKg.length,
    });
    loadsKg.forEach((load) => this.assertLoad(load));
    const now = this.clock.now().toISOString();
    const result = await this.mutateSession(
      personId,
      expectedVersion,
      (session) => {
        this.assertNoTimer(session);
        const exercise = this.requireSetExercise(session, exerciseId);
        if (loadsKg.length !== exercise.series?.length)
          throw createWorkoutLoadInvalidException();
        return this.replaceExercise(session, exerciseId, {
          ...exercise,
          completedAt: now,
          series: exercise.series.map((series, index) => ({
            ...series,
            completedAt: series.completedAt ?? now,
            loadKg:
              series.completedAt === null
                ? (loadsKg[index] ?? null)
                : series.loadKg,
          })),
        });
      },
    );
    this.logSessionReturn('completeRemainingSeries', personId, result);
    return result;
  }

  async startTimer(
    personId: string,
    exerciseId: string,
    kind: 'duration' | 'pause',
    expectedVersion: number,
  ): Promise<TrainingSession> {
    this.logMutationParams('startTimer', {
      exerciseId,
      expectedVersion,
      kind,
      personId,
    });
    const now = this.clock.now();
    const result = await this.mutateSession(
      personId,
      expectedVersion,
      (session) => {
        this.assertNoTimer(session);
        const exercise = this.requireExercise(session, exerciseId);
        if (exercise.type !== kind || exercise.completedAt !== null)
          throw createWorkoutExerciseTypeInvalidException();
        const seconds =
          exercise.type === 'pause'
            ? exercise.restSeconds
            : exercise.durationMinutes * 60;
        return {
          ...session,
          activeTimer: {
            endsAt: new Date(now.getTime() + seconds * 1000).toISOString(),
            exerciseId,
            kind,
            startedAt: now.toISOString(),
          },
        };
      },
    );
    this.logSessionReturn('startTimer', personId, result);
    return result;
  }

  async resolveTimer(
    personId: string,
    outcome: 'cancel' | 'finish' | 'skip',
    expectedVersion: number,
  ): Promise<TrainingSession> {
    this.logMutationParams('resolveTimer', {
      expectedVersion,
      outcome,
      personId,
    });
    const now = this.clock.now();
    const result = await this.mutateSession(
      personId,
      expectedVersion,
      (session) => {
        if (session.activeTimer === null)
          throw createWorkoutTimerNotFoundException();
        return this.resolveTimerState(
          session,
          session.activeTimer.kind,
          outcome,
          now,
        );
      },
    );
    this.logSessionReturn('resolveTimer', personId, result);
    return result;
  }

  async completeExercise(
    personId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<TrainingSession> {
    this.logMutationParams('completeExercise', {
      exerciseId,
      expectedVersion,
      personId,
    });
    const now = this.clock.now().toISOString();
    const result = await this.mutateSession(
      personId,
      expectedVersion,
      (session) => {
        this.assertNoTimer(session);
        const exercise = this.requireExercise(session, exerciseId);
        if (exercise.type !== 'youtube-long')
          throw createWorkoutExerciseTypeInvalidException();
        return this.replaceExercise(session, exerciseId, {
          ...exercise,
          completedAt: now,
        });
      },
    );
    this.logSessionReturn('completeExercise', personId, result);
    return result;
  }

  async restartExercise(
    personId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<TrainingSession> {
    this.logMutationParams('restartExercise', {
      exerciseId,
      expectedVersion,
      personId,
    });
    const result = await this.mutateSession(
      personId,
      expectedVersion,
      (session) => {
        this.assertNoTimer(session);
        const exercise = this.requireExercise(session, exerciseId);
        const next: StoredTrainingExerciseExecution =
          isSetExercise(exercise) && exercise.series !== undefined
            ? {
                ...exercise,
                completedAt: null,
                series: exercise.series.map((series) => ({
                  ...series,
                  completedAt: null,
                })),
              }
            : { ...exercise, completedAt: null };
        return this.replaceExercise(session, exerciseId, next);
      },
    );
    this.logSessionReturn('restartExercise', personId, result);
    return result;
  }

  async completeSession(
    personId: string,
    expectedVersion: number,
    confirmIncomplete: boolean,
    timezone: string,
  ): Promise<WorkoutExecutionSummary> {
    this.logger.log('TrainingService -> completeSession -> params:', {
      params: { expectedVersion, personId },
    });
    this.assertTimezone(timezone);
    const session = await this.sessions.get(personId);
    if (session === null) {
      const receipt = await this.sessions.getCompletionReceipt(personId);
      if (receipt !== null) {
        const previous = await this.executions.findById(personId, receipt);
        if (previous !== null) {
          const repeated = await this.toCompletion(personId, previous);
          this.logger.log(
            'TrainingService -> completeSession -> receipt branch:',
            { data: { executionId: repeated.id, personId } },
          );
          return repeated;
        }
      }
      if (await this.sessions.wasRecentlyExpired(personId))
        throw createWorkoutSessionExpiredException();
      throw createWorkoutSessionNotFoundException();
    }
    if (session.version !== expectedVersion)
      return this.forceVersionConflict(personId, expectedVersion, session);
    if (session.activeTimer !== null)
      throw createWorkoutTimerAlreadyActiveException();
    const completedExercises = session.exercises.filter(
      (exercise) => exercise.completedAt !== null,
    );
    const fullCompletion =
      completedExercises.length === session.exercises.length;
    if (!fullCompletion && !confirmIncomplete)
      throw createWorkoutIncompleteException();
    const now = this.clock.now();
    const input = this.executionInput(
      session,
      completedExercises,
      fullCompletion,
      now,
      timezone,
    );
    const started = await this.executions.begin(input);
    if (started.status !== 'completed') {
      await this.persistLoadProfiles(personId, session);
    }
    const execution =
      started.status === 'completed'
        ? started
        : await this.executions.complete(personId, session.id);
    await this.sessions.saveCompletionReceipt(personId, execution.id);
    await this.sessions.delete(personId, session.id);
    const result = await this.toCompletion(personId, execution);
    this.logger.log('TrainingService -> completeSession -> return:', {
      data: { executionId: result.id, personId },
    });
    return result;
  }

  async completion(
    personId: string,
    executionId: string,
  ): Promise<WorkoutExecutionSummary> {
    this.logger.log('TrainingService -> completion -> params:', {
      params: { executionId, personId },
    });
    const execution = await this.executions.findById(personId, executionId);
    if (execution === null) throw createWorkoutExecutionNotFoundException();
    const result = await this.toCompletion(personId, execution);
    this.logger.log('TrainingService -> completion -> return:', {
      data: { executionId, personId },
    });
    return result;
  }

  private async mutateSession(
    personId: string,
    expectedVersion: number,
    mutate: (session: WorkoutSessionSnapshot) => WorkoutSessionSnapshot,
  ): Promise<TrainingSession> {
    const current = await this.requireSession(personId);
    const next = await this.sessions.update(
      personId,
      current.id,
      expectedVersion,
      mutate,
    );
    const result = await this.toPublicSession(next, this.clock.now());
    return result;
  }

  private logMutationParams(
    method: string,
    params: Record<string, unknown>,
  ): void {
    this.logger.log(`TrainingService -> ${method} -> params:`, { params });
  }

  private logSessionReturn(
    method: string,
    personId: string,
    session: TrainingSession,
  ): void {
    this.logger.log(`TrainingService -> ${method} -> return:`, {
      data: { personId, version: session.version },
    });
  }

  private async requireActivePlan(
    personId: string,
  ): Promise<PersonalTrainingExecutionPlan> {
    const result = await this.personalPlans.getActiveExecutionPlan(personId);
    if (result === null) throw createActiveTrainingPlanNotFoundException();
    return result;
  }

  private requireWorkout(
    active: PersonalTrainingExecutionPlan,
    workoutId: string,
  ): WorkoutAggregate {
    const result = active.plan.workouts.find(
      (workout) => workout.id === workoutId,
    );
    if (result === undefined) throw createTrainingWorkoutNotFoundException();
    return result;
  }

  private async requireSession(
    personId: string,
  ): Promise<WorkoutSessionSnapshot> {
    const result = await this.sessions.get(personId);
    if (result === null) {
      if (await this.sessions.wasRecentlyExpired(personId))
        throw createWorkoutSessionExpiredException();
      throw createWorkoutSessionNotFoundException();
    }
    return result;
  }

  private requireExercise(
    session: WorkoutSessionSnapshot,
    exerciseId: string,
  ): StoredTrainingExerciseExecution {
    const result = session.exercises.find(
      (exercise) => exercise.id === exerciseId,
    );
    if (result === undefined) throw createWorkoutExerciseNotFoundException();
    return result;
  }

  private requireSetExercise(
    session: WorkoutSessionSnapshot,
    exerciseId: string,
  ): StoredTrainingExerciseExecution & {
    restSeconds: number;
    series: readonly NonNullable<
      StoredTrainingExerciseExecution['series']
    >[number][];
  } {
    const exercise = this.requireExercise(session, exerciseId);
    if (!isSetExercise(exercise) || exercise.series === undefined)
      throw createWorkoutExerciseTypeInvalidException();
    return exercise as StoredTrainingExerciseExecution & {
      restSeconds: number;
      series: readonly NonNullable<
        StoredTrainingExerciseExecution['series']
      >[number][];
    };
  }

  private requireSeries(
    exercise: StoredTrainingExerciseExecution & {
      series: readonly NonNullable<
        StoredTrainingExerciseExecution['series']
      >[number][];
    },
    seriesNumber: number,
  ) {
    const result = exercise.series.find(
      (series) => series.number === seriesNumber,
    );
    if (result === undefined) throw createWorkoutSeriesNotFoundException();
    return result;
  }

  private replaceExercise(
    session: WorkoutSessionSnapshot,
    exerciseId: string,
    nextExercise: StoredTrainingExerciseExecution,
  ): WorkoutSessionSnapshot {
    const result = {
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.id === exerciseId ? nextExercise : exercise,
      ),
    };
    return result;
  }

  private resolveTimerState(
    session: WorkoutSessionSnapshot,
    kind: 'duration' | 'pause' | 'series-rest',
    outcome: 'cancel' | 'finish' | 'skip',
    now: Date,
  ): WorkoutSessionSnapshot {
    const timer = session.activeTimer;
    if (timer === null || timer.kind !== kind)
      throw createWorkoutTimerNotFoundException();
    if (kind === 'series-rest') {
      if (outcome === 'cancel')
        throw createWorkoutTimerOutcomeInvalidException();
      return { ...session, activeTimer: null };
    }
    if (kind === 'pause') {
      if (outcome === 'cancel')
        throw createWorkoutTimerOutcomeInvalidException();
      const exercise = this.requireExercise(session, timer.exerciseId);
      return this.replaceExercise(
        { ...session, activeTimer: null },
        exercise.id,
        { ...exercise, completedAt: now.toISOString() },
      );
    }
    if (outcome === 'skip') throw createWorkoutTimerOutcomeInvalidException();
    if (outcome === 'cancel') return { ...session, activeTimer: null };
    const exercise = this.requireExercise(session, timer.exerciseId);
    return this.replaceExercise(
      { ...session, activeTimer: null },
      exercise.id,
      { ...exercise, completedAt: now.toISOString() },
    );
  }

  private assertNoTimer(session: WorkoutSessionSnapshot): void {
    if (session.activeTimer !== null)
      throw createWorkoutTimerAlreadyActiveException();
  }

  private assertLoad(loadKg: number | null): void {
    if (
      loadKg !== null &&
      (!Number.isInteger(loadKg) || loadKg < 0 || loadKg > 9999)
    ) {
      throw createWorkoutLoadInvalidException();
    }
  }

  private assertTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw createWorkoutTimezoneInvalidException();
    }
  }

  private planSummary(active: PersonalTrainingExecutionPlan) {
    const result = {
      catalogEntryId: active.catalogEntryId,
      id: active.plan.id,
      name: active.plan.name,
      source: active.source,
      workoutCount: active.plan.workouts.length,
    };
    return result;
  }

  private snapshotWorkoutCard(
    workout: WorkoutAggregate,
  ): StoredTrainingWorkoutCard {
    const bodyAreas: BodyArea[] = [];
    for (const exercise of workout.exercises) {
      if ('bodyArea' in exercise && !bodyAreas.includes(exercise.bodyArea))
        bodyAreas.push(exercise.bodyArea);
    }
    const firstMediaExercise =
      workout.exercises.find(
        (exercise) =>
          exercise.type === 'youtube-long' ||
          exercise.type === 'youtube-short' ||
          (exercise.type === 'image' && exercise.image !== null),
      ) ?? null;
    const result = {
      bodyAreas,
      firstMediaExercise,
      id: workout.id,
      name: workout.name,
    };
    return result;
  }

  private async toWorkoutCard(
    workout: StoredTrainingWorkoutCard,
  ): Promise<Omit<TrainingWorkoutCard, 'indicator'>> {
    let media: TrainingWorkoutMedia | null = null;
    const exercise = workout.firstMediaExercise;
    if (exercise?.type === 'image' && exercise.image !== null) {
      media = {
        image: await this.images.createSignedImage(exercise.image),
        type: 'image',
      };
    } else if (
      exercise?.type === 'youtube-long' ||
      exercise?.type === 'youtube-short'
    ) {
      media = { type: exercise.type, youtubeId: exercise.youtubeId };
    }
    const result = {
      bodyAreas: workout.bodyAreas,
      id: workout.id,
      media,
      name: workout.name,
    };
    return result;
  }

  private snapshotExercise(
    exercise: StoredExercise,
    loadsKg: readonly (number | null)[] | undefined,
  ): StoredTrainingExerciseExecution {
    if (isSetExercise(exercise)) {
      return {
        ...exercise,
        completedAt: null,
        series: Array.from({ length: exercise.sets }, (_, index) => ({
          completedAt: null,
          loadKg: loadsKg?.[index] ?? null,
          number: index + 1,
          repetitions: exercise.repetitions,
        })),
      };
    }
    return { ...exercise, completedAt: null };
  }

  private async toPublicSession(
    session: WorkoutSessionSnapshot,
    now: Date,
  ): Promise<TrainingSession> {
    const exercises = await Promise.all(
      session.exercises.map(
        async (stored): Promise<TrainingExerciseExecution> => {
          const publicExercise = await this.images.toPublicExercise(stored);
          return {
            ...publicExercise,
            completedAt: stored.completedAt,
            ...('series' in stored && stored.series !== undefined
              ? { series: stored.series }
              : {}),
          } as TrainingExerciseExecution;
        },
      ),
    );
    const result = {
      activeTimer: session.activeTimer,
      exercises,
      expiresAt: session.expiresAt,
      id: session.id,
      plan: session.plan,
      serverNow: now.toISOString(),
      startedAt: session.startedAt,
      version: session.version,
      workout: session.workout,
    };
    return result;
  }

  private resolveCurrentWorkoutId(
    active: PersonalTrainingExecutionPlan,
    lastWorkoutId: string | undefined,
  ): string | null {
    if (active.plan.workouts.length === 0) return null;
    if (lastWorkoutId === undefined) return active.plan.workouts[0]?.id ?? null;
    const lastIndex = active.plan.workouts.findIndex(
      (workout) => workout.id === lastWorkoutId,
    );
    if (lastIndex < 0) return active.plan.workouts[0]?.id ?? null;
    return (
      active.plan.workouts[(lastIndex + 1) % active.plan.workouts.length]?.id ??
      null
    );
  }

  private executionInput(
    session: WorkoutSessionSnapshot,
    completedExercises: readonly StoredTrainingExerciseExecution[],
    fullCompletion: boolean,
    now: Date,
    timezone: string,
  ): NewWorkoutExecution {
    const bodyAreas: BodyArea[] = [];
    for (const exercise of completedExercises) {
      if ('bodyArea' in exercise && !bodyAreas.includes(exercise.bodyArea))
        bodyAreas.push(exercise.bodyArea);
    }
    const totalLoadKg = completedExercises.reduce(
      (total, exercise) =>
        total +
        (exercise.series?.reduce(
          (sum, series) =>
            sum +
            (series.completedAt !== null && series.loadKg !== null
              ? series.loadKg
              : 0),
          0,
        ) ?? 0),
      0,
    );
    const result = {
      bodyAreas,
      catalogEntryId: session.plan.catalogEntryId,
      completedAt: now,
      completedExerciseCount: completedExercises.length,
      durationSeconds: Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
        ),
      ),
      fullCompletion,
      personId: session.personId,
      planName: session.plan.name,
      sessionId: session.id,
      source: session.plan.source,
      startedAt: new Date(session.startedAt),
      timezone,
      totalExerciseCount: session.exercises.length,
      totalLoadKg,
      trainingPlanId: session.plan.id,
      workoutCount: session.plan.workoutCount,
      workoutId: session.workout.id,
      workoutName: session.workout.name,
    };
    return result;
  }

  private async persistLoadProfiles(
    personId: string,
    session: WorkoutSessionSnapshot,
  ): Promise<void> {
    const currentPlan = await this.personalPlans.findExecutionPlan(
      personId,
      session.plan.catalogEntryId,
    );
    const currentWorkout = currentPlan?.plan.workouts.find(
      (workout) => workout.id === session.workout.id,
    );
    const eligibleExerciseIds = new Set(
      currentWorkout?.exercises.map((exercise) => exercise.id) ?? [],
    );
    const exercises = session.exercises.filter(
      (exercise) =>
        eligibleExerciseIds.has(exercise.id) &&
        isSetExercise(exercise) &&
        exercise.series?.some((series) => series.completedAt !== null),
    );
    const existing = await this.loadProfiles.findForExercises(
      personId,
      session.plan.id,
      exercises.map((exercise) => exercise.id),
    );
    const previous = new Map(
      existing.map((profile) => [profile.exerciseId, profile.loadsKg]),
    );
    for (const exercise of exercises) {
      const series = exercise.series ?? [];
      const before = previous.get(exercise.id) ?? [];
      const loadsKg = series.map((item, index) =>
        item.completedAt === null ? (before[index] ?? null) : item.loadKg,
      );
      await this.loadProfiles.save({
        exerciseId: exercise.id,
        loadsKg,
        personId,
        sessionId: session.id,
        trainingPlanId: session.plan.id,
        workoutId: session.workout.id,
      });
    }
  }

  private async toCompletion(
    personId: string,
    execution: StoredWorkoutExecution,
  ): Promise<WorkoutExecutionSummary> {
    const range = this.weekRange(execution.completedAt, execution.timezone);
    const weekExecutions = await this.executions.listCompletedBetween(
      personId,
      range.start,
      range.end,
    );
    const completedDates = new Set(
      weekExecutions.map((item) =>
        this.localDate(item.completedAt, execution.timezone),
      ),
    );
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(range.mondayOrdinal + index * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return {
        completed: completedDates.has(date),
        date,
        weekday: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      };
    });
    const result = {
      bodyAreas: execution.bodyAreas,
      completedAt: execution.completedAt.toISOString(),
      completedExerciseCount: execution.completedExerciseCount,
      createdAt: execution.createdAt.toISOString(),
      durationSeconds: execution.durationSeconds,
      fullCompletion: execution.fullCompletion,
      id: execution.id,
      planName: execution.planName,
      totalExerciseCount: execution.totalExerciseCount,
      totalLoadKg: execution.totalLoadKg,
      trainingPlanId: execution.trainingPlanId,
      updatedAt: execution.updatedAt.toISOString(),
      week: {
        completedWorkoutCount: weekExecutions.length,
        days,
        workoutCount: execution.workoutCount,
      },
      workoutId: execution.workoutId,
      workoutName: execution.workoutName,
    };
    return result;
  }

  private weekRange(date: Date, timezone: string) {
    const localDate = this.localDate(date, timezone);
    const [year, month, day] = localDate.split('-').map(Number) as [
      number,
      number,
      number,
    ];
    const ordinal = Date.UTC(year, month - 1, day);
    const weekday = new Date(ordinal).getUTCDay() || 7;
    const mondayOrdinal = ordinal - (weekday - 1) * 86_400_000;
    const nextMondayOrdinal = mondayOrdinal + 7 * 86_400_000;
    const start = this.localMidnightToUtc(mondayOrdinal, timezone);
    const end = this.localMidnightToUtc(nextMondayOrdinal, timezone);
    const result = { end, mondayOrdinal, start };
    return result;
  }

  private localDate(date: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    }).formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    const result = `${read('year')}-${read('month')}-${read('day')}`;
    return result;
  }

  private localMidnightToUtc(localOrdinal: number, timezone: string): Date {
    let candidate = localOrdinal;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        second: '2-digit',
        timeZone: timezone,
        year: 'numeric',
      }).formatToParts(new Date(candidate));
      const read = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value ?? 0);
      const represented = Date.UTC(
        read('year'),
        read('month') - 1,
        read('day'),
        read('hour'),
        read('minute'),
        read('second'),
      );
      candidate -= represented - localOrdinal;
    }
    const result = new Date(candidate);
    return result;
  }

  private forceVersionConflict(
    personId: string,
    expectedVersion: number,
    session: WorkoutSessionSnapshot,
  ): never {
    this.logger.warn('TrainingService -> completeSession -> versionConflict:', {
      data: { actualVersion: session.version, expectedVersion, personId },
    });
    throw createWorkoutSessionVersionConflictException();
  }
}

function isSetExercise(
  exercise: StoredExercise | StoredTrainingExerciseExecution,
): exercise is Extract<StoredExercise, { type: 'image' | 'youtube-short' }> &
  StoredTrainingExerciseExecution {
  return exercise.type === 'image' || exercise.type === 'youtube-short';
}
