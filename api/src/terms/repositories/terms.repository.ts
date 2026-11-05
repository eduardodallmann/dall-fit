import type {
  CollectionResponse,
  TermsAcceptance,
  TermsDocument,
  TermsReference,
  TermsSummary,
} from '@dall-fit/types';

export type PreparedTerms = Omit<
  TermsDocument,
  | 'id'
  | 'state'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
  | 'publicationNumber'
  | 'publishedAt'
>;
export abstract class TermsRepository {
  abstract currentReference(): Promise<TermsReference | null>;
  abstract find(id: string): Promise<TermsDocument | null>;
  abstract list(page: number): Promise<CollectionResponse<TermsSummary>>;
  abstract create(
    fields: PreparedTerms,
    personId: string,
  ): Promise<TermsDocument>;
  abstract update(
    id: string,
    version: number,
    fields: PreparedTerms,
  ): Promise<TermsDocument | null>;
  abstract publish(
    id: string,
    version: number,
    number: number,
    personId: string,
  ): Promise<TermsDocument | null>;
  abstract remove(id: string, version: number): Promise<boolean>;
  abstract receipt(
    personId: string,
    termsVersionId: string,
  ): Promise<TermsAcceptance | null>;
  abstract record(
    personId: string,
    receipt: Omit<TermsAcceptance, 'id'>,
  ): Promise<{ acceptance: TermsAcceptance; created: boolean }>;
  abstract receipts(
    personId: string,
    page: number,
  ): Promise<CollectionResponse<TermsAcceptance>>;
}
