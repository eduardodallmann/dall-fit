import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({
  collection: 'people',
  timestamps: true,
  versionKey: false,
})
export class PersonDocument {
  @Prop({ index: true, required: true, type: String, unique: true })
  googleSubject!: string;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  email!: string;

  @Prop({ default: null, type: String })
  photoUrl!: string | null;

  @Prop({ type: Boolean })
  isAdmin?: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PersonHydratedDocument = HydratedDocument<PersonDocument>;
export const PersonSchema = SchemaFactory.createForClass(PersonDocument);
