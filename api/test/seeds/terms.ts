import { writeFile } from 'node:fs/promises';

import { model, Types, type Model } from 'mongoose';

import type { PersonDocument } from '~/person/repositories/person.schema';
import {
  TERMS_ACCEPTANCE_MODEL,
  TERMS_MODEL,
  TermsAcceptanceSchema,
  TermsSchema,
} from '~/terms/repositories/terms.schema';
import { TermsContentService } from '~/terms/services/terms-content.service';

export const termsSeeds = [
  'terms:not-configured',
  'terms:required',
  'terms:accepted',
  'terms:admin',
  'terms:draft',
  'terms:updated',
] as const;
const personId = '109000000000000000000010';
const documentIds = [
  '109000000000000000000001',
  '109000000000000000000002',
  '109000000000000000000003',
];
export const syntheticTermsFields = {
  title: 'Termos de uso de exemplo',
  bodyHtml:
    '<h3>2. Cuidados</h3><p>Respeite seus limites e procure orientação profissional.</p>',
  operatorName: 'Responsável Exemplo',
  operatorEmail: 'responsavel@example.test',
  changeSummary: 'Condições de teste local.',
};
export function termsSeedModels() {
  return {
    docs: model(TERMS_MODEL, TermsSchema),
    receipts: model(TERMS_ACCEPTANCE_MODEL, TermsAcceptanceSchema),
  };
}
export async function seedTermsScenario(
  people: Model<PersonDocument>,
  scenario: string,
  session: (
    personId: string,
    channel: 'native' | 'web',
    outputFile: string,
  ) => Promise<void>,
): Promise<void> {
  const { docs, receipts } = termsSeedModels();
  await Promise.all([docs.init(), receipts.init()]);
  if (
    await docs.exists({
      state: 'published',
      _id: { $nin: documentIds.map((id) => new Types.ObjectId(id)) },
    })
  ) {
    throw new Error(
      'Terms scenarios require a local database without publications outside this fixture. No foreign document was changed.',
    );
  }
  await receipts.deleteMany({ termsVersionId: { $in: documentIds } });
  await docs.deleteMany({
    _id: { $in: documentIds.map((id) => new Types.ObjectId(id)) },
  });
  const admin =
    scenario === 'terms:admin' ||
    scenario === 'terms:draft' ||
    scenario === 'terms:not-configured';
  await people.updateOne(
    { _id: new Types.ObjectId(personId) },
    {
      $set: {
        googleSubject: 'terms-fixture-person',
        email: 'terms.runner@example.test',
        name: 'Terms Runner',
        photoUrl: null,
        ...(admin ? { isAdmin: true } : {}),
      },
      ...(!admin ? { $unset: { isAdmin: 1 } } : {}),
    },
    { upsert: true },
  );
  const prepared = new TermsContentService().prepare(syntheticTermsFields);
  const timestamp = '2026-08-01T12:00:00.000Z';
  if (scenario !== 'terms:not-configured') {
    await docs.create({
      _id: new Types.ObjectId(documentIds[0]),
      ...prepared,
      state: 'published',
      version: 1,
      publicationNumber: 1,
      createdByPersonId: personId,
      publishedByPersonId: personId,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: timestamp,
    });
  }
  if (
    ['terms:accepted', 'terms:admin', 'terms:draft', 'terms:updated'].includes(
      scenario,
    )
  ) {
    await receipts.create({
      personId,
      termsVersionId: documentIds[0],
      publicationNumber: 1,
      contentHash: prepared.contentHash,
      acceptedAt: timestamp,
      channel: 'native',
      accepted: true,
      isAdult: true,
    });
  }
  if (scenario === 'terms:updated') {
    await docs.create({
      _id: new Types.ObjectId(documentIds[1]),
      ...prepared,
      state: 'published',
      version: 1,
      publicationNumber: 2,
      createdByPersonId: personId,
      publishedByPersonId: personId,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: timestamp,
    });
  }
  if (scenario === 'terms:draft') {
    await docs.create({
      _id: new Types.ObjectId(documentIds[2]),
      ...prepared,
      state: 'draft',
      version: 0,
      createdByPersonId: personId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  await session(personId, 'native', '/tmp/dall-fit-terms-token.txt');
  await session(personId, 'web', '/tmp/dall-fit-terms-cookie.txt');
  const files = {
    '/tmp/dall-fit-terms-fields.json': syntheticTermsFields,
    '/tmp/dall-fit-terms-acceptance.json': {
      termsVersionId: documentIds[0],
      contentHash: prepared.contentHash,
      accepted: true,
      isAdult: true,
    },
    '/tmp/dall-fit-terms-publication.json': {
      expectedCurrentTermsId: documentIds[0],
      previewContentHash: prepared.contentHash,
    },
  };
  for (const [path, value] of Object.entries(files))
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
}

export async function seedBusinessTerms(
  people: Model<PersonDocument>,
): Promise<void> {
  const { docs, receipts } = termsSeedModels();
  let current = await docs
    .findOne({ state: 'published' })
    .sort({ publicationNumber: -1 })
    .lean();
  if (current === null) {
    const prepared = new TermsContentService().prepare(syntheticTermsFields);
    current = await docs.create({
      _id: new Types.ObjectId(documentIds[0]),
      ...prepared,
      state: 'published',
      version: 1,
      publicationNumber: 1,
      createdByPersonId: personId,
      publishedByPersonId: personId,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });
  }
  // Only the explicitly synthetic people owned by local scenarios receive fixture receipts.
  const fixtures = await people
    .find({ email: /@example\.test$/ })
    .select('_id')
    .lean();
  for (const person of fixtures) {
    await receipts.updateOne(
      {
        personId: person._id.toString(),
        termsVersionId: current._id.toString(),
      },
      {
        $setOnInsert: {
          publicationNumber: current.publicationNumber,
          contentHash: current.contentHash,
          acceptedAt: '2026-08-01T12:00:00.000Z',
          channel: 'native',
          accepted: true,
          isAdult: true,
        },
      },
      { upsert: true },
    );
  }
}
