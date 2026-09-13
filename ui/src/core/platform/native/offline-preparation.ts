import type {
  TrainingExercisePreview,
  TrainingOverview,
  TrainingWorkoutPreview,
} from '@dall-fit/types';

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
  Exclude<TrainingExercisePreview, { type: 'image' }> | PreparedImageExercise;

interface PreparedPlanPayload extends Readonly<Record<string, unknown>> {
  plan: NonNullable<TrainingOverview['offlinePreparation']>['plan'];
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
  getOverview: () => Promise<TrainingOverview>;
  getPreview: (workoutId: string) => Promise<TrainingWorkoutPreview>;
  now?: () => number;
  plugin: OfflineStoragePlugin;
}

const payloadVersion = 1;
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

  async replaceActivePlan(): Promise<void> {
    try {
      this.generation += 1;
      this.inFlight = null;
      await this.clearPreparedPlan();
      await this.prepare(true);
    } catch {
      this.publish('failed', true);
    }
  }

  async clearActivePlan(): Promise<void> {
    try {
      this.generation += 1;
      this.inFlight = null;
      await this.clearPreparedPlan();
      this.publish('no-plan');
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
    alreadyCleared: boolean,
    generation: number,
  ): Promise<void> {
    const current = alreadyCleared
      ? undefined
      : (await this.dependencies.plugin.getPreparedPlan()).aggregate;
    const validCurrent = this.isValid(current);
    const validStatus =
      validCurrent && current !== undefined
        ? await this.statusForStoredPlan(current)
        : null;
    if (validStatus !== null) this.publish(validStatus);
    else this.publish(current === undefined ? 'preparing-data' : 'expired');

    try {
      const overview = await this.dependencies.getOverview();
      if (
        overview.offlinePreparation === null ||
        overview.offlineValidity === null
      ) {
        await this.clearPreparedPlan();
        this.publish('no-plan');
        return;
      }
      const previews = await mapWithConcurrency(
        overview.offlinePreparation.workoutIds,
        maxConcurrency,
        (workoutId) => this.dependencies.getPreview(workoutId),
      );
      const { media, payload } = this.buildPayload(
        overview.offlinePreparation.plan,
        previews,
      );
      this.assertGeneration(generation);
      const revision = Math.max(Date.now(), (current?.revision ?? -1) + 1);
      await this.dependencies.plugin.putPreparedPlan({
        ...(current === undefined
          ? {}
          : {
              expectedPlanId: current.planId,
              expectedRevision: current.revision,
            }),
        expiresAt: overview.offlineValidity.expiresAt,
        payload,
        payloadVersion,
        planId: overview.offlinePreparation.plan.id,
        revision,
        validatedAt: overview.offlineValidity.validatedAt,
      });
      this.assertGeneration(generation);
      await this.removeStaleFiles(current, media);
      this.publish(
        media.length === 0 ? 'ready' : 'data-ready-media-in-progress',
      );
      const results = await mapWithConcurrency(media, maxConcurrency, (job) =>
        this.downloadIfNeeded(
          job,
          overview.offlinePreparation!.plan.id,
          revision,
          generation,
        ),
      );
      this.assertGeneration(generation);
      this.publish(results.every(Boolean) ? 'ready' : 'ready-media-incomplete');
    } catch {
      if (generation === this.generation)
        this.publish(validStatus ?? 'failed', true);
    }
  }

  private buildPayload(
    plan: NonNullable<TrainingOverview['offlinePreparation']>['plan'],
    previews: readonly TrainingWorkoutPreview[],
  ): { media: MediaJob[]; payload: PreparedPlanPayload } {
    const media: MediaJob[] = [];
    const workouts = previews.map((preview) => ({
      exercises: preview.exercises.map((exercise): PreparedExercise => {
        if (exercise.type !== 'image') return exercise;
        if (exercise.image === null) return { ...exercise, image: null };
        const fileId = `display-${exercise.image.offlineMediaId}`;
        media.push({ fileId, url: exercise.image.displayUrl });
        return { ...exercise, image: { fileId } };
      }),
      workout: preview.workout,
    }));
    return { media, payload: { plan, workouts } };
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

  private async clearPreparedPlan(): Promise<void> {
    const current = (await this.dependencies.plugin.getPreparedPlan())
      .aggregate;
    if (current === undefined) return;
    for (const fileId of fileIdsFrom(current.payload)) {
      const file = (await this.dependencies.plugin.getFile({ fileId })).file;
      if (file !== undefined)
        await this.dependencies.plugin.removeFile({
          expectedRevision: file.revision,
          fileId,
        });
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
