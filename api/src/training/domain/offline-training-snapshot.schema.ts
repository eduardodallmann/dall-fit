import { z } from 'zod';

import {
  BODY_AREAS,
  type PutOfflineTrainingSnapshotV1Request,
} from '@dall-fit/types';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i);
const timestamp = z.iso.datetime({ offset: true });
const resourceName = z.string().min(1).max(120).regex(/\S/);
const exerciseName = z.string().min(1).max(40).regex(/\S/);
const youtubeId = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
const bodyArea = z.enum(BODY_AREAS);
const completedAt = timestamp.nullable();

const series = z
  .object({
    completedAt,
    loadKg: z.number().int().min(0).max(9999).nullable(),
    number: z.number().int().min(1).max(100),
    repetitions: z.number().int().min(1).max(1000),
  })
  .strict();

const setsState = {
  bodyArea,
  completedAt,
  id: mongoId,
  name: exerciseName,
  repetitions: z.number().int().min(1).max(1000),
  restSeconds: z.number().int().min(0).max(3600),
  series: z.array(series).max(100),
  sets: z.number().int().min(1).max(100),
};

const youtubeShortExercise = z
  .object({
    ...setsState,
    type: z.literal('youtube-short'),
    youtubeId,
  })
  .strict()
  .refine((exercise) => exercise.series.length === exercise.sets, {
    path: ['series'],
  });

const imageExercise = z
  .object({ ...setsState, type: z.literal('image') })
  .strict()
  .refine((exercise) => exercise.series.length === exercise.sets, {
    path: ['series'],
  });

const youtubeLongExercise = z
  .object({
    bodyArea,
    completedAt,
    id: mongoId,
    name: exerciseName,
    type: z.literal('youtube-long'),
    youtubeId,
  })
  .strict();

const pauseExercise = z
  .object({
    completedAt,
    id: mongoId,
    restSeconds: z.number().int().min(1).max(3600),
    type: z.literal('pause'),
  })
  .strict();

const durationExercise = z
  .object({
    bodyArea,
    completedAt,
    durationMinutes: z.number().int().min(1).max(1440),
    id: mongoId,
    instructions: z.string().min(1).max(1000).optional(),
    name: exerciseName,
    type: z.literal('duration'),
    youtubeId: youtubeId.optional(),
  })
  .strict();

const exercise = z.discriminatedUnion('type', [
  youtubeShortExercise,
  imageExercise,
  youtubeLongExercise,
  pauseExercise,
  durationExercise,
]);

const timer = z
  .object({
    durationSeconds: z.number().int().min(1).max(86_400),
    exerciseId: mongoId,
    kind: z.enum(['duration', 'pause', 'series-rest']),
    seriesNumber: z.number().int().min(1).max(100).optional(),
    startedAt: timestamp,
  })
  .strict();

const snapshotPlan = z
  .object({
    catalogEntryId: mongoId,
    name: resourceName,
    planId: mongoId,
    source: z.enum(['global-reference', 'owned']),
    workouts: z
      .array(
        z
          .object({
            bodyAreas: z.array(bodyArea).max(BODY_AREAS.length),
            id: mongoId,
            name: resourceName,
          })
          .strict(),
      )
      .min(1)
      .max(25),
  })
  .strict();

const snapshotWorkout = z
  .object({
    exercises: z.array(exercise).max(50),
    id: mongoId,
    name: resourceName,
  })
  .strict();

const snapshotCommon = {
  plan: snapshotPlan,
  startedAt: timestamp,
  workout: snapshotWorkout,
};

const snapshot = z.discriminatedUnion('state', [
  z
    .object({
      ...snapshotCommon,
      activeTimer: timer.nullable(),
      state: z.literal('in-progress'),
    })
    .strict(),
  z
    .object({
      ...snapshotCommon,
      activeTimer: z.null(),
      completedAt: timestamp,
      state: z.literal('completed'),
      timezone: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      ...snapshotCommon,
      activeTimer: z.null(),
      cancelledAt: timestamp,
      state: z.literal('cancelled'),
    })
    .strict(),
]);

const offlineTrainingSnapshotBaseSchema = z
  .object({
    clientUpdatedAt: timestamp,
    executionId: z.uuidv4(),
    installationId: z.uuidv4(),
    leaseId: z.uuidv4(),
    payloadVersion: z.literal(1),
    resolution: z
      .object({
        choice: z.enum(['local', 'server']),
        conflictToken: z.string().regex(/^[a-f\d]{64}$/),
      })
      .strict()
      .optional(),
    revision: z.number().int().min(0).max(2_147_483_647),
    snapshot,
  })
  .strict();

type ParsedOfflineTrainingSnapshotRequest = z.infer<
  typeof offlineTrainingSnapshotBaseSchema
>;

