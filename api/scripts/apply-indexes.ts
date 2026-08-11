import 'dotenv/config';

import process from 'node:process';

import { connect, disconnect } from 'mongoose';

const confirmation = 'apply-dall-fit-indexes-v1';
const trainingPlanIndexName = 'ownerPersonId_1_createdAt_-1__id_-1';
const legacyTrainingPlanIndexName = 'ownerPersonId_1_createdAt_-1';
const peopleIndexName = 'googleSubject_1';

async function main(): Promise<void> {
  if (
    !process.argv.includes('--execute') ||
    process.env.INDEX_OPERATION_CONFIRMATION !== confirmation
  ) {
    throw new Error(
      `Index application requires --execute and INDEX_OPERATION_CONFIRMATION=${confirmation}.`,
    );
  }
  const mongodbUri = process.env.MONGODB_URI;
  if (mongodbUri === undefined) throw new Error('MONGODB_URI is required.');

  const connection = await connect(mongodbUri, { autoIndex: false });
  try {
    const database = connection.connection.db;
    if (database === undefined)
      throw new Error('MongoDB database is unavailable.');
    const trainingPlans = database.collection('training_plans');
    const people = database.collection('people');

    await people.createIndex(
      { googleSubject: 1 },
      { name: peopleIndexName, unique: true },
    );
    await trainingPlans.createIndex(
      { ownerPersonId: 1, createdAt: -1, _id: -1 },
      { name: trainingPlanIndexName },
    );

    const indexes = await trainingPlans.indexes();
    if (indexes.some((index) => index.name === legacyTrainingPlanIndexName)) {
      await trainingPlans.dropIndex(legacyTrainingPlanIndexName);
    }
    process.stdout.write('Index set v1 applied successfully.\n');
  } finally {
    await disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Index application failed.'}\n`,
  );
  process.exitCode = 1;
});
