import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

@Schema({
  collection: 'offline_training_terminal_receipts',
  timestamps: true,
  versionKey: false,
})
export class OfflineTrainingTerminalReceiptDocument {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  personId!: Types.ObjectId;

  @Prop({ maxlength: 80, required: true, type: String })
  executionId!: string;

  @Prop({ enum: ['cancelled', 'completed'], required: true, type: String })
  terminalState!: 'cancelled' | 'completed';

  @Prop({ min: 0, required: true, type: Number })
  revision!: number;

  @Prop({ maxlength: 64, minlength: 64, required: true, type: String })
  contentHash!: string;

  @Prop({ required: true, type: Date })
  acceptedAt!: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  workoutExecutionId?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OfflineTrainingTerminalReceiptSchema =
  SchemaFactory.createForClass(OfflineTrainingTerminalReceiptDocument);
OfflineTrainingTerminalReceiptSchema.index(
  { personId: 1, executionId: 1 },
  { unique: true },
);
