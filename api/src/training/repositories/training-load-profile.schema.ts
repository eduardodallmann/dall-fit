import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

@Schema({
  collection: 'person_exercise_load_profiles',
  timestamps: true,
  versionKey: false,
})
export class TrainingLoadProfileDocument {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  personId!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  trainingPlanId!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  workoutId!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  exerciseId!: Types.ObjectId;

  @Prop({ default: [], required: true, type: [MongooseSchema.Types.Mixed] })
  loadsKg!: readonly (number | null)[];

  @Prop({ maxlength: 80, required: true, type: String })
  lastSessionId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TrainingLoadProfileSchema = SchemaFactory.createForClass(
  TrainingLoadProfileDocument,
);
TrainingLoadProfileSchema.index(
  { personId: 1, trainingPlanId: 1, exerciseId: 1 },
  { unique: true },
);
TrainingLoadProfileSchema.index({ trainingPlanId: 1, workoutId: 1 });
TrainingLoadProfileSchema.index({ trainingPlanId: 1, exerciseId: 1 });
