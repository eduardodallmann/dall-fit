import type {
  OfflineTrainingSnapshotPlanV1,
  OfflineTrainingSnapshotV1,
  PutOfflineTrainingSnapshotV1Request,
  TrainingExerciseExecution,
  TrainingExercisePreview,
  TrainingOverview,
  TrainingSession,
  TrainingTimer,
  TrainingWorkoutPreview,
  WorkoutExecutionSummary,
} from '@dall-fit/types';

import type { TrainingRepository } from '~/routes/training/training-repository';

import type { OfflineStoragePlugin } from './offline-storage-plugin';

interface LeasePayload {
  expiresAt: string;
  installationId: string;
  leaseId: string;
  planId: string;
}

interface PreparedPlanPayload extends Readonly<Record<string, unknown>> {
  lease: LeasePayload;
  overview: TrainingOverview;
  plan: NonNullable<TrainingOverview['plan']>;
  previews: readonly TrainingWorkoutPreview[];
}

interface NativeSessionPayload extends Readonly<Record<string, unknown>> {
  executionId: string;
  lease: LeasePayload;
  mediaFiles: Readonly<Record<string, string>>;
  session: TrainingSession;
  snapshotPlan: OfflineTrainingSnapshotPlanV1;
  timerClock?: {
    durationSeconds: number;
    elapsedRealtime: number;
    startedAt: string;
  };
}

export class NativeTrainingRepositoryError extends Error {
  readonly code:
    | 'CONNECTION_REQUIRED'
    | 'WORKOUT_SESSION_NOT_FOUND'
    | 'WORKOUT_SESSION_VERSION_CONFLICT';

  constructor(code: NativeTrainingRepositoryError['code']) {
    super(code);
    this.name = 'NativeTrainingRepositoryError';
    this.code = code;
  }
}

export class NativeTrainingRepository implements TrainingRepository {
  readonly source = 'native' as const;
  private readonly createUuid: () => string;
  private readonly now: () => number;
  private readonly plugin: OfflineStoragePlugin;

  constructor(
    plugin: OfflineStoragePlugin,
    now: () => number = Date.now,
    createUuid: () => string = () => crypto.randomUUID(),
  ) {
    this.plugin = plugin;
    this.now = now;
    this.createUuid = createUuid;
  }

  async getOverview(catalogEntryId?: string): Promise<TrainingOverview> {
    const active = await this.readActive();
    if (active !== undefined) {
      const prepared = (await this.plugin.listPreparedPlans()).aggregates
        .filter(
          (item) =>
            item.payloadVersion === 2 &&
            isPreparedPlanPayload(item.payload) &&
            preparedAggregateExpiresAt(item) > this.now(),
        )
        .map((item) => item.payload as PreparedPlanPayload);
      return {
        availablePlans: prepared.map((item) => item.plan),
        offlinePreparations: prepared.flatMap(
          (item) => item.overview.offlinePreparations,
        ),
        plan: active.session.plan,
        workouts: active.snapshotPlan.workouts.map((workout) => ({
          ...workout,
          indicator:
            workout.id === active.session.workout.id ? 'in-progress' : null,
          media: null,
        })),
      };
    }
    if (catalogEntryId === undefined) {
      const stored = (await this.plugin.listPreparedPlans()).aggregates
        .filter(
          (item) =>
            item.payloadVersion === 2 &&
            isPreparedPlanPayload(item.payload) &&
            preparedAggregateExpiresAt(item) > this.now(),
        )
        .map((item) => item.payload as PreparedPlanPayload);
      if (stored.length > 1)
        return {
          availablePlans: stored.map((item) => item.plan),
          offlinePreparations: stored.flatMap(
            (item) => item.overview.offlinePreparations,
          ),
          plan: null,
          workouts: [],
        };
    }
    const prepared = await this.readPrepared(catalogEntryId);
    return prepared.overview;
  }

  async getPreview(
    workoutId: string,
    catalogEntryId?: string,
  ): Promise<TrainingWorkoutPreview> {
    const prepared = await this.readPrepared(catalogEntryId);
    const preview = prepared.previews.find(
      (item) => item.workout.id === workoutId,
    );
    if (preview === undefined)
      throw new NativeTrainingRepositoryError('CONNECTION_REQUIRED');
    return this.projectPreview(preview, prepared.lease.expiresAt);
  }

