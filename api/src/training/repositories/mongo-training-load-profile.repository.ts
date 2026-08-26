import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';

import type {
  TrainingLoadProfile,
  TrainingLoadProfileWrite,
} from '~/training/domain/training.types';
import { TrainingLoadProfileRepository } from '~/training/repositories/training-load-profile.repository';
import { TrainingLoadProfileDocument } from '~/training/repositories/training-load-profile.schema';

interface PlainLoadProfile {
  exerciseId: Types.ObjectId;
  loadsKg: readonly (number | null)[];
  workoutId: Types.ObjectId;
}

@Injectable()
export class MongoTrainingLoadProfileRepository extends TrainingLoadProfileRepository {
  private readonly logger = new Logger(MongoTrainingLoadProfileRepository.name);

  constructor(
    @InjectModel(TrainingLoadProfileDocument.name)
    private readonly model: Model<TrainingLoadProfileDocument>,
  ) {
    super();
  }

  async findForExercises(
    personId: string,
    trainingPlanId: string,
    exerciseIds: readonly string[],
  ): Promise<readonly TrainingLoadProfile[]> {
    this.logger.log(
      'MongoTrainingLoadProfileRepository -> findForExercises -> params:',
      {
        params: { exerciseCount: exerciseIds.length, personId, trainingPlanId },
      },
    );
    if (exerciseIds.length === 0) {
      const result: readonly TrainingLoadProfile[] = [];
      this.logger.log(
        'MongoTrainingLoadProfileRepository -> findForExercises -> return:',
        { data: { count: 0 } },
      );
      return result;
    }
    const documents = await this.model
      .find({
        exerciseId: { $in: exerciseIds.map((id) => new Types.ObjectId(id)) },
        personId: new Types.ObjectId(personId),
        trainingPlanId: new Types.ObjectId(trainingPlanId),
      })
      .select({ exerciseId: 1, loadsKg: 1, workoutId: 1 })
      .lean<PlainLoadProfile[]>()
      .exec();
    const result = documents.map((document) => ({
      exerciseId: document.exerciseId.toString(),
      loadsKg: document.loadsKg,
      workoutId: document.workoutId.toString(),
    }));
    this.logger.log(
      'MongoTrainingLoadProfileRepository -> findForExercises -> return:',
      { data: { count: result.length } },
    );
    return result;
  }

  async save(input: TrainingLoadProfileWrite): Promise<void> {
    this.logger.log('MongoTrainingLoadProfileRepository -> save -> params:', {
      params: {
        exerciseId: input.exerciseId,
        personId: input.personId,
        trainingPlanId: input.trainingPlanId,
      },
    });
    const filter = {
      exerciseId: new Types.ObjectId(input.exerciseId),
      personId: new Types.ObjectId(input.personId),
      trainingPlanId: new Types.ObjectId(input.trainingPlanId),
    };
    if (input.loadsKg.every((load) => load === null)) {
      const deletion = await this.model.deleteOne(filter).exec();
      this.logger.log(
        'MongoTrainingLoadProfileRepository -> save -> delete return:',
        { data: { deleted: deletion.deletedCount > 0 } },
      );
    } else {
      const document = await this.model
        .findOneAndUpdate(
          filter,
          {
            $set: {
              lastSessionId: input.sessionId,
              loadsKg: input.loadsKg,
              workoutId: new Types.ObjectId(input.workoutId),
            },
          },
          { returnDocument: 'after', runValidators: true, upsert: true },
        )
        .select({ _id: 1 })
        .lean<{ _id: Types.ObjectId }>()
        .exec();
      this.logger.log(
        'MongoTrainingLoadProfileRepository -> save -> upsert return:',
        { data: { saved: document !== null } },
      );
    }
    this.logger.log(
      'MongoTrainingLoadProfileRepository -> save -> completed:',
      {
        data: { exerciseId: input.exerciseId },
      },
    );
  }

  async deleteForExercise(
    trainingPlanId: string,
    exerciseId: string,
  ): Promise<void> {
    await this.deleteMany('deleteForExercise', {
      exerciseId: new Types.ObjectId(exerciseId),
      trainingPlanId: new Types.ObjectId(trainingPlanId),
    });
  }

  async deleteForWorkout(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<void> {
    await this.deleteMany('deleteForWorkout', {
      trainingPlanId: new Types.ObjectId(trainingPlanId),
      workoutId: new Types.ObjectId(workoutId),
    });
  }

  async deleteForPlan(trainingPlanId: string): Promise<void> {
    await this.deleteMany('deleteForPlan', {
      trainingPlanId: new Types.ObjectId(trainingPlanId),
    });
  }

  private async deleteMany(method: string, filter: object): Promise<void> {
    this.logger.log(
      `MongoTrainingLoadProfileRepository -> ${method} -> params:`,
      {
        params: { scoped: true },
      },
    );
    const deletion = await this.model.deleteMany(filter).exec();
    this.logger.log(
      `MongoTrainingLoadProfileRepository -> ${method} -> return:`,
      {
        data: { deletedCount: deletion.deletedCount },
      },
    );
  }
}
