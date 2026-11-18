import { ObjectId, type MongoClient as MongoClientType } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

import { MongoTrainingPlanCloneRepository } from './mongo-training-plan-clone.repository';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  planWrite: vi.fn(),
  jobWrite: vi.fn(),
}));
vi.mock('mongodb', async (importOriginal) => {
  const original = await importOriginal<{
    MongoClient: typeof MongoClientType;
    ObjectId: typeof ObjectId;
  }>();
  return {
    ...original,
    MongoClient: class {
      connect() {
        return Promise.resolve(this);
      }
      db() {
        return {
          collection: (name: string) => ({
            findOne: mocks.findOne,
            updateOne:
              name === 'training_plans' ? mocks.planWrite : mocks.jobWrite,
          }),
        };
      }
    },
  };
});

describe('duration image clone persistence', () => {
  it('counts pending duration images, resumes after a copy and materializes independent variants', async () => {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1/mock';
    const variant = {
      key: 'source/display',
      etag: 'etag',
      width: 160,
      height: 160,
    };
    const exercise = {
      id: '110000000000000000000201',
      type: 'duration',
      durationMinutes: 2,
      name: 'Alongamento',
      instructions: 'Com conforto.',
      bodyArea: 'other',
      image: { thumbnail: variant, display: variant },
    };
    const job = {
      _id: new ObjectId('110000000000000000000001'),
      personId: new ObjectId('110000000000000000000010'),
      state: 'running',
      cancelRequestedAt: null,
      generation: 1,
      copiedImages: [] as object[],
      snapshot: {
        name: 'Plano',
        description: 'Descrição',
        workouts: [
          {
            id: '110000000000000000000101',
            name: 'Treino',
            exercises: [
              exercise,
              { ...exercise, id: '110000000000000000000202', image: undefined },
            ],
          },
        ],
      },
    };
    mocks.findOne.mockImplementation(() => Promise.resolve(job));
    const repository = new MongoTrainingPlanCloneRepository();
    await expect(
      repository.nextDecision(job._id.toString(), 1, 'run', 3),
    ).resolves.toEqual({ kind: 'copy', exerciseIds: [exercise.id] });
    const copied = {
      exerciseId: exercise.id,
      thumbnail: { ...variant, key: 'destination/thumb' },
      display: { ...variant, key: 'destination/display' },
    };
    job.copiedImages.push(copied);
    await expect(
      repository.nextDecision(job._id.toString(), 1, 'run', 3),
    ).resolves.toEqual({ kind: 'finalize' });
    job.state = 'materializing';
    await repository.materializeClone(job._id.toString(), 1, 'run');
    const written = mocks.planWrite.mock.calls[0]?.[1] as {
      $setOnInsert: { workouts: { exercises: unknown[] }[] };
    };
    expect(written.$setOnInsert.workouts[0].exercises).toMatchObject([
      {
        type: 'duration',
        durationMinutes: 2,
        instructions: 'Com conforto.',
        image: { thumbnail: copied.thumbnail, display: copied.display },
      },
      { image: null },
    ]);
    job.state = 'cancelling';
    await expect(
      repository.nextDecision(job._id.toString(), 1, 'run', 3),
    ).resolves.toEqual({ kind: 'cleanup' });
  });
});
