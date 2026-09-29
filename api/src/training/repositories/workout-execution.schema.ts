import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

import {
  BODY_AREAS,
  type BodyArea,
  type TrainingPlanSource,
} from '@dall-fit/types';

@Schema({
  collection: 'workout_executions',
  timestamps: true,
  versionKey: false,
})
export class WorkoutExecutionDocument {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  personId!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  catalogEntryId!: Types.ObjectId;

  @Prop({ maxlength: 80, required: true, type: String })
  sessionId!: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  trainingPlanId!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  workoutId!: Types.ObjectId;

  @Prop({ enum: ['global-reference', 'owned'], required: true, type: String })
  source!: TrainingPlanSource;

  @Prop({ maxlength: 120, required: true, type: String })
  planName!: string;

  @Prop({ maxlength: 120, required: true, type: String })
  workoutName!: string;

  @Prop({ enum: BODY_AREAS, required: true, type: [String] })
  bodyAreas!: readonly BodyArea[];

  @Prop({ required: true, type: Date })
  startedAt!: Date;

  @Prop({ required: true, type: Date })
  completedAt!: Date;

  @Prop({ min: 0, required: true, type: Number })
  durationSeconds!: number;

  @Prop({ maxlength: 100, required: true, type: String })
  timezone!: string;

  @Prop({ min: 0, required: true, type: Number })
  completedExerciseCount!: number;

  @Prop({ min: 0, required: true, type: Number })
  totalExerciseCount!: number;

  @Prop({ min: 0, required: true, type: Number })
  workoutCount!: number;

  @Prop({ required: true, type: Boolean })
  fullCompletion!: boolean;

  @Prop({ min: 0, required: true, type: Number })
  totalLoadKg!: number;

  @Prop({ enum: ['completed', 'finalizing'], required: true, type: String })
  status!: 'completed' | 'finalizing';

  createdAt!: Date;
  updatedAt!: Date;
}

export const WorkoutExecutionSchema = SchemaFactory.createForClass(
  WorkoutExecutionDocument,
);
WorkoutExecutionSchema.index({ personId: 1, sessionId: 1 }, { unique: true });
WorkoutExecutionSchema.index({
  personId: 1,
  trainingPlanId: 1,
  completedAt: -1,
});
WorkoutExecutionSchema.index({ personId: 1, completedAt: -1 });
WorkoutExecutionSchema.index({ status: 1, completedAt: -1 });
