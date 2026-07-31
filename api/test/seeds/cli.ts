import 'dotenv/config';

import { connect, disconnect, model } from 'mongoose';

import {
  PersonDocument,
  PersonSchema,
} from '~/person/repositories/person.schema';

async function main(): Promise<void> {
  const scenario = process.argv.slice(2).find((argument) => argument !== '--');
  const environment = process.env.NODE_ENV ?? 'development';
  const mongodbUri =
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/dall-fit';

  if (!['development', 'test'].includes(environment)) {
    throw new Error('Seeds are available only in development and test.');
  }

  const parsedMongoUrl = new URL(mongodbUri);
  if (!['127.0.0.1', 'localhost'].includes(parsedMongoUrl.hostname)) {
    throw new Error('Seeds require an explicitly local MongoDB host.');
  }

  if (
    !['auth:person-admin', 'auth:person-existing', 'auth:person-new'].includes(
      scenario ?? '',
    )
  ) {
    throw new Error(
      'Unknown seed. Use auth:person-admin, auth:person-new or auth:person-existing.',
    );
  }

  await connect(mongodbUri);

  try {
    const personModel = model(PersonDocument.name, PersonSchema);

    if (scenario === 'auth:person-new') {
      await personModel.deleteMany({ googleSubject: 'google-new-001' }).exec();
    } else if (scenario === 'auth:person-admin') {
      await personModel
        .findOneAndUpdate(
          { googleSubject: 'google-admin-001' },
          {
            $set: {
              email: 'admin.runner@example.test',
              isAdmin: true,
              name: 'Admin Runner',
              photoUrl: 'https://example.test/admin-avatar.png',
            },
          },
          { new: true, setDefaultsOnInsert: true, upsert: true },
        )
        .exec();
    } else {
      await personModel
        .findOneAndUpdate(
          { googleSubject: 'google-existing-001' },
          {
            $set: {
              email: 'taylor.fit@example.test',
              name: 'Taylor Fit',
              photoUrl: 'https://example.test/avatar.png',
            },
            $unset: { isAdmin: 1 },
          },
          { new: true, setDefaultsOnInsert: true, upsert: true },
        )
        .exec();
    }

    process.stdout.write(`Seed ${scenario} prepared.\n`);
  } finally {
    await disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Seed failed.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