  async getSession(): Promise<TrainingSession> {
    const active = await this.readActive();
    if (active === undefined)
      throw new NativeTrainingRepositoryError('WORKOUT_SESSION_NOT_FOUND');
    return this.projectSession(active);
  }

  async startSession(
    workoutId: string,
    catalogEntryId?: string,
  ): Promise<TrainingSession> {
    if ((await this.readActive()) !== undefined)
      throw new NativeTrainingRepositoryError(
        'WORKOUT_SESSION_VERSION_CONFLICT',
      );
    const prepared = await this.readPrepared(catalogEntryId, true);
    const preview = prepared.previews.find(
      (item) => item.workout.id === workoutId,
    );
    if (preview === undefined)
      throw new NativeTrainingRepositoryError('CONNECTION_REQUIRED');
    const now = new Date(this.now()).toISOString();
    const session: TrainingSession = {
      activeTimer: null,
      exercises: preview.exercises.map(materializeExercise),
      expiresAt: prepared.lease.expiresAt,
      id: this.createUuid(),
      plan: preview.plan,
      serverNow: now,
      startedAt: now,
      version: 0,
      workout: preview.workout,
    };
    const payload: NativeSessionPayload = {
      executionId: this.createUuid(),
      lease: prepared.lease,
      mediaFiles: mediaFilesFrom(preview),
      session,
      snapshotPlan: snapshotPlan(prepared.overview),
    };
    await this.commit(payload, session, 0);
    return this.projectSession(payload);
  }

  saveLoad(
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
    version: number,
  ) {
    return this.update(version, (session) =>
      replaceSetExercise(session, exerciseId, (exercise) => ({
        ...exercise,
        series: exercise.series.map((series) =>
          series.number === seriesNumber ? { ...series, loadKg } : series,
        ),
      })),
    );
  }

  completeSeries(
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
    version: number,
  ) {
    return this.update(version, (session, now) =>
      replaceSetExercise(session, exerciseId, (exercise) => {
        const series = exercise.series.map((item) =>
          item.number === seriesNumber
            ? { ...item, completedAt: now, loadKg }
            : item,
        );
        const completed = series.every((item) => item.completedAt !== null);
        const timer =
          completed || exercise.restSeconds <= 0
            ? null
            : createTimer(
                exerciseId,
                'series-rest',
                exercise.restSeconds,
                now,
                seriesNumber,
              );
        return {
          exercise: {
            ...exercise,
            completedAt: completed ? now : null,
            series,
          },
          timer,
        };
      }),
    );
  }

  completeRemainingSeries(
    exerciseId: string,
    loadsKg: readonly (number | null)[],
    version: number,
  ) {
    return this.update(version, (session, now) =>
      replaceSetExercise(session, exerciseId, (exercise) => ({
        ...exercise,
        completedAt: now,
        series: exercise.series.map((series, index) => ({
          ...series,
          completedAt: now,
          loadKg: loadsKg[index] ?? null,
        })),
      })),
    );
  }

  completeExercise(exerciseId: string, version: number) {
    return this.update(version, (session, now) =>
      replaceExercise(session, exerciseId, (exercise) => ({
        ...exercise,
        completedAt: now,
      })),
    );
  }

  restartExercise(exerciseId: string, version: number) {
    return this.update(version, (session) =>
      replaceExercise(session, exerciseId, (exercise) => ({
        ...exercise,
        completedAt: null,
        ...('series' in exercise
          ? {
              series: exercise.series.map((series) => ({
                ...series,
                completedAt: null,
              })),
            }
          : {}),
      })),
    );
  }

  startTimer(exerciseId: string, kind: 'duration' | 'pause', version: number) {
    return this.update(version, (session, now) => {
      const exercise = session.exercises.find((item) => item.id === exerciseId);
      if (exercise === undefined || exercise.type !== kind) return session;
      const duration =
        exercise.type === 'duration'
          ? exercise.durationMinutes * 60
          : exercise.restSeconds;
      return {
        ...session,
        activeTimer: createTimer(exerciseId, kind, duration, now),
      };
    });
  }

