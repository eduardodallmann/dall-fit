import { createHash } from 'node:crypto';

import {
  MongoClient,
  ObjectId,
  type Collection,
  type Db,
  type Document,
} from 'mongodb';

import { WorkflowLogger } from '../../core/logger';
import type {
  CloneWorkDecision,
  CopiedCloneImage,
  SnapshotExercise,
  StartReservation,
  TrainingPlanCloneJob,
  TrainingPlanCloneSnapshot,
} from '../domain';
import { TrainingPlanCloneRepository } from './training-plan-clone.repository';

interface CloneJobDocument extends Document {
  _id: ObjectId;
  cancelRequestedAt: Date | null;
  completedImages: number;
  copiedImages?: CopiedCloneImage[];
  generation: number;
  personId: ObjectId;
  snapshot: TrainingPlanCloneSnapshot;
  state: TrainingPlanCloneJob['state'];
  startLeaseExpiresAt: Date | null;
  workflowRunId: string | null;
}

let clientPromise: Promise<MongoClient> | undefined;

async function database(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (uri === undefined || uri.length === 0)
    throw new Error('MONGODB_URI is required.');
  clientPromise ??= new MongoClient(uri).connect();
  const client = await clientPromise;
  const result = client.db();
  return result;
}

export class MongoTrainingPlanCloneRepository extends TrainingPlanCloneRepository {
  private readonly logger = new WorkflowLogger(
    MongoTrainingPlanCloneRepository.name,
  );

  async findJob(
    cloneJobId: string,
    generation: number,
  ): Promise<TrainingPlanCloneJob | null> {
    this.logger.info('findJob', 'params', { cloneJobId, generation });
    const document = await (
      await this.jobs()
    ).findOne({
      _id: new ObjectId(cloneJobId),
      generation,
    });
    const result = document === null ? null : this.mapJob(document);
    this.logger.info('findJob', 'return', {
      cloneJobId,
      found: result !== null,
      generation,
    });
    return result;
  }

