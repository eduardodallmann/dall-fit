import 'dotenv/config';

import process from 'node:process';

import { connect, disconnect } from 'mongoose';

const confirmation = 'apply-dall-fit-indexes-v5';
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
    const workoutExecutions = database.collection('workout_executions');
    const loadProfiles = database.collection('person_exercise_load_profiles');
    const offlineTerminalReceipts = database.collection(
      'offline_training_terminal_receipts',
    );
    const catalog = database.collection('training_plan_catalog_entries');
    const activeSelections = database.collection(
      'training_plan_active_selections',
    );

    await people.createIndex(
      { googleSubject: 1 },
      { name: peopleIndexName, unique: true },
    );
    await people.createIndex({ createdAt: -1 }, { name: 'createdAt_-1' });
    await trainingPlans.createIndex(
      { ownerPersonId: 1, createdAt: -1, _id: -1 },
      { name: trainingPlanIndexName },
    );
    await workoutExecutions.createIndex(
      { personId: 1, sessionId: 1 },
      { name: 'personId_1_sessionId_1', unique: true },
    );
    await workoutExecutions.createIndex(
      { status: 1, completedAt: -1 },
      { name: 'status_1_completedAt_-1' },
    );
    await catalog.createIndex(
      { kind: 1, globalTrainingPlanId: 1, personId: 1 },
      { name: 'kind_1_globalTrainingPlanId_1_personId_1' },
    );
    await activeSelections.createIndex(
      { personId: 1 },
      { name: 'personId_1', unique: true },
    );
    await activeSelections.createIndex(
      { catalogEntryIds: 1 },
      { name: 'catalogEntryIds_1' },
    );
    await workoutExecutions.createIndex(
      { personId: 1, trainingPlanId: 1, completedAt: -1 },
      { name: 'personId_1_trainingPlanId_1_completedAt_-1' },
    );
    await workoutExecutions.createIndex(
      { personId: 1, completedAt: -1 },
      { name: 'personId_1_completedAt_-1' },
    );
    await loadProfiles.createIndex(
      { personId: 1, trainingPlanId: 1, exerciseId: 1 },
      {
        name: 'personId_1_trainingPlanId_1_exerciseId_1',
        unique: true,
      },
    );
    await offlineTerminalReceipts.createIndex(
      { personId: 1, executionId: 1 },
      { name: 'personId_1_executionId_1', unique: true },
    );
    await loadProfiles.createIndex(
      { trainingPlanId: 1, workoutId: 1 },
      { name: 'trainingPlanId_1_workoutId_1' },
    );
    await loadProfiles.createIndex(
      { trainingPlanId: 1, exerciseId: 1 },
      { name: 'trainingPlanId_1_exerciseId_1' },
    );

    const terms = database.collection('terms_versions');
    await terms.createIndex(
      { publicationNumber: -1 },
      { unique: true, partialFilterExpression: { state: 'published' } },
    );
    await terms.createIndex({ createdAt: -1, _id: -1 });
    const acceptances = database.collection('terms_acceptances');
    await acceptances.createIndex(
      { personId: 1, termsVersionId: 1 },
      { unique: true },
    );
    await acceptances.createIndex({ personId: 1, acceptedAt: -1, _id: -1 });
    const indexes = await trainingPlans.indexes();
    if (indexes.some((index) => index.name === legacyTrainingPlanIndexName)) {
      await trainingPlans.dropIndex(legacyTrainingPlanIndexName);
    }
    process.stdout.write('Index set v5 applied successfully.\n');
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
