import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';

import type { TrainingPlanSummary } from '@dall-fit/types';

import type {
  DeleteWorkoutResult,
  NewTrainingPlan,
  TrainingPlanChanges,
  TrainingPlanEntity,
  TrainingPlanPage,
  TrainingPlanWorkoutSummary,
} from '~/training-plan/domain/training-plan.entity';
import { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import {
  TrainingPlanDocument,
  type TrainingPlanHydratedDocument,
} from '~/training-plan/repositories/training-plan.schema';

interface TrainingPlanDetailProjection {
  _id: Types.ObjectId;
  ownerPersonId: Types.ObjectId | null;
  name: string;
  description: string;
  workouts: Array<{
    _id: Types.ObjectId;
    name: string;
    exerciseCount: number;
  }>;
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
        .select({ description: 1, name: 1, createdAt: 1, updatedAt: 1 })
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .exec(),
      this.trainingPlanModel.countDocuments({ ownerPersonId: null }).exec(),
    ]);

    this.logger.log(
      'MongoTrainingPlanRepository -> listGlobal -> mongoose return:',
      { data: { count: documents.length, total } },
    );

    const result = {
      data: documents.map((document) => this.mapSummary(document)),
      total,
    };
    this.logger.log('MongoTrainingPlanRepository -> listGlobal -> return:', {
      data: { count: result.data.length, total: result.total },
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
    this.logger.log(
      'MongoTrainingPlanRepository -> create -> mongoose return:',
      { data: { trainingPlanId: document.id } },
    );

    const result = this.mapDocument(document);
    this.logger.log('MongoTrainingPlanRepository -> create -> return:', {
      data: { trainingPlanId: result.id },
    });

    return result;
  }

  async findGlobalById(id: string): Promise<TrainingPlanEntity | null> {
    this.logger.log(
      'MongoTrainingPlanRepository -> findGlobalById -> params:',
      { params: { ownerIsGlobal: true, trainingPlanId: id } },
    );

    const [document] = await this.trainingPlanModel
      .aggregate<TrainingPlanDetailProjection>([
        { $match: { _id: new Types.ObjectId(id), ownerPersonId: null } },
        {
          $project: {
            createdAt: 1,
            description: 1,
            name: 1,
            ownerPersonId: 1,
            updatedAt: 1,
            workouts: {
              $map: {
                as: 'workout',
                in: {
                  _id: '$$workout._id',
                  exerciseCount: {
                    $size: { $ifNull: ['$$workout.exercises', []] },
                  },
                  name: '$$workout.name',
                },
                input: '$workouts',
              },
            },
          },
        },
      ])
      .exec();

    this.logger.log(
      'MongoTrainingPlanRepository -> findGlobalById -> aggregate return:',
      { data: { found: document !== undefined, trainingPlanId: id } },
    );

    const result = document === undefined ? null : this.mapProjection(document);
    this.logger.log(
      'MongoTrainingPlanRepository -> findGlobalById -> return:',
      { data: { found: result !== null, trainingPlanId: id } },
    );

    return result;
  }

  async updateGlobal(
    id: string,
    changes: TrainingPlanChanges,
  ): Promise<TrainingPlanEntity | null> {
    this.logger.log('MongoTrainingPlanRepository -> updateGlobal -> params:', {
      params: {
        fields: Object.keys(changes),
        ownerIsGlobal: true,
        trainingPlanId: id,
      },
    });

    const document = await this.trainingPlanModel
      .findOneAndUpdate(
        { _id: id, ownerPersonId: null },
        { $set: changes },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    this.logger.log(
      'MongoTrainingPlanRepository -> updateGlobal -> mongoose return:',
      { data: { found: document !== null, trainingPlanId: id } },
    );

    const result = document === null ? null : this.mapDocument(document);
    this.logger.log('MongoTrainingPlanRepository -> updateGlobal -> return:', {
      data: { found: result !== null, trainingPlanId: id },
    });

    return result;
  }

  async deleteGlobal(id: string): Promise<boolean> {
    this.logger.log('MongoTrainingPlanRepository -> deleteGlobal -> params:', {
      params: { ownerIsGlobal: true, trainingPlanId: id },
    });

    const document = await this.trainingPlanModel
      .findOneAndDelete({ _id: id, ownerPersonId: null })
      .exec();
    const result = document !== null;
    this.logger.log(
      'MongoTrainingPlanRepository -> deleteGlobal -> mongoose return:',
      { data: { deleted: result, trainingPlanId: id } },
    );
    this.logger.log('MongoTrainingPlanRepository -> deleteGlobal -> return:', {
      data: { deleted: result, trainingPlanId: id },
    });

    return result;
  }

  async createWorkout(
    trainingPlanId: string,
    name: string,
  ): Promise<TrainingPlanWorkoutSummary | null> {
    this.logger.log('MongoTrainingPlanRepository -> createWorkout -> params:', {
      params: { ownerIsGlobal: true, trainingPlanId },
    });

    const workoutId = new Types.ObjectId();
    const updateResult = await this.trainingPlanModel
      .updateOne(
        { _id: trainingPlanId, ownerPersonId: null },
        {
          $push: {
            workouts: { _id: workoutId, exercises: [], name },
          },
        },
      )
      .exec();
    this.logger.log(
      'MongoTrainingPlanRepository -> createWorkout -> mongoose return:',
      {
        data: {
          matched: updateResult.matchedCount,
          modified: updateResult.modifiedCount,
          trainingPlanId,
        },
      },
    );

    const result =
      updateResult.matchedCount === 0
        ? null
        : { exerciseCount: 0, id: workoutId.toString(), name };
    this.logger.log('MongoTrainingPlanRepository -> createWorkout -> return:', {
      data: {
        created: result !== null,
        trainingPlanId,
        workoutId: result?.id,
      },
    });

    return result;
  }

  async deleteWorkout(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<DeleteWorkoutResult> {
    this.logger.log('MongoTrainingPlanRepository -> deleteWorkout -> params:', {
      params: { ownerIsGlobal: true, trainingPlanId, workoutId },
    });

    const updateResult = await this.trainingPlanModel
      .updateOne(
        {
          _id: trainingPlanId,
          ownerPersonId: null,
          'workouts._id': workoutId,
        },
        { $pull: { workouts: { _id: workoutId } } },
      )
      .exec();
    this.logger.log(
      'MongoTrainingPlanRepository -> deleteWorkout -> updateOne return:',
      {
        data: {
          matched: updateResult.matchedCount,
          modified: updateResult.modifiedCount,
          trainingPlanId,
          workoutId,
        },
      },
    );

    if (updateResult.modifiedCount === 1) {
      this.logger.log(
        'MongoTrainingPlanRepository -> deleteWorkout -> deleted branch:',
        { data: { trainingPlanId, workoutId } },
      );
      const result = 'deleted' as const;
      this.logger.log(
        'MongoTrainingPlanRepository -> deleteWorkout -> return:',
        { data: { result, trainingPlanId, workoutId } },
      );

      return result;
    }

    const trainingPlanExists = await this.trainingPlanModel
      .exists({ _id: trainingPlanId, ownerPersonId: null })
      .exec();
    this.logger.log(
      'MongoTrainingPlanRepository -> deleteWorkout -> exists return:',
      { data: { trainingPlanExists: trainingPlanExists !== null } },
    );

    const result =
      trainingPlanExists === null
        ? ('training-plan-not-found' as const)
        : ('workout-not-found' as const);
    this.logger.log('MongoTrainingPlanRepository -> deleteWorkout -> return:', {
      data: { result, trainingPlanId, workoutId },
    });

    return result;
  }

  private mapSummary(
    document: TrainingPlanHydratedDocument,
  ): TrainingPlanSummary {
    this.logger.log('MongoTrainingPlanRepository -> mapSummary -> params:', {
      params: { trainingPlanId: document.id },
    });

    const result = {
      id: document.id,
      name: document.name,
      description: document.description,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
    this.logger.log('MongoTrainingPlanRepository -> mapSummary -> return:', {
      data: { trainingPlanId: result.id },
    });

    return result;
  }

  private mapDocument(
    document: TrainingPlanHydratedDocument,
  ): TrainingPlanEntity {
    this.logger.log('MongoTrainingPlanRepository -> mapDocument -> params:', {
      params: { trainingPlanId: document.id },
    });

    const result = {
      ...this.mapSummary(document),
      ownerPersonId: document.ownerPersonId?.toString() ?? null,
      workouts: document.workouts.map((workout) => ({
        exerciseCount: workout.exercises.length,
        id: workout._id.toString(),
        name: workout.name,
      })),
    };
    this.logger.log('MongoTrainingPlanRepository -> mapDocument -> return:', {
      data: {
        trainingPlanId: result.id,
        workoutCount: result.workouts.length,
      },
    });

    return result;
  }

  private mapProjection(
    document: TrainingPlanDetailProjection,
  ): TrainingPlanEntity {
    this.logger.log('MongoTrainingPlanRepository -> mapProjection -> params:', {
      params: { trainingPlanId: document._id.toString() },
    });

    const result = {
      id: document._id.toString(),
      name: document.name,
      description: document.description,
      ownerPersonId: document.ownerPersonId?.toString() ?? null,
      workouts: document.workouts.map((workout) => ({
        exerciseCount: workout.exerciseCount,
        id: workout._id.toString(),
        name: workout.name,
      })),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
    this.logger.log('MongoTrainingPlanRepository -> mapProjection -> return:', {
      data: {
        trainingPlanId: result.id,
        workoutCount: result.workouts.length,
      },
    });

    return result;
  }
}
