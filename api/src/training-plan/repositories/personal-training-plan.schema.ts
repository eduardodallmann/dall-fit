import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const PERSONAL_CATALOG_KINDS = ['owned', 'global-reference'] as const;
export type PersonalCatalogKind = (typeof PERSONAL_CATALOG_KINDS)[number];

export const CLONE_JOB_STATES = [
  'start-failed',
  'queued',
  'running',
  'materializing',
  'cancelling',
  'failed',
  'completed',
  'cancelled',
] as const;
export type CloneJobState = (typeof CLONE_JOB_STATES)[number];

@Schema({
  collection: 'training_plan_catalog_entries',
  timestamps: true,
  versionKey: false,
})
export class PersonalTrainingPlanCatalogDocument {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  personId!: Types.ObjectId;

  @Prop({ enum: PERSONAL_CATALOG_KINDS, required: true, type: String })
  kind!: PersonalCatalogKind;

  @Prop({ default: null, type: MongooseSchema.Types.ObjectId })
  trainingPlanId!: Types.ObjectId | null;

  @Prop({ default: null, type: MongooseSchema.Types.ObjectId })
  globalTrainingPlanId!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PersonalTrainingPlanCatalogHydratedDocument =
  HydratedDocument<PersonalTrainingPlanCatalogDocument>;
export const PersonalTrainingPlanCatalogSchema = SchemaFactory.createForClass(
  PersonalTrainingPlanCatalogDocument,
);
PersonalTrainingPlanCatalogSchema.index(
  { personId: 1, trainingPlanId: 1 },
  {
    partialFilterExpression: { kind: 'owned' },
    unique: true,
  },
);
PersonalTrainingPlanCatalogSchema.index(
  { globalTrainingPlanId: 1, personId: 1 },
  {
    partialFilterExpression: { kind: 'global-reference' },
    unique: true,
  },
);
PersonalTrainingPlanCatalogSchema.index({
  personId: 1,
  createdAt: -1,
  _id: -1,
});
PersonalTrainingPlanCatalogSchema.index({
  kind: 1,
  globalTrainingPlanId: 1,
  personId: 1,
});

@Schema({
  collection: 'training_plan_active_selections',
  timestamps: true,
  versionKey: false,
})
export class PersonalTrainingPlanActiveDocument {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, unique: true })
  personId!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  catalogEntryId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PersonalTrainingPlanActiveSchema = SchemaFactory.createForClass(
  PersonalTrainingPlanActiveDocument,
);
PersonalTrainingPlanActiveSchema.index({ catalogEntryId: 1 });

@Schema({
  collection: 'training_plan_clone_jobs',
  timestamps: true,
  versionKey: false,
})
export class TrainingPlanCloneJobDocument {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  personId!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  globalTrainingPlanId!: Types.ObjectId;

  @Prop({ default: null, maxlength: 64, type: String })
  deduplicationKey!: string | null;

  @Prop({ maxlength: 120, required: true, type: String })
  sourceName!: string;

  @Prop({ required: true, type: MongooseSchema.Types.Mixed })
  snapshot!: Record<string, unknown>;

  @Prop({ default: 1, min: 1, required: true, type: Number })
  generation!: number;

  @Prop({ enum: CLONE_JOB_STATES, required: true, type: String })
  state!: CloneJobState;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  completedImages!: number;

  @Prop({ default: null, min: 0, type: Number })
  totalImages!: number | null;

  @Prop({ default: null, type: Date })
  cancelRequestedAt!: Date | null;

  @Prop({ default: null, maxlength: 80, type: String })
  failureCategory!: string | null;

  @Prop({ default: null, maxlength: 160, type: String })
  workflowRunId!: string | null;

  @Prop({ default: null, type: Date })
  startLeaseExpiresAt!: Date | null;

  @Prop({ default: null, type: MongooseSchema.Types.ObjectId })
  materializedTrainingPlanId!: Types.ObjectId | null;

  @Prop({ default: null, type: MongooseSchema.Types.ObjectId })
  materializedCatalogEntryId!: Types.ObjectId | null;

  @Prop({ default: [], type: [MongooseSchema.Types.Mixed] })
  copiedImages!: readonly Record<string, unknown>[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type TrainingPlanCloneJobHydratedDocument =
  HydratedDocument<TrainingPlanCloneJobDocument>;
export const TrainingPlanCloneJobSchema = SchemaFactory.createForClass(
  TrainingPlanCloneJobDocument,
);
TrainingPlanCloneJobSchema.index({ personId: 1, createdAt: -1, _id: -1 });
TrainingPlanCloneJobSchema.index(
  { deduplicationKey: 1 },
  {
    partialFilterExpression: { deduplicationKey: { $type: 'string' } },
    unique: true,
  },
);
TrainingPlanCloneJobSchema.index({ globalTrainingPlanId: 1, state: 1 });
TrainingPlanCloneJobSchema.index({
  personId: 1,
  globalTrainingPlanId: 1,
  state: 1,
});
