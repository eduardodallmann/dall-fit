import 'dotenv/config';

import process from 'node:process';

import { del, list } from '@vercel/blob';
import { connect, disconnect } from 'mongoose';

const prefix = 'exercise-images/';

async function main(): Promise<void> {
  const mongodbUri = process.env.MONGODB_URI;
  const blobStoreId = process.env.BLOB_STORE_ID;
  if (mongodbUri === undefined || blobStoreId === undefined)
    throw new Error('MONGODB_URI and BLOB_STORE_ID are required.');
  const execute = process.argv.includes('--execute');
  const connection = await connect(mongodbUri, { autoIndex: false });
  try {
    const database = connection.connection.db;
    if (database === undefined)
      throw new Error('MongoDB database is unavailable.');
    const references = await database
      .collection('training_plans')
      .aggregate<{ keys: string[] }>([
        { $unwind: '$workouts' },
        { $unwind: '$workouts.exercises' },
        {
          $match: {
            'workouts.exercises.type': 'image',
            'workouts.exercises.image': { $ne: null },
          },
        },
        {
          $project: {
            keys: [
              '$workouts.exercises.image.thumbnail.key',
              '$workouts.exercises.image.display.key',
            ],
          },
        },
      ])
      .toArray();
    const referenced = new Set(references.flatMap((entry) => entry.keys));
    const stored: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ cursor, prefix });
      stored.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor !== undefined);
    const orphaned = stored.filter((key) => !referenced.has(key));
    if (execute && orphaned.length > 0) await del(orphaned);
    process.stdout.write(
      `Image reconciliation ${execute ? 'executed' : 'dry-run'}: stored=${stored.length}, referenced=${referenced.size}, orphaned=${orphaned.length}.\n`,
    );
  } finally {
    await disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Image reconciliation failed.'}\n`,
  );
  process.exitCode = 1;
});
