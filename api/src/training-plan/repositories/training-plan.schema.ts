import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

import { BODY_AREAS } from '@dall-fit/types';

const imageVariantSchema = new MongooseSchema(
  {
    etag: { maxlength: 256, required: false, type: String },
    key: { maxlength: 512, required: true, type: String },
    width: { min: 1, required: true, type: Number },
    height: { min: 1, required: true, type: Number },
  },
  { _id: false, versionKey: false },
);

const exerciseImageSchema = new MongooseSchema(
  {
    thumbnail: { required: true, type: imageVariantSchema },
    display: { required: true, type: imageVariantSchema },
  },
  { _id: false, versionKey: false },
);

const exerciseBaseSchema = new MongooseSchema(
  {},
  {
    _id: true,
    discriminatorKey: 'type',
    strict: 'throw',
    versionKey: false,
  },
);

const namedFields = {
  name: {
    maxlength: 40,
    minlength: 1,
    required: true,
    trim: true,
    type: String,
  },
  bodyArea: { enum: BODY_AREAS, required: true, type: String },
};

const setsFields = {
  ...namedFields,
  restSeconds: { max: 3600, min: 0, required: true, type: Number },
  sets: { max: 100, min: 1, required: true, type: Number },
  repetitions: { max: 1000, min: 1, required: true, type: Number },
};

@Schema({ _id: true, timestamps: true, versionKey: false })
export class TrainingPlanWorkoutDocument {
  _id!: Types.ObjectId;

  @Prop({
    maxlength: 120,
    minlength: 1,
    required: true,
    trim: true,
    type: String,
  })
  name!: string;

  @Prop({ default: [], type: [exerciseBaseSchema] })
  exercises!: readonly unknown[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const TrainingPlanWorkoutSchema = SchemaFactory.createForClass(
  TrainingPlanWorkoutDocument,
);

const exercisePath = TrainingPlanWorkoutSchema.path('exercises');
if (exercisePath instanceof MongooseSchema.Types.DocumentArray) {
  exercisePath.discriminator(
    'youtube-short',
    new MongooseSchema(
      {
        ...setsFields,
        youtubeId: {
          match: /^[A-Za-z0-9_-]{11}$/,
          required: true,
          type: String,
        },
      },
      { _id: true, versionKey: false },
    ),
  );
  exercisePath.discriminator(
    'image',
    new MongooseSchema(
      { ...setsFields, image: { default: null, type: exerciseImageSchema } },
      { _id: true, versionKey: false },
    ),
  );
  exercisePath.discriminator(
    'youtube-long',
    new MongooseSchema(
      {
        ...namedFields,
        youtubeId: {
          match: /^[A-Za-z0-9_-]{11}$/,
          required: true,
          type: String,
        },
      },
      { _id: true, versionKey: false },
    ),
  );
  exercisePath.discriminator(
    'pause',
    new MongooseSchema(
      { restSeconds: { max: 3600, min: 1, required: true, type: Number } },
      { _id: true, versionKey: false },
    ),
  );
  exercisePath.discriminator(
    'duration',
    new MongooseSchema(
      {
        ...namedFields,
        durationMinutes: { max: 1440, min: 1, required: true, type: Number },
      },
      { _id: true, versionKey: false },
    ),
  );
}

@Schema({
  collection: 'training_plans',
  timestamps: true,
  versionKey: 'version',
})
export class TrainingPlanDocument {
  @Prop({ default: null, type: MongooseSchema.Types.ObjectId })
  ownerPersonId!: Types.ObjectId | null;

  @Prop({
    maxlength: 120,
    minlength: 1,
    required: true,
    trim: true,
    type: String,
  })
  name!: string;

  @Prop({
    maxlength: 1000,
    minlength: 1,
    required: true,
    trim: true,
    type: String,
  })
  description!: string;

  @Prop({ default: [], type: [TrainingPlanWorkoutSchema] })
  workouts!: readonly TrainingPlanWorkoutDocument[];

  version!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export type TrainingPlanHydratedDocument =
  HydratedDocument<TrainingPlanDocument>;
export const TrainingPlanSchema =
  SchemaFactory.createForClass(TrainingPlanDocument);

TrainingPlanSchema.index({ ownerPersonId: 1, createdAt: -1, _id: -1 });
