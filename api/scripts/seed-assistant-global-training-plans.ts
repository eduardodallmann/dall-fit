import { createHash } from 'node:crypto';

import 'dotenv/config';

import mongoose from 'mongoose';

import catalogDocument from '../src/training-plan-assistant/data/exercise-catalog.v2.json';
import seedDocument from '../src/training-plan-assistant/data/global-training-plan-seeds.v1.json';
import {
  TrainingPlanDocument,
  TrainingPlanSchema,
} from '../src/training-plan/repositories/training-plan.schema';

// The CLI deliberately keeps validation, dry-run and set-on-insert reporting in one visible operational flow.
// eslint-disable-next-line sonarjs/cognitive-complexity
async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const published =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV !== undefined;

  if (
    published &&
    (!execute ||
      process.env.ASSISTANT_GLOBAL_SEED_CONFIRMATION !==
        'seed-dall-fit-assistant-globals-v1')
  ) {
    throw new Error(
      'Published environments require --execute and ASSISTANT_GLOBAL_SEED_CONFIRMATION=seed-dall-fit-assistant-globals-v1.',
    );
  }
  const catalog = new Map(
    catalogDocument.entries.map((entry) => [
      `youtube-short:${entry.youtubeId}`,
      entry,
    ]),
  );
  const usedKeys = seedDocument.plans.flatMap((plan) =>
    plan.workouts.flatMap((workout) => workout.catalogKeys),
  );
  if (usedKeys.length !== 45 || new Set(usedKeys).size !== 45) {
    throw new Error(
      'The global assistant seeds must use exactly 45 unique videos.',
    );
  }
  for (const key of usedKeys) {
    if (!catalog.has(key))
      throw new Error(`Unknown assistant catalog key: ${key}`);
  }
  const uri = process.env.MONGODB_URI;
  if (uri === undefined) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(uri);
  try {
    const model = mongoose.model(TrainingPlanDocument.name, TrainingPlanSchema);
    for (const plan of seedDocument.plans) {
      const existing = await model.findById(plan.id).lean().exec();
      if (existing !== null) {
        const sameIdentity =
          existing.ownerPersonId === null && existing.name === plan.name;
        if (!sameIdentity)
          throw new Error(
            `Seed ${plan.id} diverges from an existing global plan.`,
          );
        process.stdout.write(`unchanged ${plan.id}\n`);
        continue;
      }
      if (!execute) {
        process.stdout.write(`would-create ${plan.id}\n`);
        continue;
      }
      await model.create({
        _id: plan.id,
        description: plan.description,
        name: plan.name,
        ownerPersonId: null,
        version: 0,
        workouts: plan.workouts.map((workout, workoutIndex) => ({
          _id: stableObjectId(`${plan.id}:workout:${workoutIndex}`),
          exercises: workout.catalogKeys.map((key) => {
            const entry = catalog.get(key);
            if (entry === undefined)
              throw new Error(`Unknown catalog key: ${key}`);
            return {
              _id: stableObjectId(`${plan.id}:${key}`),
              bodyArea: entry.bodyArea,
              name: entry.name,
              repetitions: 12,
              restSeconds: 60,
              sets: 3,
              type: 'youtube-short',
              youtubeId: entry.youtubeId,
            };
          }),
          name: workout.name,
        })),
      });
      process.stdout.write(`created ${plan.id}\n`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

void main();

function stableObjectId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}