  resolveTimer(outcome: 'cancel' | 'finish' | 'skip', version: number) {
    return this.update(version, (session, now) => {
      const timer = session.activeTimer;
      if (timer === null) return session;
      let next: TrainingSession = { ...session, activeTimer: null };
      if (timer.kind === 'duration' && outcome === 'finish')
        next = replaceExercise(next, timer.exerciseId, (exercise) => ({
          ...exercise,
          completedAt: now,
        }));
      if (timer.kind === 'pause' && outcome !== 'cancel')
        next = replaceExercise(next, timer.exerciseId, (exercise) => ({
          ...exercise,
          completedAt: now,
        }));
      return next;
    });
  }

  async abandonSession(): Promise<void> {
    await this.terminal('cancelled', 'UTC');
  }

  async completeSession(
    confirmIncomplete: boolean,
    timezone: string,
    version: number,
  ): Promise<WorkoutExecutionSummary | null> {
    const active = await this.requireActive(version);
    if (active.session.activeTimer !== null)
      throw new Error(
        'Resolve the active timer before completing the workout.',
      );
    const incomplete = active.session.exercises.some(
      (exercise) => exercise.completedAt === null,
    );
    if (incomplete && !confirmIncomplete)
      throw new Error('Incomplete workout requires confirmation.');
    await this.terminal('completed', timezone, active);
    return null;
  }

  getCompletion(): Promise<WorkoutExecutionSummary> {
    return Promise.reject(
      new NativeTrainingRepositoryError('CONNECTION_REQUIRED'),
    );
  }

  private async update(
    version: number,
    mutate: (session: TrainingSession, now: string) => TrainingSession,
  ): Promise<TrainingSession> {
    const active = await this.requireActive(version);
    const now = new Date(this.now()).toISOString();
    const session = {
      ...mutate(active.session, now),
      serverNow: now,
      version: version + 1,
    };
    await this.commit(active, session, version + 1);
    return this.projectSession({ ...active, session });
  }

  private async commit(
    active: NativeSessionPayload,
    session: TrainingSession,
    revision: number,
  ): Promise<void> {
    let timerClock = active.timerClock;
    if (session.activeTimer === null) timerClock = undefined;
    else if (timerClock?.startedAt !== session.activeTimer.startedAt) {
      const monotonic = await this.plugin.getMonotonicTime();
      timerClock = {
        durationSeconds: Math.max(
          0,
          Math.round(
            (Date.parse(session.activeTimer.endsAt) -
              Date.parse(session.activeTimer.startedAt)) /
              1000,
          ),
        ),
        elapsedRealtime: monotonic.elapsedRealtime,
        startedAt: session.activeTimer.startedAt,
      };
    }
    const updated: NativeSessionPayload = {
      executionId: active.executionId,
      lease: active.lease,
      mediaFiles: active.mediaFiles,
      session,
      snapshotPlan: active.snapshotPlan,
      ...(timerClock === undefined ? {} : { timerClock }),
    };
    const updatedAt = new Date(this.now()).toISOString();
    const snapshot = snapshotFrom(updated, 'in-progress', updatedAt);
    const request = requestFrom(updated, snapshot, revision, updatedAt);
    await this.plugin.commitTrainingSession({
      executionId: active.executionId,
      planId: active.lease.planId,
      revision,
      sessionId: session.id,
      sessionPayload: updated,
      snapshotPayload: request as unknown as Readonly<Record<string, unknown>>,
      updatedAt: request.clientUpdatedAt,
    });
  }

  private async terminal(
    state: 'cancelled' | 'completed',
    timezone: string,
    current?: NativeSessionPayload,
  ): Promise<void> {
    const active = current ?? (await this.requireActive());
    const revision = active.session.version + 1;
    const updatedAt = new Date(this.now()).toISOString();
    const snapshot = snapshotFrom(active, state, updatedAt, timezone);
    const request = requestFrom(active, snapshot, revision, updatedAt);
    const exercises = active.session.exercises;
    const completionPresentation =
      state === 'completed'
        ? {
            completedAt: updatedAt,
            completedExerciseCount: exercises.filter(
              (exercise) => exercise.completedAt !== null,
            ).length,
            fullCompletion: exercises.every(
              (exercise) => exercise.completedAt !== null,
            ),
            totalExerciseCount: exercises.length,
            workoutName: active.session.workout.name,
          }
        : undefined;
    await this.plugin.commitTrainingTerminal({
      executionId: active.executionId,
      expectedSessionRevision: active.session.version,
      planId: active.lease.planId,
      revision,
      sessionId: active.session.id,
      snapshotPayload: request as unknown as Readonly<Record<string, unknown>>,
      ...(completionPresentation === undefined
        ? {}
        : { completionPresentation }),
      updatedAt,
    });
  }

