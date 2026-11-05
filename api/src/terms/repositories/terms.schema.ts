import { Schema, type Types } from 'mongoose';

import type { TermsAcceptance, TermsDocument } from '@dall-fit/types';

export const TERMS_MODEL = 'TermsDocument';
export const TERMS_ACCEPTANCE_MODEL = 'TermsAcceptanceDocument';
export type StoredTerms = Omit<TermsDocument, 'id'> & {
  _id: Types.ObjectId;
  createdByPersonId: string;
  publishedByPersonId?: string;
};
export type StoredAcceptance = Omit<TermsAcceptance, 'id'> & {
  _id: Types.ObjectId;
  personId: string;
};

export const TermsSchema = new Schema<StoredTerms>(
  {
    title: { type: String, required: true },
    bodyHtml: { type: String, required: true },
    operatorName: { type: String, required: true },
    operatorEmail: { type: String, required: true },
    changeSummary: { type: String, required: true },
    contentHtml: { type: String, required: true },
    contentHash: { type: String, required: true },
    wasSanitized: { type: Boolean, required: true },
    state: { type: String, enum: ['draft', 'published'], required: true },
    version: { type: Number, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    createdByPersonId: { type: String, required: true },
    publishedByPersonId: String,
    publishedAt: String,
    publicationNumber: Number,
  },
  { collection: 'terms_versions', versionKey: false, strict: 'throw' },
);
TermsSchema.index(
  { publicationNumber: -1 },
  { unique: true, partialFilterExpression: { state: 'published' } },
);
TermsSchema.index({ createdAt: -1, _id: -1 });

export const TermsAcceptanceSchema = new Schema<StoredAcceptance>(
  {
    personId: { type: String, required: true },
    termsVersionId: { type: String, required: true },
    publicationNumber: { type: Number, required: true },
    contentHash: { type: String, required: true },
    acceptedAt: { type: String, required: true },
    channel: { type: String, enum: ['web', 'native'], required: true },
    accepted: {
      type: Boolean,
      required: true,
      validate: (value: boolean) => value === true,
    },
    isAdult: {
      type: Boolean,
      required: true,
      validate: (value: boolean) => value === true,
    },
  },
  { collection: 'terms_acceptances', versionKey: false, strict: 'throw' },
);
TermsAcceptanceSchema.index(
  { personId: 1, termsVersionId: 1 },
  { unique: true },
);
TermsAcceptanceSchema.index({ personId: 1, acceptedAt: -1, _id: -1 });
