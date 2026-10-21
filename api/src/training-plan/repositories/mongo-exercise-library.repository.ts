import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';

import type { ExerciseLibraryCandidate } from '~/training-plan/domain/exercise-library';
import type { StoredExercise } from '~/training-plan/domain/training-plan.entity';
import { ExerciseLibraryRepository } from '~/training-plan/repositories/exercise-library.repository';
import { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';
import { TRAINING_PLAN_OPERATIONAL_SIZE_LIMIT } from '~/training-plan/training-plan.constants';

@Injectable()
export class MongoExerciseLibraryRepository extends ExerciseLibraryRepository {
  private readonly logger = new Logger(MongoExerciseLibraryRepository.name);

  constructor(
    @InjectModel(TrainingPlanDocument.name)
    private readonly model: Model<TrainingPlanDocument>,
  ) {
    super();
  }

  async representatives(): Promise<readonly ExerciseLibraryCandidate[]> {
    this.logger.log(
      'MongoExerciseLibraryRepository -> representatives -> params:',
      { params: {} },
    );
    // Collation groups accents/case; whitespace is canonicalized before grouping.
    // Sorting precedes $group so all metadata belongs to the same newest occurrence.
    const result = await this.model
      .aggregate<ExerciseLibraryCandidate>([
        { $match: { ownerPersonId: null } },
        { $unwind: '$workouts' },
        { $unwind: '$workouts.exercises' },
        {
          $set: {
            libraryName: {
              $reduce: {
                input: {
                  $regexFindAll: {
                    input: { $ifNull: ['$workouts.exercises.name', ''] },
                    regex: '\\S+',
                  },
                },
                initialValue: '',
                in: {
                  $concat: [
                    '$$value',
                    { $cond: [{ $eq: ['$$value', ''] }, '', ' '] },
                    '$$this.match',
                  ],
                },
              },
            },
          },
        },
        {
          $sort: {
            updatedAt: -1,
            _id: -1,
            'workouts._id': -1,
            'workouts.exercises._id': -1,
          },
        },
        {
          $group: {
            _id: {
              name: '$libraryName',
              pause: { $eq: ['$workouts.exercises.type', 'pause'] },
            },
            candidate: { $first: '$$ROOT' },
          },
        },
        {
          $project: {
            _id: 0,
            trainingPlanId: { $toString: '$candidate._id' },
            workoutId: { $toString: '$candidate.workouts._id' },
            exerciseId: { $toString: '$candidate.workouts.exercises._id' },
            version: '$candidate.version',
            exercise: {
              $mergeObjects: [
                '$candidate.workouts.exercises',
                { id: { $toString: '$candidate.workouts.exercises._id' } },
              ],
            },
          },
        },
        { $unset: 'exercise._id' },
      ])
      .collation({ locale: 'pt', strength: 1 })
      .option({ maxTimeMS: 10_000 })
      .exec();
    this.logger.log(
      'MongoExerciseLibraryRepository -> representatives -> mongoose return:',
      { data: { count: result.length } },
    );
    this.logger.log(
      'MongoExerciseLibraryRepository -> representatives -> return:',
      { data: { count: result.length } },
    );
    return result;
  }

  async append(
    personId: string,
    trainingPlanId: string,
    workoutId: string,
    version: number,
    exercises: readonly StoredExercise[],
  ): Promise<boolean> {
    this.logger.log('MongoExerciseLibraryRepository -> append -> params:', {
      params: { count: exercises.length, version },
    });
    const workoutObjectId = new Types.ObjectId(workoutId);
    const prepared = exercises.map(({ id, ...exercise }) => ({
      ...exercise,
      _id: new Types.ObjectId(id),
    }));
    const candidateWorkouts = {
      $map: {
        input: '$workouts',
        as: 'workout',
        in: {
          $cond: [
            { $eq: ['$$workout._id', workoutObjectId] },
            {
              $mergeObjects: [
                '$$workout',
                {
                  exercises: {
                    $concatArrays: [
                      '$$workout.exercises',
                      { $literal: prepared },
                    ],
                  },
                },
              ],
            },
            '$$workout',
          ],
        },
      },
    };
    const now = new Date();
    const updated = await this.model
      .updateOne(
        {
          _id: new Types.ObjectId(trainingPlanId),
          ownerPersonId: new Types.ObjectId(personId),
          version,
          workouts: {
            $elemMatch: {
              _id: workoutObjectId,
              [`exercises.${50 - exercises.length}`]: { $exists: false },
            },
          },
          $expr: {
            $lt: [
              {
                $bsonSize: {
                  $mergeObjects: [
                    '$$ROOT',
                    {
                      workouts: candidateWorkouts,
                      version: { $add: ['$version', 1] },
                    },
                  ],
                },
              },
              TRAINING_PLAN_OPERATIONAL_SIZE_LIMIT,
            ],
          },
        },
        {
          $push: { 'workouts.$.exercises': { $each: prepared } },
          $inc: { version: 1 },
          $set: { 'workouts.$.updatedAt': now },
        },
        { runValidators: true },
      )
      .exec();
    this.logger.log(
      'MongoExerciseLibraryRepository -> append -> mongoose return:',
      { data: { modified: updated.modifiedCount } },
    );
    const result = updated.modifiedCount === 1;
    this.logger.log('MongoExerciseLibraryRepository -> append -> return:', {
      data: { appended: result },
    });
    return result;
  }
}