  private async requireActive(version?: number): Promise<NativeSessionPayload> {
    const active = await this.readActive();
    if (active === undefined)
      throw new NativeTrainingRepositoryError('WORKOUT_SESSION_NOT_FOUND');
    if (version !== undefined && active.session.version !== version)
      throw new NativeTrainingRepositoryError(
        'WORKOUT_SESSION_VERSION_CONFLICT',
      );
    return active;
  }

  private async readActive(): Promise<NativeSessionPayload | undefined> {
    const aggregate = (await this.plugin.getActiveSession()).aggregate;
    if (aggregate === undefined) return undefined;
    const payload = aggregate.payload as NativeSessionPayload;
    if (
      !isNativeSessionPayload(payload) ||
      payload.session.id !== aggregate.id ||
      payload.session.version !== aggregate.revision
    )
      return undefined;
    const timer = payload.session.activeTimer;
    if (timer === null) return payload;
    const currentElapsed = (await this.plugin.getMonotonicTime())
      .elapsedRealtime;
    const monotonicDelta =
      currentElapsed -
      (payload.timerClock?.elapsedRealtime ?? Number.POSITIVE_INFINITY);
    const maxDelta =
      (payload.timerClock?.durationSeconds ?? 0) * 1000 + 86_400_000;
    const civilNow = this.now();
    const serverNow =
      monotonicDelta >= 0 && monotonicDelta <= maxDelta
        ? Date.parse(timer.startedAt) + monotonicDelta
        : Math.min(
            Math.max(civilNow, Date.parse(timer.startedAt)),
            Date.parse(timer.endsAt),
          );
    return {
      ...payload,
      session: {
        ...payload.session,
        serverNow: new Date(serverNow).toISOString(),
      },
    };
  }

  private async readPrepared(
    catalogEntryId?: string,
    requireValid = false,
  ): Promise<PreparedPlanPayload> {
    const aggregates = (await this.plugin.listPreparedPlans()).aggregates;
    const candidates = aggregates.filter(
      (item) =>
        item.payloadVersion === 2 && isPreparedPlanPayload(item.payload),
    );
    const aggregate =
      candidates.find((item) => {
        const payload = item.payload as PreparedPlanPayload;
        return payload.plan.catalogEntryId === catalogEntryId;
      }) ??
      (catalogEntryId === undefined && candidates.length === 1
        ? candidates[0]
        : undefined);
    if (aggregate === undefined || aggregate.payloadVersion !== 2)
      throw new NativeTrainingRepositoryError('CONNECTION_REQUIRED');
    const payload = aggregate.payload;
    if (!isPreparedPlanPayload(payload))
      throw new NativeTrainingRepositoryError('CONNECTION_REQUIRED');
    const expiresAt = Math.min(
      Date.parse(aggregate.expiresAt ?? ''),
      Date.parse(payload.lease?.expiresAt ?? ''),
    );
    if (
      !Number.isFinite(expiresAt) ||
      (requireValid && expiresAt <= this.now())
    )
      throw new NativeTrainingRepositoryError('CONNECTION_REQUIRED');
    if (
      payload.lease.planId !== aggregate.planId ||
      payload.overview.plan?.id !== aggregate.planId
    )
      throw new NativeTrainingRepositoryError('CONNECTION_REQUIRED');
    return payload;
  }

  private async projectPreview(
    preview: TrainingWorkoutPreview,
    expiresAt: string,
  ): Promise<TrainingWorkoutPreview> {
    return {
      ...preview,
      exercises: await Promise.all(
        preview.exercises.map(async (exercise) => {
          if (!('image' in exercise) || exercise.image == null) return exercise;
          const fileId = preparedFileId(exercise.image);
          if (fileId === undefined) return { ...exercise, image: null };
          const { url } = await this.plugin.getReadyFileUrl({ fileId });
          return {
            ...exercise,
            image:
              url === undefined
                ? null
                : {
                    displayUrl: url,
                    offlineMediaId: fileId,
                    signedUrlExpiresAt: expiresAt,
                    thumbnailUrl: url,
                  },
          };
        }),
      ),
    };
  }