function validatePlanRelations(
  request: ParsedOfflineTrainingSnapshotRequest,
  context: z.RefinementCtx,
): void {
  const planWorkoutIds = request.snapshot.plan.workouts.map(({ id }) => id);
  if (new Set(planWorkoutIds).size !== planWorkoutIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['snapshot', 'plan', 'workouts'],
    });
  }
  if (!planWorkoutIds.includes(request.snapshot.workout.id)) {
    context.addIssue({ code: 'custom', path: ['snapshot', 'workout', 'id'] });
  }
  const capturedWorkout = request.snapshot.plan.workouts.find(
    ({ id }) => id === request.snapshot.workout.id,
  );
  if (capturedWorkout?.name !== request.snapshot.workout.name) {
    context.addIssue({ code: 'custom', path: ['snapshot', 'workout', 'name'] });
  }
  const hasRepeatedBodyArea = request.snapshot.plan.workouts.some(
    ({ bodyAreas }) => new Set(bodyAreas).size !== bodyAreas.length,
  );
  if (hasRepeatedBodyArea) {
    context.addIssue({
      code: 'custom',
      path: ['snapshot', 'plan', 'workouts'],
    });
  }
}

function validateExerciseRelations(
  request: ParsedOfflineTrainingSnapshotRequest,
  context: z.RefinementCtx,
): void {
  const exerciseIds = request.snapshot.workout.exercises.map(({ id }) => id);
  if (new Set(exerciseIds).size !== exerciseIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['snapshot', 'workout', 'exercises'],
    });
  }
  for (const item of request.snapshot.workout.exercises) {
    if ('series' in item) {
      const consecutive = item.series.every(
        (itemSeries, index) => itemSeries.number === index + 1,
      );
      const hasSeriesBeforeStart = item.series.some(
        (itemSeries) =>
          itemSeries.completedAt !== null &&
          Date.parse(itemSeries.completedAt) <
            Date.parse(request.snapshot.startedAt),
      );
      if (!consecutive || hasSeriesBeforeStart) {
        context.addIssue({
          code: 'custom',
          path: ['snapshot', 'workout', 'exercises', 'series'],
        });
      }
    }
    if (
      item.completedAt !== null &&
      Date.parse(item.completedAt) < Date.parse(request.snapshot.startedAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['snapshot', 'workout', 'exercises'],
      });
    }
  }
}

function hasCompatibleTimer(
  request: ParsedOfflineTrainingSnapshotRequest,
): boolean {
  const activeTimer = request.snapshot.activeTimer;
  if (activeTimer === null) {
    return true;
  }
  const timerExercise = request.snapshot.workout.exercises.find(
    ({ id }) => id === activeTimer.exerciseId,
  );
  if (activeTimer.kind === 'series-rest') {
    return (
      timerExercise !== undefined &&
      'series' in timerExercise &&
      activeTimer.seriesNumber !== undefined &&
      timerExercise.series.some(
        ({ number }) => number === activeTimer.seriesNumber,
      ) &&
      activeTimer.durationSeconds === timerExercise.restSeconds
    );
  }
  if (activeTimer.kind === 'pause') {
    return (
      timerExercise?.type === 'pause' &&
      activeTimer.seriesNumber === undefined &&
      activeTimer.durationSeconds === timerExercise.restSeconds
    );
  }
  return (
    timerExercise?.type === 'duration' &&
    activeTimer.seriesNumber === undefined &&
    activeTimer.durationSeconds === timerExercise.durationMinutes * 60
  );
}

function validateTimerRelation(
  request: ParsedOfflineTrainingSnapshotRequest,
  context: z.RefinementCtx,
): void {
  const activeTimer = request.snapshot.activeTimer;
  if (activeTimer === null) {
    return;
  }
  const startsBeforeTraining =
    Date.parse(activeTimer.startedAt) < Date.parse(request.snapshot.startedAt);
  if (!hasCompatibleTimer(request) || startsBeforeTraining) {
    context.addIssue({ code: 'custom', path: ['snapshot', 'activeTimer'] });
  }
}

function validateTerminal(
  request: ParsedOfflineTrainingSnapshotRequest,
  context: z.RefinementCtx,
): void {
  if (request.snapshot.state === 'in-progress') return;
  const terminalAt =
    request.snapshot.state === 'completed'
      ? request.snapshot.completedAt
      : request.snapshot.cancelledAt;
  const terminalMs = Date.parse(terminalAt);
  const actionTimestamps = request.snapshot.workout.exercises.flatMap(
    (item) => [
      item.completedAt,
      ...('series' in item
        ? item.series.map((itemSeries) => itemSeries.completedAt)
        : []),
    ],
  );
  const happensBeforeAction = actionTimestamps.some(
    (value) => value !== null && Date.parse(value) > terminalMs,
  );
  if (
    terminalMs < Date.parse(request.snapshot.startedAt) ||
    happensBeforeAction
  ) {
    context.addIssue({ code: 'custom', path: ['snapshot', 'state'] });
  }
  if (request.snapshot.state === 'completed') {
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: request.snapshot.timezone,
      }).format(new Date(terminalMs));
    } catch {
      context.addIssue({ code: 'custom', path: ['snapshot', 'timezone'] });
    }
  }
}

export const offlineTrainingSnapshotRequestSchema =
  offlineTrainingSnapshotBaseSchema.superRefine((request, context) => {
    validatePlanRelations(request, context);
    validateExerciseRelations(request, context);
    validateTimerRelation(request, context);
    validateTerminal(request, context);
  }) satisfies z.ZodType<PutOfflineTrainingSnapshotV1Request>;
