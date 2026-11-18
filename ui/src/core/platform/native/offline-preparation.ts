import type {
  OfflineTrainingLeaseResponse,
  TrainingExercisePreview,
  TrainingOfflinePreparation,
  TrainingOverview,
  TrainingWorkoutPreview,
} from '@dall-fit/types';

import { getApiErrorCode } from '~/core/http/http-error';

import type {
  OfflineStoragePlugin,
  OfflineStoredAggregate,
} from './offline-storage-plugin';

export type OfflinePreparationStatus =
  | 'no-plan'
  | 'preparing-data'
  | 'data-ready-media-in-progress'
  | 'ready'
  | 'ready-media-incomplete'
  | 'expired'
  | 'takeover-required'
  | 'failed';

export interface OfflinePreparationSnapshot {
  error: boolean;
  status: OfflinePreparationStatus;
}

interface PreparedImageExercise extends Omit<
  Extract<TrainingExercisePreview, { type: 'image' }>,
  'image'
> {
  image: { fileId: string } | null;
}

type PreparedExercise =
  | Exclude<TrainingExercisePreview, { type: 'image' | 'duration' }>
  | PreparedImageExercise
  | (Omit<Extract<TrainingExercisePreview, { type: 'duration' }>, 'image'> & {
      image?: { fileId: string } | null;
    });

interface PreparedPlanPayload extends Readonly<Record<string, unknown>> {
  lease: OfflineTrainingLeaseResponse['data'] & {
    installationId: string;
    planId: string;
  };
  overview: TrainingOverview;
  plan: TrainingOfflinePreparation['plan'];
  previews: readonly TrainingWorkoutPreview[];
  workouts: readonly {
    exercises: readonly PreparedExercise[];
    workout: TrainingWorkoutPreview['workout'];
  }[];
}

interface MediaJob {
  fileId: string;
  url: string;
}

interface OfflinePreparationDependencies {
  getInstallationId: () => Promise<string>;
  getOverview: (catalogEntryId?: string) => Promise<TrainingOverview>;
  getPreview: (
    workoutId: string,
    catalogEntryId: string,
  ) => Promise<TrainingWorkoutPreview>;
  now?: () => number;
  plugin: OfflineStoragePlugin;
  registerLease: (
    installationId: string,
  ) => Promise<OfflineTrainingLeaseResponse['data']>;
  takeoverLease: (
    installationId: string,
  ) => Promise<OfflineTrainingLeaseResponse['data']>;
}

const payloadVersion = 2;
const maxConcurrency = 4;

export class OfflinePreparationCoordinator {
  private readonly dependencies: OfflinePreparationDependencies;
  private generation = 0;
  private inFlight: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot: OfflinePreparationSnapshot = {
    error: false,
    status: 'preparing-data',
  };