  private async projectSession(
    active: NativeSessionPayload,
  ): Promise<TrainingSession> {
    return {
      ...active.session,
      exercises: await Promise.all(
        active.session.exercises.map(async (exercise) => {
          if (exercise.type !== 'image' && exercise.type !== 'duration')
            return exercise;
          const fileId = active.mediaFiles[exercise.id];
          if (fileId === undefined) return exercise;
          const { url } = await this.plugin.getReadyFileUrl({ fileId });
          return {
            ...exercise,
            image:
              url === undefined
                ? null
                : {
                    displayUrl: url,
                    signedUrlExpiresAt: active.lease.expiresAt,
                    thumbnailUrl: url,
                  },
          };
        }),
      ),
    };
  }
}

function isPreparedPlanPayload(
  value: Readonly<Record<string, unknown>>,
): value is PreparedPlanPayload {
  if (!('lease' in value) || !('overview' in value) || !('previews' in value))
    return false;
  const lease = value.lease;
  const overviewValue = value.overview;
  return (
    typeof lease === 'object' &&
    lease !== null &&
    'expiresAt' in lease &&
    typeof lease.expiresAt === 'string' &&
    'installationId' in lease &&
    typeof lease.installationId === 'string' &&
    'leaseId' in lease &&
    typeof lease.leaseId === 'string' &&
    'planId' in lease &&
    typeof lease.planId === 'string' &&
    'plan' in value &&
    typeof value.plan === 'object' &&
    value.plan !== null &&
    typeof overviewValue === 'object' &&
    overviewValue !== null &&
    'plan' in overviewValue &&
    'workouts' in overviewValue &&
    Array.isArray(overviewValue.workouts) &&
    Array.isArray(value.previews)
  );
}

function preparedAggregateExpiresAt(aggregate: {
  expiresAt?: string;
  payload: Readonly<Record<string, unknown>>;
}): number {
  const payload = aggregate.payload as Partial<PreparedPlanPayload>;
  return Math.min(
    Date.parse(aggregate.expiresAt ?? ''),
    Date.parse(payload.lease?.expiresAt ?? ''),
  );
}

function isNativeSessionPayload(value: NativeSessionPayload): boolean {
  return (
    typeof value.executionId === 'string' &&
    typeof value.lease === 'object' &&
    value.lease !== null &&
    typeof value.mediaFiles === 'object' &&
    value.mediaFiles !== null &&
    typeof value.snapshotPlan === 'object' &&
    value.snapshotPlan !== null &&
    typeof value.session === 'object' &&
    value.session !== null &&
    typeof value.session.id === 'string' &&
    Number.isInteger(value.session.version)
  );
}

function mediaFilesFrom(
  preview: TrainingWorkoutPreview,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    preview.exercises.flatMap((exercise) => {
      if (!('image' in exercise) || exercise.image == null) return [];
      const fileId = preparedFileId(exercise.image);
      return fileId === undefined ? [] : [[exercise.id, fileId]];
    }),
  );
}

function preparedFileId(image: object): string | undefined {
  if (
    'fileId' in image &&
    typeof image.fileId === 'string' &&
    image.fileId.length > 0
  )
    return image.fileId;
  if (
    'offlineMediaId' in image &&
    typeof image.offlineMediaId === 'string' &&
    image.offlineMediaId.length > 0
  )
    return image.offlineMediaId;
  return undefined;
}

type SetExercise = Extract<
  TrainingExerciseExecution,
  { type: 'image' | 'youtube-short' }
>;

function materializeExercise(
  exercise: TrainingExercisePreview,
): TrainingExerciseExecution {
  if (exercise.type === 'image' || exercise.type === 'youtube-short') {
    const { lastLoadsKg, ...base } = exercise;
    const safeBase =
      exercise.type === 'image' ? { ...base, image: null } : base;
    return {
      ...safeBase,
      completedAt: null,
      series: Array.from({ length: exercise.sets }, (_, index) => ({
        completedAt: null,
        loadKg: lastLoadsKg[index] ?? null,
        number: index + 1,
        repetitions: exercise.repetitions,
      })),
    };
  }
  return {
    ...exercise,
    ...(exercise.type === 'duration' ? { image: null } : {}),
    completedAt: null,
  };
}

