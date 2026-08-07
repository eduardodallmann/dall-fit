import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: true, versionKey: false })
export class TrainingPlanWorkoutDocument {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ default: [], type: [MongooseSchema.Types.Mixed] })
  exercises!: readonly unknown[];
}

export const TrainingPlanWorkoutSchema = SchemaFactory.createForClass(
  TrainingPlanWorkoutDocument,
);

@Schema({
  collection: 'training_plans',
  timestamps: true,
  versionKey: false,
})
export class TrainingPlanDocument {
  @Prop({ default: null, type: MongooseSchema.Types.ObjectId })
  ownerPersonId!: Types.ObjectId | null;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ default: [], type: [TrainingPlanWorkoutSchema] })
  workouts!: readonly TrainingPlanWorkoutDocument[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type TrainingPlanHydratedDocument =
  HydratedDocument<TrainingPlanDocument>;
export const TrainingPlanSchema =
  SchemaFactory.createForClass(TrainingPlanDocument);

TrainingPlanSchema.index({ ownerPersonId: 1, createdAt: -1 });