  async reserveStart(
    cloneJobId: string,
    generation: number,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<StartReservation> {
    this.logger.info('reserveStart', 'params', { cloneJobId, generation });
    const jobs = await this.jobs();
    const reserved = await jobs.findOneAndUpdate(
      {
        _id: new ObjectId(cloneJobId),
        generation,
        state: { $in: ['queued', 'cancelling'] },
        workflowRunId: null,
        $or: [
          { startLeaseExpiresAt: null },
          { startLeaseExpiresAt: { $lte: now } },
        ],
      },
      { $set: { startLeaseExpiresAt: leaseExpiresAt } },
      { returnDocument: 'after' },
    );
    const result: StartReservation = reserved === null ? 'accepted' : 'start';
    this.logger.info('reserveStart', 'return', {
      cloneJobId,
      generation,
      result,
    });
    return result;
  }

  async claimRun(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<boolean> {
    this.logger.info('claimRun', 'params', {
      cloneJobId,
      generation,
      workflowRunId,
    });
    const jobs = await this.jobs();
    const claimed = await jobs.findOneAndUpdate(
      {
        _id: new ObjectId(cloneJobId),
        generation,
        state: { $in: ['queued', 'cancelling'] },
        $or: [{ workflowRunId: null }, { workflowRunId }],
      },
      [
        {
          $set: {
            startLeaseExpiresAt: null,
            workflowRunId,
            state: {
              $cond: [
                { $eq: ['$state', 'cancelling'] },
                'cancelling',
                'running',
              ],
            },
          },
        },
      ],
      { returnDocument: 'after' },
    );
    const result = claimed?.workflowRunId === workflowRunId;
    this.logger.info('claimRun', 'return', {
      claimed: result,
      cloneJobId,
      generation,
    });
    return result;
  }

  async nextDecision(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
    batchSize: number,
  ): Promise<CloneWorkDecision> {
    this.logger.info('nextDecision', 'params', {
      batchSize,
      cloneJobId,
      generation,
      workflowRunId,
    });
    const document = await (
      await this.jobs()
    ).findOne({
      _id: new ObjectId(cloneJobId),
      generation,
      workflowRunId,
    });
    let result: CloneWorkDecision;
    if (
      document === null ||
      document.state === 'completed' ||
      document.state === 'cancelled'
    ) {
      result = { kind: 'obsolete' };
    } else if (
      document.state === 'cancelling' ||
      document.cancelRequestedAt !== null
    ) {
      result = { kind: 'cleanup' };
    } else {
      const copied = new Set(
        (document.copiedImages ?? []).map((image) => image.exerciseId),
      );
      const pending = document.snapshot.workouts.flatMap((workout) =>
        workout.exercises.flatMap((exercise) =>
          (exercise.type === 'image' || exercise.type === 'duration') &&
          exercise.image !== null &&
          exercise.image !== undefined &&
          !copied.has(exercise.id)
            ? [exercise.id]
            : [],
        ),
      );
      result =
        pending.length === 0
          ? { kind: 'finalize' }
          : { exerciseIds: pending.slice(0, batchSize), kind: 'copy' };
    }
    this.logger.info('nextDecision', 'return', {
      cloneJobId,
      generation,
      kind: result.kind,
    });
    return result;
  }

  async confirmCopiedImage(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
    image: CopiedCloneImage,
  ): Promise<void> {
    this.logger.info('confirmCopiedImage', 'params', {
      cloneJobId,
      exerciseId: image.exerciseId,
      generation,
      workflowRunId,
    });
    await (
      await this.jobs()
    ).updateOne(
      {
        _id: new ObjectId(cloneJobId),
        generation,
        state: 'running',
        workflowRunId,
        'copiedImages.exerciseId': { $ne: image.exerciseId },
      },
      {
        $addToSet: { copiedImages: image },
        $inc: { completedImages: 1 },
      },
    );
    this.logger.info('confirmCopiedImage', 'completed', {
      cloneJobId,
      exerciseId: image.exerciseId,
      generation,
    });
  }

  async beginFinalization(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<boolean> {
    const document = await (
      await this.jobs()
    ).findOneAndUpdate(
      {
        _id: new ObjectId(cloneJobId),
        cancelRequestedAt: null,
        generation,
        state: 'running',
        workflowRunId,
      },
      { $set: { state: 'materializing' } },
      { returnDocument: 'after' },
    );
    const result = document !== null;
    this.logger.info('beginFinalization', 'return', {
      cloneJobId,
      generation,
      started: result,
    });
    return result;
  }

  async materializeClone(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<void> {
    this.logger.info('materializeClone', 'params', {
      cloneJobId,
      generation,
      workflowRunId,
    });
    const db = await database();
    const jobs = db.collection<CloneJobDocument>('training_plan_clone_jobs');
    const job = await jobs.findOne({
      _id: new ObjectId(cloneJobId),
      generation,
      state: 'materializing',
      workflowRunId,
    });
    if (job === null) return;
    const planId = this.deterministicId(cloneJobId, 'plan');
    const catalogEntryId = this.deterministicId(cloneJobId, 'catalog');
    const now = new Date();
    const copiedByExercise = new Map(
      (job.copiedImages ?? []).map((image) => [image.exerciseId, image]),
    );
    const workouts = job.snapshot.workouts.map((workout, workoutIndex) => ({
      _id: this.deterministicId(cloneJobId, `workout:${workoutIndex}`),
      createdAt: now,
      exercises: workout.exercises.map((exercise, exerciseIndex) =>
        this.materializeExercise(
          cloneJobId,
          exercise,
          exerciseIndex,
          workoutIndex,
          copiedByExercise,
        ),
      ),
      name: workout.name,
      updatedAt: now,
    }));
    await db.collection('training_plans').updateOne(
      { _id: planId },
      {
        $setOnInsert: {
          createdAt: now,
          description: job.snapshot.description,
          name: job.snapshot.name,
          ownerPersonId: job.personId,
          updatedAt: now,
          version: 0,
          workouts,
        },
      },
      { upsert: true },
    );
    await db.collection('training_plan_catalog_entries').updateOne(
      { _id: catalogEntryId },
      {
        $setOnInsert: {
          createdAt: now,
          globalTrainingPlanId: null,
          kind: 'owned',
          personId: job.personId,
          trainingPlanId: planId,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    await jobs.updateOne(
      {
        _id: job._id,
        generation,
        state: 'materializing',
        workflowRunId,
      },
      {
        $set: {
          deduplicationKey: null,
          materializedCatalogEntryId: catalogEntryId,
          materializedTrainingPlanId: planId,
          state: 'completed',
        },
      },
    );
    this.logger.info('materializeClone', 'completed', {
      cloneJobId,
      generation,
    });
  }

  async cleanupKeys(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<string[]> {
    const job = await (
      await this.jobs()
    ).findOne({
      _id: new ObjectId(cloneJobId),
      generation,
      state: 'cancelling',
      workflowRunId,
    });
    const result = (job?.copiedImages ?? []).flatMap((image) => [
      image.thumbnail.key,
      image.display.key,
    ]);
    this.logger.info('cleanupKeys', 'return', {
      cloneJobId,
      generation,
      keyCount: result.length,
    });
    return result;
  }

  async markCancelled(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<void> {
    await (
      await this.jobs()
    ).updateOne(
      {
        _id: new ObjectId(cloneJobId),
        generation,
        state: 'cancelling',
        workflowRunId,
      },
      {
        $set: {
          copiedImages: [],
          deduplicationKey: null,
          state: 'cancelled',
        },
      },
    );
    this.logger.info('markCancelled', 'completed', { cloneJobId, generation });
  }

  async markFailed(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<void> {
    await (
      await this.jobs()
    ).updateOne(
      {
        _id: new ObjectId(cloneJobId),
        generation,
        state: 'running',
        workflowRunId,
      },
      { $set: { failureCategory: 'clone-step-failed', state: 'failed' } },
    );
    this.logger.warn('markFailed', 'completed', { cloneJobId, generation });
  }

  private async jobs(): Promise<Collection<CloneJobDocument>> {
    const result = (await database()).collection<CloneJobDocument>(
      'training_plan_clone_jobs',
    );
    return result;
  }

  private mapJob(document: CloneJobDocument): TrainingPlanCloneJob {
    return {
      _id: document._id.toString(),
      cancelRequestedAt: document.cancelRequestedAt,
      completedImages: document.completedImages,
      copiedImages: document.copiedImages ?? [],
      generation: document.generation,
      personId: document.personId.toString(),
      snapshot: document.snapshot,
      state: document.state,
      workflowRunId: document.workflowRunId,
    };
  }

  private deterministicId(cloneJobId: string, discriminator: string): ObjectId {
    const hex = createHash('sha256')
      .update(`${cloneJobId}:${discriminator}`)
      .digest('hex')
      .slice(0, 24);
    return new ObjectId(hex);
  }

  private materializeExercise(
    cloneJobId: string,
    exercise: SnapshotExercise,
    exerciseIndex: number,
    workoutIndex: number,
    copiedByExercise: ReadonlyMap<string, CopiedCloneImage>,
  ): Record<string, unknown> {
    const { id: _sourceId, ...fields } = exercise;
    const copied = copiedByExercise.get(exercise.id);
    return {
      ...fields,
      _id: this.deterministicId(
        cloneJobId,
        `exercise:${workoutIndex}:${exerciseIndex}`,
      ),
      ...(exercise.type === 'image' || exercise.type === 'duration'
        ? {
            image:
              copied === undefined
                ? null
                : { display: copied.display, thumbnail: copied.thumbnail },
          }
        : {}),
    };
  }
}
