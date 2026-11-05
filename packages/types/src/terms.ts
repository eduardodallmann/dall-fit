import type { CollectionResponse } from './contracts.js';

export interface TermsFields {
  title: string;
  bodyHtml: string;
  operatorName: string;
  operatorEmail: string;
  changeSummary: string;
}

export interface TermsReference {
  id: string;
  publicationNumber: number;
  contentHash: string;
}

export interface TermsPublication extends TermsReference {
  title: string;
  operatorName: string;
  operatorEmail: string;
  changeSummary: string;
  contentHtml: string;
  publishedAt: string;
}

export interface TermsAcceptance {
  id: string;
  termsVersionId: string;
  publicationNumber: number;
  contentHash: string;
  acceptedAt: string;
  channel: 'web' | 'native';
  accepted: true;
  isAdult: true;
}

export type TermsAccess =
  | { state: 'not-configured'; current: null; acceptance: null }
  | { state: 'required'; current: TermsReference; acceptance: null }
  | { state: 'accepted'; current: TermsReference; acceptance: TermsAcceptance };

export interface TermsDocument extends TermsFields {
  id: string;
  state: 'draft' | 'published';
  version: number;
  createdAt: string;
  updatedAt: string;
  contentHtml: string;
  contentHash: string;
  wasSanitized: boolean;
  publicationNumber?: number;
  publishedAt?: string;
}

export type TermsSummary = Omit<TermsDocument, 'bodyHtml' | 'contentHtml'>;
export type CreateTermsRequest = TermsFields | { sourceVersionId: string };
export interface PublishTermsRequest {
  expectedCurrentTermsId: string | null;
  previewContentHash: string;
}
export interface AcceptTermsRequest {
  termsVersionId: string;
  contentHash: string;
  accepted: true;
  isAdult: true;
}
export interface CurrentTerms {
  publication: TermsPublication;
  access: TermsAccess;
}
export interface AcceptedTerms {
  acceptance: TermsAcceptance;
  access: TermsAccess;
}

export type TermsList = CollectionResponse<TermsSummary> & {
  initialDraft: TermsFields;
};