  constructor(dependencies: OfflinePreparationDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot = (): OfflinePreparationSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  enter(): Promise<void> {
    return this.prepare(false);
  }

  retry(): Promise<void> {
    return this.prepare(false);
  }

  async takeover(): Promise<void> {
    const state = await this.dependencies.plugin.getState();
    if (state.sessionAvailable || state.pendingSnapshotCount > 0) {
      this.publish('failed', true);
      return;
    }
    const installationId = await this.dependencies.getInstallationId();
    await this.dependencies.takeoverLease(installationId);
    await this.prepare(false);
  }

  async replaceActivePlan(): Promise<void> {
    try {
      this.generation += 1;
      this.inFlight = null;
      await this.prepare(false);
    } catch {
      this.publish('failed', true);
    }
  }

  private prepare(alreadyCleared: boolean): Promise<void> {
    if (this.inFlight !== null) return this.inFlight;
    const generation = this.generation;
    const operation = this.runPreparation(alreadyCleared, generation).finally(
      () => {
        if (this.inFlight === operation) this.inFlight = null;
      },
    );
    this.inFlight = operation;
    return operation;
  }

  private async runPreparation(
    _alreadyCleared: boolean,
    generation: number,
  ): Promise<void> {
    const current = (await this.dependencies.plugin.listPreparedPlans())
      .aggregates;
    const validPlans = current.filter((plan) => this.isValid(plan));
    let validStatus: 'ready' | 'ready-media-incomplete' | null = null;
    if (validPlans.length > 0) {
      const statuses = await Promise.all(
        validPlans.map((plan) => this.statusForStoredPlan(plan)),
      );
      validStatus = statuses.every((status) => status === 'ready')
        ? 'ready'
        : 'ready-media-incomplete';
    }
    if (validStatus !== null) this.publish(validStatus);
    else this.publish(current.length === 0 ? 'preparing-data' : 'expired');

    try {
      await this.refreshPreparedData(current, generation);
    } catch (error) {
      await this.handlePreparationFailure(error, generation, validStatus);
    }
  }

  private async handlePreparationFailure(
    error: unknown,
    generation: number,
    validStatus: 'ready' | 'ready-media-incomplete' | null,
  ): Promise<void> {
    if (generation !== this.generation) return;
    if (getApiErrorCode(error) === 'OFFLINE_LEASE_TAKEOVER_REQUIRED') {
      const state = await this.dependencies.plugin.getState();
      if (!state.sessionAvailable && state.pendingSnapshotCount === 0) {
        this.publish('takeover-required');
        return;
      }
    }
    if (validStatus !== null) {
      this.publish(validStatus, true);
      return;
    }
    const retained = (
      await this.dependencies.plugin.listPreparedPlans()
    ).aggregates.filter((plan) => this.isValid(plan));
    if (retained.length === 0) {
      this.publish('failed', true);
      return;
    }
    const statuses = await Promise.all(
      retained.map((plan) => this.statusForStoredPlan(plan)),
    );
    this.publish(
      statuses.every((status) => status === 'ready')
        ? 'ready'
        : 'ready-media-incomplete',
      true,
    );
  }

  private async refreshPreparedData(
    current: readonly OfflineStoredAggregate[],
    generation: number,
  ): Promise<void> {
    const overview = await this.dependencies.getOverview();
    const preparations = overview.offlinePreparations;
    if (preparations.length === 0) {
      await this.clearPreparedPlan();
      this.publish('no-plan');
      return;
    }
    const installationId = await this.dependencies.getInstallationId();
    const lease = await this.dependencies.registerLease(installationId);
    const activeIds = new Set(preparations.map((item) => item.plan.id));
    for (const stale of current.filter((item) => !activeIds.has(item.planId)))
      await this.clearPreparedPlan(stale);

    const results: boolean[] = [];
    for (const preparation of preparations) {
      const selectedOverview = await this.dependencies.getOverview(
        preparation.plan.catalogEntryId,
      );
      const previews = await mapWithConcurrency(
        preparation.workoutIds,
        maxConcurrency,
        (workoutId) =>
          this.dependencies.getPreview(
            workoutId,
            preparation.plan.catalogEntryId,
          ),
      );
      const previous = current.find(
        (item) => item.planId === preparation.plan.id,
      );
      const { media, payload } = this.buildPayload(
        selectedOverview,
        preparation.plan,
        previews,
        { ...lease, installationId, planId: preparation.plan.id },
      );
      this.assertGeneration(generation);
      const revision = Math.max(Date.now(), (previous?.revision ?? -1) + 1);
      await this.dependencies.plugin.putPreparedPlan({
        ...(previous === undefined
          ? {}
          : {
              expectedPlanId: previous.planId,
              expectedRevision: previous.revision,
            }),
        expiresAt: preparation.validity.expiresAt,
        payload,
        payloadVersion,
        planId: preparation.plan.id,
        revision,
        validatedAt: preparation.validity.validatedAt,
      });
      await this.removeStaleFiles(previous, media);
      if (media.length > 0) this.publish('data-ready-media-in-progress');
      results.push(
        ...(await mapWithConcurrency(media, maxConcurrency, (job) =>
          this.downloadIfNeeded(job, preparation.plan.id, revision, generation),
        )),
      );
    }
    this.assertGeneration(generation);
    this.publish(results.every(Boolean) ? 'ready' : 'ready-media-incomplete');
  }

  private buildPayload(
    overview: TrainingOverview,
    plan: TrainingOfflinePreparation['plan'],
    previews: readonly TrainingWorkoutPreview[],
    lease: OfflineTrainingLeaseResponse['data'] & {
      installationId: string;
      planId: string;
    },
  ): { media: MediaJob[]; payload: PreparedPlanPayload } {
    const media: MediaJob[] = [];
    const workouts = previews.map((preview) => ({
      exercises: preview.exercises.map((exercise): PreparedExercise => {
        if (exercise.type !== 'image' && exercise.type !== 'duration')
          return exercise;
        if (exercise.image == null) return { ...exercise, image: null };
        const fileId = `display-${plan.id}-${exercise.image.offlineMediaId}`;
        media.push({ fileId, url: exercise.image.displayUrl });
        return { ...exercise, image: { fileId } };
      }),
      workout: preview.workout,
    }));
    const safeOverview: TrainingOverview = {
      ...overview,
      workouts: overview.workouts.map((workout) => ({
        ...workout,
        media: workout.media?.type === 'image' ? null : workout.media,
      })),
    };
    const safePreviews = workouts.map((item) => ({
      exercises: item.exercises,
      plan,
      workout: item.workout,
    })) as unknown as readonly TrainingWorkoutPreview[];
    return {
      media,
      payload: {
        lease,
        overview: safeOverview,
        plan,
        previews: safePreviews,
        workouts,
      },
    };
  }

  private async downloadIfNeeded(
    job: MediaJob,
    planId: string,
    revision: number,
    generation: number,
  ): Promise<boolean> {
    try {
      this.assertGeneration(generation);
      const existing = (
        await this.dependencies.plugin.getFile({ fileId: job.fileId })
      ).file;
      if (existing?.status === 'ready') return true;
      if (existing?.status === 'temporary')
        await this.dependencies.plugin.removeFile({
          expectedRevision: existing.revision,
          fileId: job.fileId,
        });
      this.assertGeneration(generation);
      await this.dependencies.plugin.downloadFile({
        contentType: 'image/webp',
        expectedPlanRevision: revision,
        fileId: job.fileId,
        planId,
        revision,
        url: job.url,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async removeStaleFiles(
    previous: OfflineStoredAggregate | undefined,
    media: readonly MediaJob[],
  ): Promise<void> {
    if (previous === undefined) return;
    const state = await this.dependencies.plugin.getState();
    if (state.sessionAvailable || state.pendingSnapshotCount > 0) return;
    const retained = new Set(media.map((job) => job.fileId));
    for (const fileId of fileIdsFrom(previous.payload)) {
      if (retained.has(fileId)) continue;
      const file = (await this.dependencies.plugin.getFile({ fileId })).file;
      if (file !== undefined)
        await this.dependencies.plugin.removeFile({
          expectedRevision: file.revision,
          fileId,
        });
    }
  }

  private async statusForStoredPlan(
    aggregate: OfflineStoredAggregate,
  ): Promise<'ready' | 'ready-media-incomplete'> {
    const fileIds = fileIdsFrom(aggregate.payload);
    const files = await Promise.all(
      fileIds.map(
        async (fileId) =>
          (await this.dependencies.plugin.getFile({ fileId })).file,
      ),
    );
    return files.every((file) => file?.status === 'ready')
      ? 'ready'
      : 'ready-media-incomplete';
  }

  private async clearPreparedPlan(
    selected?: OfflineStoredAggregate,
  ): Promise<void> {
    if (selected === undefined) {
      const plans = (await this.dependencies.plugin.listPreparedPlans())
        .aggregates;
      for (const plan of plans) await this.clearPreparedPlan(plan);
      return;
    }
    const current = selected;
    const state = await this.dependencies.plugin.getState();
    if (!state.sessionAvailable && state.pendingSnapshotCount === 0) {
      for (const fileId of fileIdsFrom(current.payload)) {
        const file = (await this.dependencies.plugin.getFile({ fileId })).file;
        if (file !== undefined)
          await this.dependencies.plugin.removeFile({
            expectedRevision: file.revision,
            fileId,
          });
      }
    }
    await this.dependencies.plugin.removePreparedPlan({
      expectedRevision: current.revision,
      planId: current.planId,
    });
  }

  private isValid(aggregate: OfflineStoredAggregate | undefined): boolean {
    if (
      aggregate?.payloadVersion !== payloadVersion ||
      aggregate.expiresAt === undefined
    )
      return false;
    const now = this.dependencies.now?.() ?? Date.now();
    return Date.parse(aggregate.expiresAt) > now;
  }

  private publish(status: OfflinePreparationStatus, error = false): void {
    this.snapshot = { error, status };
    for (const listener of this.listeners) listener();
  }

  private assertGeneration(generation: number): void {
    if (generation !== this.generation)
      throw new DOMException('Preparation replaced.', 'AbortError');
  }
}

function fileIdsFrom(payload: Readonly<Record<string, unknown>>): string[] {
  const serialized = JSON.stringify(payload);
  const matches = serialized.matchAll(/"fileId":"([a-zA-Z0-9_-]+)"/g);
  return [...matches].map((match) => match[1] ?? '').filter(Boolean);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  work: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (index < values.length) {
        const current = index++;
        const value = values[current];
        if (value !== undefined) results[current] = await work(value);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
