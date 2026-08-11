import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';

import type { Exercise, TrainingPlanSummary } from '@dall-fit/types';

import type {
  ExerciseChanges,
  ImageWriteInput,
  NewTrainingPlan,
  StoredExercise,
  StoredExerciseImage,
  TargetState,
  TrainingPlanChanges,
  TrainingPlanEntity,
  TrainingPlanPage,
  TrainingPlanWorkoutSummary,
  VersionedResult,
  WorkoutAggregate,
  WorkoutNameResult,
} from '~/training-plan/domain/training-plan.entity';
import { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';

interface PlainImageVariant {
  key: string;
  url: string;
  width: number;
  height: number;
}

interface PlainImage {
  thumbnail: PlainImageVariant;
  display: PlainImageVariant;
}

interface PlainExercise {
  _id: Types.ObjectId;
  type: Exercise['type'];
  name?: string;
  bodyArea?: string;
  youtubeId?: string;
  image?: PlainImage | null;
  restSeconds?: number;
  sets?: number;
  repetitions?: number;
  durationMinutes?: number;
}

interface PlainWorkout {
  _id: Types.ObjectId;
  name: string;
  exercises: PlainExercise[];
  createdAt: Date;
  updatedAt: Date;
}

interface PlainPlan {
  _id: Types.ObjectId;
  ownerPersonId: Types.ObjectId | null;
  name: string;
  description: string;
  workouts: PlainWorkout[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MongoTrainingPlanRepository extends TrainingPlanRepository {
  private readonly logger = new Logger(MongoTrainingPlanRepository.name);

  constructor(
    @InjectModel(TrainingPlanDocument.name)
    private readonly trainingPlanModel: Model<TrainingPlanDocument>,
  ) {
    super();
  }

  async listGlobal(page: number, pageSize: number): Promise<TrainingPlanPage> {
    this.logger.log('MongoTrainingPlanRepository -> listGlobal -> params:', {
      params: { ownerIsGlobal: true, page, pageSize },
    });
    const [documents, total] = await Promise.all([
      this.trainingPlanModel
        .find({ ownerPersonId: null })
        .select({
          description: 1,
          name: 1,
          version: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<PlainPlan[]>()
        .exec(),
      this.trainingPlanModel.countDocuments({ ownerPersonId: null }).exec(),
    ]);
    this.logger.log(
      'MongoTrainingPlanRepository -> listGlobal -> mongoose return:',
      {
        data: { count: documents.length, total },
      },
    );
    const result = {
      data: documents.map((document) => this.mapSummary(document)),
      total,
    };
    this.logger.log('MongoTrainingPlanRepository -> listGlobal -> return:', {
      data: { count: result.data.length, total },
    });
    return result;
  }

  async create(plan: NewTrainingPlan): Promise<TrainingPlanEntity> {
    this.logger.log('MongoTrainingPlanRepository -> create -> params:', {
      params: {
        fields: Object.keys(plan),
        ownerIsGlobal: plan.ownerPersonId === null,
      },
    });
    const document = await this.trainingPlanModel.create({
      ...plan,
      workouts: [],
    });
    const plain = document.toObject() as unknown as PlainPlan;
    this.logger.log(
      'MongoTrainingPlanRepository -> create -> mongoose return:',
      {
        data: { trainingPlanId: document.id },
      },
    );
    const result = this.mapPlan(plain);
    this.logger.log('MongoTrainingPlanRepository -> create -> return:', {
      data: { trainingPlanId: result.id },
    });
    return result;
  }

  async findGlobalById(id: string): Promise<TrainingPlanEntity | null> {
    this.logger.log(
      'MongoTrainingPlanRepository -> findGlobalById -> params:',
      {
        params: { ownerIsGlobal: true, trainingPlanId: id },
      },
    );
    const document = await this.trainingPlanModel
      .findOne({ _id: id, ownerPersonId: null })
      .select({
        description: 1,
        name: 1,
        version: 1,
        createdAt: 1,
        updatedAt: 1,
        'workouts._id': 1,
        'workouts.name': 1,
        'workouts.exercises._id': 1,
      })
      .lean<PlainPlan>()
      .exec();
    this.logger.log(
      'MongoTrainingPlanRepository -> findGlobalById -> mongoose return:',
      {
        data: { found: document !== null, trainingPlanId: id },
      },
    );
    const result = document === null ? null : this.mapPlan(document);
    this.logger.log(
      'MongoTrainingPlanRepository -> findGlobalById -> return:',
      {
        data: { found: result !== null, trainingPlanId: id },
      },
    );
    return result;
  }

  async updateGlobal(
    id: string,
    expectedVersion: number,
    changes: TrainingPlanChanges,
  ): Promise<VersionedResult<TrainingPlanEntity> | null> {
    this.logger.log('MongoTrainingPlanRepository -> updateGlobal -> params:', {
      params: {
        expectedVersion,
        fields: Object.keys(changes),
        trainingPlanId: id,
      },
    });
    const document = await this.trainingPlanModel
      .findOneAndUpdate(
        { _id: id, ownerPersonId: null, version: expectedVersion },
        { $inc: { version: 1 }, $set: changes },
        { new: true, runValidators: true },
      )
      .lean<PlainPlan>()
      .exec();
    const result =
      document === null
        ? null
        : { data: this.mapPlan(document), version: document.version };
    this.logger.log('MongoTrainingPlanRepository -> updateGlobal -> return:', {
      data: {
        updated: result !== null,
        trainingPlanId: id,
        version: result?.version,
      },
    });
    return result;
  }

  async deleteGlobal(
    id: string,
    expectedVersion: number,
  ): Promise<readonly StoredExerciseImage[] | null> {
    this.logger.log('MongoTrainingPlanRepository -> deleteGlobal -> params:', {
      params: { expectedVersion, trainingPlanId: id },
    });
    const document = await this.trainingPlanModel
      .findOneAndDelete({
        _id: id,
        ownerPersonId: null,
        version: expectedVersion,
      })
      .lean<PlainPlan>()
      .exec();
    const result =
      document === null ? null : this.collectImages(document.workouts);
    this.logger.log('MongoTrainingPlanRepository -> deleteGlobal -> return:', {
      data: {
        deleted: result !== null,
        imageCount: result?.length ?? 0,
        trainingPlanId: id,
      },
    });
    return result;
  }

  async createWorkout(
    trainingPlanId: string,
    expectedVersion: number,
    name: string,
  ): Promise<VersionedResult<TrainingPlanWorkoutSummary> | null> {
    this.logger.log('MongoTrainingPlanRepository -> createWorkout -> params:', {
      params: { expectedVersion, trainingPlanId },
    });
    const workoutId = new Types.ObjectId();
    const now = new Date();
    const document = await this.trainingPlanModel
      .findOneAndUpdate(
        {
          _id: trainingPlanId,
          ownerPersonId: null,
          version: expectedVersion,
          'workouts.24': { $exists: false },
        },
        {
          $inc: { version: 1 },
          $push: {
            workouts: {
              _id: workoutId,
              createdAt: now,
              exercises: [],
              name,
              updatedAt: now,
            },
          },
        },
        { new: true, projection: { version: 1 } },
      )
      .lean<PlainPlan>()
      .exec();
    const result =
      document === null
        ? null
        : {
            data: { exerciseCount: 0, id: workoutId.toString(), name },
            version: document.version,
          };
    this.logger.log('MongoTrainingPlanRepository -> createWorkout -> return:', {
      data: {
        created: result !== null,
        trainingPlanId,
        workoutId: result?.data.id,
      },
    });
    return result;
  }

  async deleteWorkout(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
  ): Promise<VersionedResult<readonly StoredExerciseImage[]> | null> {
    this.logger.log('MongoTrainingPlanRepository -> deleteWorkout -> params:', {
      params: { expectedVersion, trainingPlanId, workoutId },
    });
    const before = await this.trainingPlanModel
      .findOne({
        _id: trainingPlanId,
        ownerPersonId: null,
        version: expectedVersion,
        'workouts._id': workoutId,
      })
      .select({ workouts: { $elemMatch: { _id: workoutId } } })
      .lean<PlainPlan>()
      .exec();
    if (before === null) {
      const result = null;
      return result;
    }
    const document = await this.trainingPlanModel
      .findOneAndUpdate(
        {
          _id: trainingPlanId,
          ownerPersonId: null,
          version: expectedVersion,
          'workouts._id': workoutId,
        },
        {
          $inc: { version: 1 },
          $pull: { workouts: { _id: new Types.ObjectId(workoutId) } },
        },
        { new: true, projection: { version: 1 } },
      )
      .lean<PlainPlan>()
      .exec();
    const result =
      document === null
        ? null
        : {
            data: this.collectImages(before.workouts),
            version: document.version,
          };
    this.logger.log('MongoTrainingPlanRepository -> deleteWorkout -> return:', {
      data: { deleted: result !== null, trainingPlanId, workoutId },
    });
    return result;
  }

  async findWorkout(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<WorkoutAggregate | null> {
    this.logger.log('MongoTrainingPlanRepository -> findWorkout -> params:', {
      params: { trainingPlanId, workoutId },
    });
    const document = await this.trainingPlanModel
      .findOne({
        _id: trainingPlanId,
        ownerPersonId: null,
        'workouts._id': workoutId,
      })
      .select({
        name: 1,
        version: 1,
        workouts: { $elemMatch: { _id: workoutId } },
      })
      .lean<PlainPlan>()
      .exec();
    const workout = document?.workouts[0];
    const result =
      document === null || workout === undefined
        ? null
        : {
            id: workout._id.toString(),
            name: workout.name,
            version: document.version,
            trainingPlan: { id: document._id.toString(), name: document.name },
            exercises: workout.exercises.map((exercise) =>
              this.mapStoredExercise(exercise),
            ),
            createdAt: workout.createdAt.toISOString(),
            updatedAt: workout.updatedAt.toISOString(),
          };
    this.logger.log('MongoTrainingPlanRepository -> findWorkout -> return:', {
      data: { found: result !== null, trainingPlanId, workoutId },
    });
    return result;
  }

  async updateWorkoutName(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    name: string,
  ): Promise<VersionedResult<WorkoutNameResult> | null> {
    const now = new Date();
    const result = await this.updateAndProjectWorkout(
      'updateWorkoutName',
      trainingPlanId,
      workoutId,
      expectedVersion,
      {
        $inc: { version: 1 },
        $set: { 'workouts.$.name': name, 'workouts.$.updatedAt': now },
      },
      (workout, version) => ({
        data: {
          id: workout._id.toString(),
          name: workout.name,
          updatedAt: workout.updatedAt.toISOString(),
        },
        version,
      }),
    );
    return result;
  }

  async createExercise(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    exercise: StoredExercise,
  ): Promise<VersionedResult<StoredExercise> | null> {
    const now = new Date();
    const stored = {
      ...exercise,
      _id: new Types.ObjectId(exercise.id),
      id: undefined,
    };
    const result = await this.updateAndProjectWorkout(
      'createExercise',
      trainingPlanId,
      workoutId,
      expectedVersion,
      {
        $inc: { version: 1 },
        $push: { 'workouts.$.exercises': stored },
        $set: { 'workouts.$.updatedAt': now },
      },
      (workout, version) => {
        const created = workout.exercises.find(
          (item) => item._id.toString() === exercise.id,
        );
        return created === undefined
          ? null
          : { data: this.mapStoredExercise(created), version };
      },
    );
    return result;
  }

  async updateExercise(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    changes: ExerciseChanges,
  ): Promise<VersionedResult<StoredExercise> | null> {
    const before = await this.findWorkout(trainingPlanId, workoutId);
    if (before === null || before.version !== expectedVersion) {
      const result = null;
      return result;
    }
    const target = before.exercises.find((item) => item.id === exerciseId);
    if (target === undefined) {
      const result = null;
      return result;
    }
    const updated = { ...target, ...changes } as StoredExercise;
    const stored = {
      ...updated,
      _id: new Types.ObjectId(exerciseId),
      id: undefined,
    };
    const document = await this.trainingPlanModel
      .findOneAndUpdate(
        {
          _id: trainingPlanId,
          ownerPersonId: null,
          version: expectedVersion,
          'workouts._id': workoutId,
          'workouts.exercises._id': exerciseId,
        },
        {
          $inc: { version: 1 },
          $set: {
            'workouts.$[workout].exercises.$[exercise]': stored,
            'workouts.$[workout].updatedAt': new Date(),
          },
        },
        {
          arrayFilters: [
            { 'workout._id': new Types.ObjectId(workoutId) },
            { 'exercise._id': new Types.ObjectId(exerciseId) },
          ],
          new: true,
          projection: {
            version: 1,
            workouts: { $elemMatch: { _id: workoutId } },
          },
          runValidators: true,
        },
      )
      .lean<PlainPlan>()
      .exec();
    const exercise = document?.workouts[0]?.exercises.find(
      (item) => item._id.toString() === exerciseId,
    );
    const result =
      document === null || exercise === undefined
        ? null
        : { data: this.mapStoredExercise(exercise), version: document.version };
    this.logger.log(
      'MongoTrainingPlanRepository -> updateExercise -> return:',
      {
        data: {
          updated: result !== null,
          trainingPlanId,
          workoutId,
          exerciseId,
        },
      },
    );
    return result;
  }

  async deleteExercise(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<VersionedResult<StoredExerciseImage | null> | null> {
    const before = await this.findWorkout(trainingPlanId, workoutId);
    if (before === null || before.version !== expectedVersion) {
      const result = null;
      return result;
    }
    const target = before.exercises.find((item) => item.id === exerciseId);
    if (target === undefined) {
      const result = null;
      return result;
    }
    const image = target.type === 'image' ? target.image : null;
    const document = await this.trainingPlanModel
      .findOneAndUpdate(
        {
          _id: trainingPlanId,
          ownerPersonId: null,
          version: expectedVersion,
          'workouts._id': workoutId,
          'workouts.exercises._id': exerciseId,
        },
        {
          $inc: { version: 1 },
          $pull: {
            'workouts.$[workout].exercises': {
              _id: new Types.ObjectId(exerciseId),
            },
          },
          $set: { 'workouts.$[workout].updatedAt': new Date() },
        },
        {
          arrayFilters: [{ 'workout._id': new Types.ObjectId(workoutId) }],
          new: true,
          projection: { version: 1 },
        },
      )
      .lean<PlainPlan>()
      .exec();
    const result =
      document === null ? null : { data: image, version: document.version };
    this.logger.log(
      'MongoTrainingPlanRepository -> deleteExercise -> return:',
      {
        data: {
          deleted: result !== null,
          trainingPlanId,
          workoutId,
          exerciseId,
        },
      },
    );
    return result;
  }

  async reorderExercises(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    exerciseIds: readonly string[],
  ): Promise<VersionedResult<undefined> | null> {
    const before = await this.findWorkout(trainingPlanId, workoutId);
    if (before === null || before.version !== expectedVersion) {
      const result = null;
      return result;
    }
    const current = before.exercises.map((item) => item.id);
    if (current.every((id, index) => id === exerciseIds[index])) {
      const result = { data: undefined, version: expectedVersion };
      return result;
    }
    const byId = new Map(before.exercises.map((item) => [item.id, item]));
    const ordered = exerciseIds.map((id) => ({
      ...byId.get(id),
      _id: new Types.ObjectId(id),
      id: undefined,
    }));
    const document = await this.trainingPlanModel
      .findOneAndUpdate(
        {
          _id: trainingPlanId,
          ownerPersonId: null,
          version: expectedVersion,
          'workouts._id': workoutId,
        },
        {
          $inc: { version: 1 },
          $set: {
            'workouts.$.exercises': ordered,
            'workouts.$.updatedAt': new Date(),
          },
        },
        { new: true, projection: { version: 1 }, runValidators: true },
      )
      .lean<PlainPlan>()
      .exec();
    const result =
      document === null ? null : { data: undefined, version: document.version };
    this.logger.log(
      'MongoTrainingPlanRepository -> reorderExercises -> return:',
      { data: { reordered: result !== null, trainingPlanId, workoutId } },
    );
    return result;
  }

  async updateExerciseImage(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    input: ImageWriteInput,
  ): Promise<VersionedResult<StoredExerciseImage | null> | null> {
    const before = await this.findWorkout(trainingPlanId, workoutId);
    if (before === null || before.version !== expectedVersion) {
      const result = null;
      return result;
    }
    const target = before.exercises.find((item) => item.id === exerciseId);
    if (target?.type !== 'image') {
      const result = null;
      return result;
    }
    const previous = target.image;
    if (input.image === null && previous === null) {
      const result = { data: null, version: expectedVersion };
      return result;
    }
    const updated = { ...target, image: input.image };
    const stored = {
      ...updated,
      _id: new Types.ObjectId(exerciseId),
      id: undefined,
    };
    const document = await this.trainingPlanModel
      .findOneAndUpdate(
        {
          _id: trainingPlanId,
          ownerPersonId: null,
          version: expectedVersion,
          'workouts._id': workoutId,
          'workouts.exercises._id': exerciseId,
          'workouts.exercises.type': 'image',
        },
        {
          $inc: { version: 1 },
          $set: {
            'workouts.$[workout].exercises.$[exercise]': stored,
            'workouts.$[workout].updatedAt': new Date(),
          },
        },
        {
          arrayFilters: [
            { 'workout._id': new Types.ObjectId(workoutId) },
            { 'exercise._id': new Types.ObjectId(exerciseId) },
          ],
          new: true,
          projection: { version: 1 },
          runValidators: true,
        },
      )
      .lean<PlainPlan>()
      .exec();
    const result =
      document === null ? null : { data: previous, version: document.version };
    this.logger.log(
      'MongoTrainingPlanRepository -> updateExerciseImage -> return:',
      {
        data: {
          updated: result !== null,
          trainingPlanId,
          workoutId,
          exerciseId,
        },
      },
    );
    return result;
  }

  async inspectTarget(
    trainingPlanId: string,
    workoutId?: string,
    exerciseId?: string,
  ): Promise<TargetState> {
    this.logger.log('MongoTrainingPlanRepository -> inspectTarget -> params:', {
      params: { trainingPlanId, workoutId, exerciseId },
    });
    const workoutObjectId =
      workoutId === undefined ? undefined : new Types.ObjectId(workoutId);
    const exerciseObjectId =
      exerciseId === undefined ? undefined : new Types.ObjectId(exerciseId);
    const [document] = await this.trainingPlanModel
      .aggregate<{
        bsonSize: number;
        exerciseCount?: number;
        exerciseExists: boolean;
        exerciseImage?: PlainImage | null;
        exerciseType?: Exercise['type'];
        maxExerciseCount: number;
        version: number;
        workoutCount: number;
        workoutExists: boolean;
      }>([
        {
          $match: {
            _id: new Types.ObjectId(trainingPlanId),
            ownerPersonId: null,
          },
        },
        { $set: { originalBsonSize: { $bsonSize: '$$ROOT' } } },
        {
          $set: {
            targetWorkout:
              workoutObjectId === undefined
                ? null
                : {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$workouts',
                          as: 'workout',
                          cond: { $eq: ['$$workout._id', workoutObjectId] },
                        },
                      },
                      0,
                    ],
                  },
          },
        },
        {
          $set: {
            targetExercise:
              exerciseObjectId === undefined
                ? null
                : {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: { $ifNull: ['$targetWorkout.exercises', []] },
                          as: 'exercise',
                          cond: { $eq: ['$$exercise._id', exerciseObjectId] },
                        },
                      },
                      0,
                    ],
                  },
          },
        },
        {
          $project: {
            bsonSize: '$originalBsonSize',
            version: 1,
            workoutCount: { $size: '$workouts' },
            maxExerciseCount: {
              $max: {
                $concatArrays: [
                  [0],
                  {
                    $map: {
                      input: '$workouts',
                      as: 'workout',
                      in: { $size: '$$workout.exercises' },
                    },
                  },
                ],
              },
            },
            workoutExists:
              workoutObjectId === undefined
                ? { $literal: true }
                : { $ne: [{ $type: '$targetWorkout' }, 'missing'] },
            exerciseExists:
              exerciseObjectId === undefined
                ? { $literal: true }
                : { $ne: [{ $type: '$targetExercise' }, 'missing'] },
            exerciseCount: {
              $cond: [
                { $ne: [{ $type: '$targetWorkout' }, 'missing'] },
                { $size: { $ifNull: ['$targetWorkout.exercises', []] } },
                '$$REMOVE',
              ],
            },
            exerciseType: '$targetExercise.type',
            exerciseImage: '$targetExercise.image',
          },
        },
      ])
      .exec();
    let exerciseImage: StoredExerciseImage | null | undefined;
    if (
      document?.exerciseType === 'image' &&
      document.exerciseImage !== undefined
    ) {
      exerciseImage =
        document.exerciseImage === null
          ? null
          : this.mapStoredImage(document.exerciseImage);
    }
    const result: TargetState = {
      trainingPlanExists: document !== undefined,
      workoutExists: document?.workoutExists ?? false,
      exerciseExists: document?.exerciseExists ?? false,
      version: document?.version,
      workoutCount: document?.workoutCount,
      exerciseCount: document?.exerciseCount,
      maxExerciseCount: document?.maxExerciseCount,
      bsonSize: document?.bsonSize,
      exerciseType: document?.exerciseType,
      exerciseImage,
    };
    this.logger.log('MongoTrainingPlanRepository -> inspectTarget -> return:', {
      data: {
        ...result,
        exerciseImage:
          result.exerciseImage === undefined
            ? undefined
            : result.exerciseImage !== null,
      },
    });
    return result;
  }

  async listReferencedImageKeys(): Promise<ReadonlySet<string>> {
    this.logger.log(
      'MongoTrainingPlanRepository -> listReferencedImageKeys -> params:',
      { params: {} },
    );
    const documents = await this.trainingPlanModel
      .find({})
      .select({ 'workouts.exercises.image': 1 })
      .lean<PlainPlan[]>()
      .exec();
    const result = new Set(
      documents.flatMap((document) =>
        this.collectImages(document.workouts).flatMap((image) => [
          image.thumbnail.key,
          image.display.key,
        ]),
      ),
    );
    this.logger.log(
      'MongoTrainingPlanRepository -> listReferencedImageKeys -> return:',
      { data: { count: result.size } },
    );
    return result;
  }

  private async updateAndProjectWorkout<T>(
    method: string,
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    update: object,
    map: (workout: PlainWorkout, version: number) => VersionedResult<T> | null,
    extraFilter: object = {},
  ): Promise<VersionedResult<T> | null> {
    this.logger.log(`MongoTrainingPlanRepository -> ${method} -> params:`, {
      params: { expectedVersion, trainingPlanId, workoutId },
    });
    const document = await this.trainingPlanModel
      .findOneAndUpdate(
        {
          _id: trainingPlanId,
          ownerPersonId: null,
          version: expectedVersion,
          'workouts._id': workoutId,
          ...extraFilter,
        },
        update,
        {
          new: true,
          projection: {
            version: 1,
            workouts: { $elemMatch: { _id: workoutId } },
          },
          runValidators: true,
        },
      )
      .lean<PlainPlan>()
      .exec();
    const workout = document?.workouts[0];
    const result =
      document === null || workout === undefined
        ? null
        : map(workout, document.version);
    this.logger.log(`MongoTrainingPlanRepository -> ${method} -> return:`, {
      data: { updated: result !== null, trainingPlanId, workoutId },
    });
    return result;
  }

  private mapSummary(document: PlainPlan): TrainingPlanSummary {
    const result = {
      id: document._id.toString(),
      name: document.name,
      description: document.description,
      version: document.version,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
    return result;
  }

  private mapPlan(document: PlainPlan): TrainingPlanEntity {
    const result = {
      ...this.mapSummary(document),
      ownerPersonId: document.ownerPersonId?.toString() ?? null,
      workouts: (document.workouts ?? []).map((workout) => ({
        id: workout._id.toString(),
        name: workout.name,
        exerciseCount: workout.exercises?.length ?? 0,
      })),
    };
    return result;
  }

  private mapStoredExercise(exercise: PlainExercise): StoredExercise {
    const id = exercise._id.toString();
    let result: StoredExercise;
    switch (exercise.type) {
      case 'youtube-short':
        result = {
          id,
          type: exercise.type,
          name: exercise.name ?? '',
          bodyArea: exercise.bodyArea as Extract<
            Exercise,
            { type: 'youtube-short' }
          >['bodyArea'],
          youtubeId: exercise.youtubeId ?? '',
          restSeconds: exercise.restSeconds ?? 0,
          sets: exercise.sets ?? 0,
          repetitions: exercise.repetitions ?? 0,
        };
        break;
      case 'image':
        result = {
          id,
          type: exercise.type,
          name: exercise.name ?? '',
          bodyArea: exercise.bodyArea as Extract<
            Exercise,
            { type: 'image' }
          >['bodyArea'],
          image: exercise.image ?? null,
          restSeconds: exercise.restSeconds ?? 0,
          sets: exercise.sets ?? 0,
          repetitions: exercise.repetitions ?? 0,
        };
        break;
      case 'youtube-long':
        result = {
          id,
          type: exercise.type,
          name: exercise.name ?? '',
          bodyArea: exercise.bodyArea as Extract<
            Exercise,
            { type: 'youtube-long' }
          >['bodyArea'],
          youtubeId: exercise.youtubeId ?? '',
        };
        break;
      case 'pause':
        result = {
          id,
          type: exercise.type,
          restSeconds: exercise.restSeconds ?? 1,
        };
        break;
      case 'duration':
        result = {
          id,
          type: exercise.type,
          name: exercise.name ?? '',
          bodyArea: exercise.bodyArea as Extract<
            Exercise,
            { type: 'duration' }
          >['bodyArea'],
          durationMinutes: exercise.durationMinutes ?? 1,
        };
        break;
    }
    return result;
  }

  private mapStoredImage(image: PlainImage): StoredExerciseImage {
    const result = {
      thumbnail: { ...image.thumbnail },
      display: { ...image.display },
    };
    return result;
  }

  private collectImages(
    workouts: readonly PlainWorkout[],
  ): StoredExerciseImage[] {
    const result = workouts.flatMap((workout) =>
      workout.exercises.flatMap((exercise) =>
        exercise.type === 'image' && exercise.image != null
          ? [exercise.image]
          : [],
      ),
    );
    return result;
  }
}
