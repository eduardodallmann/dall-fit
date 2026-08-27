import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';

import type {
  NewWorkoutExecution,
  StoredWorkoutExecution,
  WorkoutExecutionWeekData,
} from '~/training/domain/training.types';
import { WorkoutExecutionRepository } from '~/training/repositories/workout-execution.repository';
import { WorkoutExecutionDocument } from '~/training/repositories/workout-execution.schema';

interface PlainWorkoutExecution extends Omit<
  NewWorkoutExecution,
  'catalogEntryId' | 'personId' | 'trainingPlanId' | 'workoutId'
> {
  _id: Types.ObjectId;
  catalogEntryId: Types.ObjectId;
  createdAt: Date;
  personId: Types.ObjectId;
  status: 'completed' | 'finalizing';
  trainingPlanId: Types.ObjectId;
  updatedAt: Date;
  workoutId: Types.ObjectId;
}

@Injectable()
export class MongoWorkoutExecutionRepository extends WorkoutExecutionRepository {
  private readonly logger = new Logger(MongoWorkoutExecutionRepository.name);

  constructor(
    @InjectModel(WorkoutExecutionDocument.name)
    private readonly model: Model<WorkoutExecutionDocument>,
  ) {
    super();
  }

  async begin(input: NewWorkoutExecution): Promise<StoredWorkoutExecution> {
    this.logger.log('MongoWorkoutExecutionRepository -> begin -> params:', {
      params: { personId: input.personId, sessionId: input.sessionId },
    });
    const insert = {
      ...input,
      catalogEntryId: new Types.ObjectId(input.catalogEntryId),
      personId: new Types.ObjectId(input.personId),
      status: 'finalizing' as const,
      trainingPlanId: new Types.ObjectId(input.trainingPlanId),
      workoutId: new Types.ObjectId(input.workoutId),
    };
    const document = await this.model
      .findOneAndUpdate(
        { personId: insert.personId, sessionId: input.sessionId },
        { $setOnInsert: insert },
        { returnDocument: 'after', runValidators: true, upsert: true },
      )
      .lean<PlainWorkoutExecution>()
      .exec();
    if (document === null) throw new Error('Workout execution upsert failed.');
    this.logger.log(
      'MongoWorkoutExecutionRepository -> begin -> mongoose return:',
      {
        data: { executionId: document._id.toString(), status: document.status },
      },
    );
    const result = this.map(document);
    this.logger.log('MongoWorkoutExecutionRepository -> begin -> return:', {
      data: { executionId: result.id, status: result.status },
    });
    return result;
  }

  async complete(
    personId: string,
    sessionId: string,
  ): Promise<StoredWorkoutExecution> {
    this.logger.log('MongoWorkoutExecutionRepository -> complete -> params:', {
      params: { personId, sessionId },
    });
    const document = await this.model
      .findOneAndUpdate(
        { personId: new Types.ObjectId(personId), sessionId },
        { $set: { status: 'completed' } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean<PlainWorkoutExecution>()
      .exec();
    if (document === null)
      throw new Error('Workout execution was not started.');
    const result = this.map(document);
    this.logger.log('MongoWorkoutExecutionRepository -> complete -> return:', {
      data: { executionId: result.id, status: result.status },
    });
    return result;
  }

  async findById(
    personId: string,
    executionId: string,
  ): Promise<StoredWorkoutExecution | null> {
    this.logger.log('MongoWorkoutExecutionRepository -> findById -> params:', {
      params: { executionId, personId },
    });
    const document = await this.model
      .findOne({
        _id: new Types.ObjectId(executionId),
        personId: new Types.ObjectId(personId),
        status: 'completed',
      })
      .lean<PlainWorkoutExecution>()
      .exec();
    const result = document === null ? null : this.map(document);
    this.logger.log('MongoWorkoutExecutionRepository -> findById -> return:', {
      data: { executionId, found: result !== null },
    });
    return result;
  }

  async findBySession(
    personId: string,
    sessionId: string,
  ): Promise<StoredWorkoutExecution | null> {
    this.logger.log(
      'MongoWorkoutExecutionRepository -> findBySession -> params:',
      { params: { personId, sessionId } },
    );
    const document = await this.model
      .findOne({ personId: new Types.ObjectId(personId), sessionId })
      .lean<PlainWorkoutExecution>()
      .exec();
    const result = document === null ? null : this.map(document);
    this.logger.log(
      'MongoWorkoutExecutionRepository -> findBySession -> return:',
      { data: { found: result !== null, sessionId } },
    );
    return result;
  }

  async findLastForPlan(
    personId: string,
    trainingPlanId: string,
  ): Promise<StoredWorkoutExecution | null> {
    this.logger.log(
      'MongoWorkoutExecutionRepository -> findLastForPlan -> params:',
      { params: { personId, trainingPlanId } },
    );
    const document = await this.model
      .findOne({
        personId: new Types.ObjectId(personId),
        status: 'completed',
        trainingPlanId: new Types.ObjectId(trainingPlanId),
      })
      .sort({ completedAt: -1, _id: -1 })
      .lean<PlainWorkoutExecution>()
      .exec();
    const result = document === null ? null : this.map(document);
    this.logger.log(
      'MongoWorkoutExecutionRepository -> findLastForPlan -> return:',
      { data: { found: result !== null, trainingPlanId } },
    );
    return result;
  }

  async listCompletedBetween(
    personId: string,
    start: Date,
    end: Date,
  ): Promise<readonly WorkoutExecutionWeekData[]> {
    this.logger.log(
      'MongoWorkoutExecutionRepository -> listCompletedBetween -> params:',
      { params: { personId, rangeDays: 7 } },
    );
    const documents = await this.model
      .find({
        completedAt: { $gte: start, $lt: end },
        personId: new Types.ObjectId(personId),
        status: 'completed',
      })
      .select({ completedAt: 1 })
      .sort({ completedAt: 1 })
      .lean<Array<{ completedAt: Date }>>()
      .exec();
    const result = documents.map((document) => ({
      completedAt: document.completedAt,
    }));
    this.logger.log(
      'MongoWorkoutExecutionRepository -> listCompletedBetween -> return:',
      { data: { count: result.length } },
    );
    return result;
  }

  private map(document: PlainWorkoutExecution): StoredWorkoutExecution {
    const result = {
      ...document,
      catalogEntryId: document.catalogEntryId.toString(),
      id: document._id.toString(),
      personId: document.personId.toString(),
      trainingPlanId: document.trainingPlanId.toString(),
      workoutId: document.workoutId.toString(),
    };
    return result;
  }
}
