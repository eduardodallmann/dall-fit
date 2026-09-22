import { createHash } from 'node:crypto';

import 'dotenv/config';

import mongoose from 'mongoose';
import { z } from 'zod';

import catalogDocument from '../src/training-plan-assistant/data/exercise-catalog.v2.json';
import rawSeedDocument from '../src/training-plan-assistant/data/global-training-plan-seeds.v2.json';
import {
  TrainingPlanDocument,
  TrainingPlanSchema,
} from '../src/training-plan/repositories/training-plan.schema';

const strengthSeedExerciseSchema = z.strictObject({
  catalogKey: z.string().regex(/^youtube-short:[A-Za-z0-9_-]{11}$/),
  repetitions: z.number().int().min(1).max(1000),
  restSeconds: z.number().int().min(0).max(3600),
  sets: z.number().int().min(1).max(100),
});
const durationSeedExerciseSchema = z.strictObject({
  catalogKey: z.string().regex(/^duration:[a-z0-9-]+$/),
  durationMinutes: z.number().int().min(1).max(1440),
});
const seedDocumentSchema = z.strictObject({
  plans: z
    .array(
      z.strictObject({
        description: z.string().min(1).max(1000),
        id: z.string().regex(/^[a-f0-9]{24}$/),
        name: z.string().min(1).max(120),
        workouts: z
          .array(
            z.strictObject({
              exercises: z
                .array(
                  z.union([
                    strengthSeedExerciseSchema,
                    durationSeedExerciseSchema,
                  ]),
                )
                .min(1)
                .max(50),
              name: z.string().min(1).max(120),
            }),
          )
          .min(1)
          .max(25),
      }),
    )
    .min(1),
  version: z.literal('assistant-global-training-plans.v2'),
});

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
        'seed-dall-fit-assistant-globals-v2')
  ) {
    throw new Error(
      'Published environments require --execute and ASSISTANT_GLOBAL_SEED_CONFIRMATION=seed-dall-fit-assistant-globals-v2.',
    );
  }
  const seedDocument = seedDocumentSchema.parse(rawSeedDocument);
  const catalog = new Map(
    catalogDocument.entries.map((entry) => [entry.key, entry]),
  );
  const usedKeys = seedDocument.plans.flatMap((plan) =>
    plan.workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => exercise.catalogKey),
    ),
  );
  if (
    new Set(seedDocument.plans.map((plan) => plan.id)).size !==
    seedDocument.plans.length
  )
    throw new Error('The global assistant seeds must use unique plan IDs.');
  for (const key of usedKeys) {
    if (!catalog.has(key))
      throw new Error(`Unknown assistant catalog key: ${key}`);
  }
  for (const plan of seedDocument.plans) {
    const exercises = plan.workouts.flatMap((workout) => workout.exercises);
    if (
      plan.workouts.some(
        (workout) => !workout.exercises.at(-1)?.catalogKey.includes('-stretch'),
      )
    )
      throw new Error(
        `Every workout in seed ${plan.id} must end in stretching.`,
      );
    for (const exercise of exercises) {
      const entry = catalog.get(exercise.catalogKey);
      if (entry === undefined)
        throw new Error(
          `Unknown assistant catalog key: ${exercise.catalogKey}`,
        );
      if ('durationMinutes' in exercise) {
        if (
          entry.type !== 'duration' ||
          entry.minDurationMinutes === undefined ||
          entry.maxDurationMinutes === undefined
        )
          throw new Error(
            `Seed ${plan.id} uses duration parameters for ${exercise.catalogKey}.`,
          );
        if (
          exercise.durationMinutes < entry.minDurationMinutes ||
          exercise.durationMinutes > entry.maxDurationMinutes
        )
          throw new Error(
            `Seed ${plan.id} uses an invalid duration for ${exercise.catalogKey}.`,
          );
      } else if (entry.type !== 'youtube-short') {
        throw new Error(
          `Seed ${plan.id} uses strength parameters for ${exercise.catalogKey}.`,
        );
      }
    }
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
          exercises: workout.exercises.map((exercise, exerciseIndex) => {
            const entry = catalog.get(exercise.catalogKey);
            if (entry === undefined)
              throw new Error(`Unknown catalog key: ${exercise.catalogKey}`);
            const id = stableObjectId(
              `${plan.id}:workout:${workoutIndex}:exercise:${exerciseIndex}`,
            );
            if ('durationMinutes' in exercise) {
              if (entry.type !== 'duration')
                throw new Error(
                  `Invalid duration catalog entry: ${exercise.catalogKey}`,
                );
              return {
                _id: id,
                bodyArea: entry.bodyArea,
                durationMinutes: exercise.durationMinutes,
                instructions: entry.instructions,
                name: entry.name,
                type: 'duration',
                ...(entry.youtubeId === undefined
                  ? {}
                  : { youtubeId: entry.youtubeId }),
              };
            }
            if (entry.type !== 'youtube-short')
              throw new Error(
                `Invalid strength catalog entry: ${exercise.catalogKey}`,
              );
            return {
              _id: id,
              bodyArea: entry.bodyArea,
              name: entry.name,
              repetitions: exercise.repetitions,
              restSeconds: exercise.restSeconds,
              sets: exercise.sets,
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
