import 'dotenv/config';

import { connect, disconnect, model, Types } from 'mongoose';

import {
  PersonDocument,
  PersonSchema,
} from '~/person/repositories/person.schema';
import initialTerms from '~/terms/domain/initial-terms.json';
import { TERMS_MODEL, TermsSchema } from '~/terms/repositories/terms.schema';
import { TermsContentService } from '~/terms/services/terms-content.service';

const initialDraftId = '109000000000000000000000';
async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  const personId = process.argv
    .find((value) => value.startsWith('--person-id='))
    ?.slice('--person-id='.length);
  if (
    uri === undefined ||
    personId === undefined ||
    !/^[a-f\d]{24}$/i.test(personId)
  )
    throw new Error(
      'MONGODB_URI and --person-id=<admin ObjectId> are required.',
    );
  const execute = process.argv.includes('--execute');
  if (
    execute &&
    process.env.TERMS_OPERATION_CONFIRMATION !== 'prepare-initial-terms-v1'
  )
    throw new Error(
      'Execution requires TERMS_OPERATION_CONFIRMATION=prepare-initial-terms-v1.',
    );
  await connect(uri, { autoIndex: false });
  try {
    const people = model(PersonDocument.name, PersonSchema);
    if (
      !(await people.exists({
        _id: new Types.ObjectId(personId),
        isAdmin: true,
      }))
    )
      throw new Error('An existing administrator is required.');
    const docs = model(TERMS_MODEL, TermsSchema);
    const existing = await docs.findById(initialDraftId).select('state').lean();
    if (existing !== null) {
      process.stdout.write(
        `Initial document ${initialDraftId} already exists (${existing.state}); preserved.\n`,
      );
      return;
    }
    if (await docs.exists({ state: 'published' }))
      throw new Error(
        'A publication already exists. Create the next draft in the administrative application.',
      );
    const prepared = new TermsContentService().prepare(initialTerms);
    if (!execute) {
      process.stdout.write(
        'Dry-run: the initial draft is valid; no document was written.\n',
      );
      return;
    }
    const timestamp = new Date().toISOString();
    await docs.updateOne(
      { _id: new Types.ObjectId(initialDraftId) },
      {
        $setOnInsert: {
          ...prepared,
          state: 'draft',
          version: 0,
          createdByPersonId: personId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
      { upsert: true },
    );
    process.stdout.write(
      `Initial draft ${initialDraftId} prepared. Review and publish in /admin/terms.\n`,
    );
  } finally {
    await disconnect();
  }
}
void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Initial draft preparation failed.'}\n`,
  );
  process.exitCode = 1;
});