function replaceExercise(
  session: TrainingSession,
  exerciseId: string,
  mutate: (exercise: TrainingExerciseExecution) => TrainingExerciseExecution,
): TrainingSession {
  return {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.id === exerciseId ? mutate(exercise) : exercise,
    ),
  };
}

function replaceSetExercise(
  session: TrainingSession,
  exerciseId: string,
  mutate: (
    exercise: SetExercise,
  ) => SetExercise | { exercise: SetExercise; timer: TrainingTimer | null },
): TrainingSession {
  let timer: TrainingTimer | null | undefined;
  const next = replaceExercise(session, exerciseId, (exercise) => {
    if (exercise.type !== 'image' && exercise.type !== 'youtube-short')
      return exercise;
    const result = mutate(exercise);
    if ('exercise' in result) {
      timer = result.timer;
      return result.exercise;
    }
    return result;
  });
  return timer === undefined ? next : { ...next, activeTimer: timer };
}

function createTimer(
  exerciseId: string,
  kind: TrainingTimer['kind'],
  durationSeconds: number,
  startedAt: string,
  seriesNumber?: number,
): TrainingTimer {
  return {
    endsAt: new Date(
      Date.parse(startedAt) + Math.max(0, durationSeconds) * 1000,
    ).toISOString(),
    exerciseId,
    kind,
    ...(seriesNumber === undefined ? {} : { seriesNumber }),
    startedAt,
  };
}

function snapshotPlan(
  overview: TrainingOverview,
): OfflineTrainingSnapshotPlanV1 {
  if (overview.plan === null)
    throw new NativeTrainingRepositoryError('CONNECTION_REQUIRED');
  return {
    catalogEntryId: overview.plan.catalogEntryId,
    name: overview.plan.name,
    planId: overview.plan.id,
    source: overview.plan.source,
    workouts: overview.workouts.map(({ bodyAreas, id, name }) => ({
      bodyAreas,
      id,
      name,
    })),
  };
}

function snapshotFrom(
  active: NativeSessionPayload,
  state: 'cancelled' | 'completed' | 'in-progress',
  updatedAt: string,
  timezone = 'UTC',
): OfflineTrainingSnapshotV1 {
  const base = {
    plan: active.snapshotPlan,
    startedAt: active.session.startedAt,
    workout: {
      exercises: active.session.exercises.map((exercise) => {
        if ('image' in exercise) {
          const { image: _image, ...withoutImage } = exercise;
          return withoutImage;
        }
        return exercise;
      }),
      ...active.session.workout,
    },
  };
  if (state === 'completed')
    return {
      ...base,
      activeTimer: null,
      completedAt: updatedAt,
      state,
      timezone,
    };
  if (state === 'cancelled')
    return { ...base, activeTimer: null, cancelledAt: updatedAt, state };
  return {
    ...base,
    activeTimer:
      active.session.activeTimer === null
        ? null
        : {
            durationSeconds: Math.max(
              0,
              Math.round(
                (Date.parse(active.session.activeTimer.endsAt) -
                  Date.parse(active.session.activeTimer.startedAt)) /
                  1000,
              ),
            ),
            exerciseId: active.session.activeTimer.exerciseId,
            kind: active.session.activeTimer.kind,
            ...(active.session.activeTimer.seriesNumber === undefined
              ? {}
              : { seriesNumber: active.session.activeTimer.seriesNumber }),
            startedAt: active.session.activeTimer.startedAt,
          },
    state,
  };
}

function requestFrom(
  active: NativeSessionPayload,
  snapshot: OfflineTrainingSnapshotV1,
  revision: number,
  clientUpdatedAt: string,
): PutOfflineTrainingSnapshotV1Request {
  return {
    clientUpdatedAt,
    executionId: active.executionId,
    installationId: active.lease.installationId,
    leaseId: active.lease.leaseId,
    payloadVersion: 1,
    revision,
    snapshot,
  };
}
