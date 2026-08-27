import 'dotenv/config';

import process from 'node:process';

import { connect, disconnect } from 'mongoose';

const confirmation = 'apply-dall-fit-indexes-v2';
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

    await people.createIndex(
      { googleSubject: 1 },
      { name: peopleIndexName, unique: true },
    );
    await trainingPlans.createIndex(
      { ownerPersonId: 1, createdAt: -1, _id: -1 },
      { name: trainingPlanIndexName },
    );
    await workoutExecutions.createIndex(
      { personId: 1, sessionId: 1 },
      { name: 'personId_1_sessionId_1', unique: true },
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
    await loadProfiles.createIndex(
      { trainingPlanId: 1, workoutId: 1 },
      { name: 'trainingPlanId_1_workoutId_1' },
    );
    await loadProfiles.createIndex(
      { trainingPlanId: 1, exerciseId: 1 },
      { name: 'trainingPlanId_1_exerciseId_1' },
    );

    const indexes = await trainingPlans.indexes();
    if (indexes.some((index) => index.name === legacyTrainingPlanIndexName)) {
      await trainingPlans.dropIndex(legacyTrainingPlanIndexName);
    }
    process.stdout.write('Index set v2 applied successfully.\n');
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
