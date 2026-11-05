import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';

import {
  TERMS_ACCEPTANCE_MODEL,
  TERMS_MODEL,
  type StoredAcceptance,
  type StoredTerms,
} from '~/terms/repositories/terms.schema';
import { TermsContentService } from '~/terms/services/terms-content.service';

export const termsFixtureFields = {
  title: 'Termos de teste',
  bodyHtml:
    '<h3>2. Cuidados</h3><p>Respeite seus limites e procure orientação profissional.</p>',
  operatorName: 'Responsável Exemplo',
  operatorEmail: 'responsavel@example.test',
  changeSummary: 'Condições iniciais de teste.',
};
export const termsFixtureId = '109000000000000000000001';
export async function resetTermsFixture(app: INestApplication): Promise<void> {
  await app
    .get<Model<StoredAcceptance>>(getModelToken(TERMS_ACCEPTANCE_MODEL))
    .deleteMany({});
  await app.get<Model<StoredTerms>>(getModelToken(TERMS_MODEL)).deleteMany({});
}
export async function seedAcceptedTerms(
  app: INestApplication,
  personId: string,
): Promise<void> {
  const docs = app.get<Model<StoredTerms>>(getModelToken(TERMS_MODEL));
  const acceptances = app.get<Model<StoredAcceptance>>(
    getModelToken(TERMS_ACCEPTANCE_MODEL),
  );
  const prepared = app.get(TermsContentService).prepare(termsFixtureFields);
  await docs.updateOne(
    { _id: new Types.ObjectId(termsFixtureId) },
    {
      $setOnInsert: {
        ...prepared,
        state: 'published',
        version: 1,
        publicationNumber: 1,
        createdByPersonId: personId,
        publishedByPersonId: personId,
        createdAt: '2026-08-01T12:00:00.000Z',
        updatedAt: '2026-08-01T12:00:00.000Z',
        publishedAt: '2026-08-01T12:00:00.000Z',
      },
    },
    { upsert: true },
  );
  await acceptances.updateOne(
    { personId, termsVersionId: termsFixtureId },
    {
      $setOnInsert: {
        publicationNumber: 1,
        contentHash: prepared.contentHash,
        acceptedAt: '2026-08-01T13:00:00.000Z',
        channel: 'web',
        accepted: true,
        isAdult: true,
      },
    },
    { upsert: true },
  );
}
