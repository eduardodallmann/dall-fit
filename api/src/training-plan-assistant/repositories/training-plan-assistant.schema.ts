import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false, timestamps: false, versionKey: false })
class AssistantMessageDocument {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ enum: ['assistant', 'person'], required: true, type: String })
  role!: string;

  @Prop({ maxlength: 1200, required: true, type: String })
  text!: string;

  @Prop({ required: true, type: Date })
  createdAt!: Date;
}

const AssistantMessageSchema = SchemaFactory.createForClass(
  AssistantMessageDocument,
);

@Schema({
  collection: 'training_plan_assistant_sessions',
  timestamps: true,
  versionKey: false,
})
export class TrainingPlanAssistantSessionDocument {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  personId!: Types.ObjectId;

  @Prop({ default: true, required: true, type: Boolean })
  active!: boolean;

  @Prop({ required: true, type: String })
  status!: string;

  @Prop({ default: null, type: String })
  currentQuestionKey!: string | null;

  @Prop({ default: {}, type: MongooseSchema.Types.Mixed })
  answers!: Record<string, string>;

  @Prop({ default: {}, type: MongooseSchema.Types.Mixed })
  invalidAttempts!: Record<string, number>;

  @Prop({ default: null, type: String })
  screeningOutcome!: string | null;

  @Prop({ default: [], type: [AssistantMessageSchema] })
  messages!: AssistantMessageDocument[];

  @Prop({ default: {}, type: MongooseSchema.Types.Mixed })
  operationKeys!: Record<string, unknown>;

  @Prop({ required: true, type: String })
  promptVersion!: string;

  @Prop({ required: true, type: String })
  knowledgeVersion!: string;

  @Prop({ required: true, type: String })
  catalogVersion!: string;

  @Prop({ required: true, type: String })
  noticeVersion!: string;

  @Prop({ required: true, type: String })
  provider!: string;

  @Prop({ required: true, type: String })
  model!: string;

  @Prop({ default: null, type: MongooseSchema.Types.Mixed })
  generatedDraft!: unknown;

  @Prop({ default: null, type: MongooseSchema.Types.Mixed })
  materialization!: unknown;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  version!: number;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TrainingPlanAssistantSessionSchema = SchemaFactory.createForClass(
  TrainingPlanAssistantSessionDocument,
);
TrainingPlanAssistantSessionSchema.index(
  { personId: 1 },
  {
    name: 'training_plan_assistant_one_active_per_person',
    partialFilterExpression: { active: true },
    unique: true,
  },
);
TrainingPlanAssistantSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'training_plan_assistant_expiry' },
);

@Schema({
  collection: 'training_plan_assistant_confirmation_receipts',
  timestamps: true,
  versionKey: false,
})
export class TrainingPlanAssistantReceiptDocument {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  personId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  idempotencyHash!: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  catalogEntryId!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  trainingPlanId!: Types.ObjectId;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;
}

export const TrainingPlanAssistantReceiptSchema = SchemaFactory.createForClass(
  TrainingPlanAssistantReceiptDocument,
);
TrainingPlanAssistantReceiptSchema.index(
  { personId: 1, idempotencyHash: 1 },
  { name: 'training_plan_assistant_receipt_unique', unique: true },
);
TrainingPlanAssistantReceiptSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'training_plan_assistant_receipt_expiry' },
);
