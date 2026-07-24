import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({
  collection: 'people',
  timestamps: true,
  versionKey: false,
})
export class PersonDocument {
  @Prop({ index: true, required: true, unique: true })
  googleSubject!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ default: null, type: String })
  photoUrl!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PersonHydratedDocument = HydratedDocument<PersonDocument>;
export const PersonSchema = SchemaFactory.createForClass(PersonDocument);
