import { describe, expect, it, vi } from 'vitest';

import type { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import type { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import type { WorkoutExecutionRepository } from '~/training/repositories/workout-execution.repository';
import type { TrainingClockService } from '~/training/services/training-clock.service';
import type { TrainingLoadProfileService } from '~/training/services/training-load-profile.service';
import { TrainingService } from '~/training/services/training.service';
import type { WorkoutSessionStore } from '~/training/stores/workout-session.store';

const now = new Date('2026-09-13T12:00:00.000Z');

function createService(
  active: unknown,
  dependencies: {
    images?: Partial<ExerciseImageService>;
    loadProfiles?: Partial<TrainingLoadProfileService>;
  } = {},
) {
  return new TrainingService(
    {
      getActiveExecutionPlan: vi.fn().mockResolvedValue(active),
    } as unknown as PersonalTrainingPlanService,
    dependencies.images as ExerciseImageService,
    dependencies.loadProfiles as TrainingLoadProfileService,
    {
      findLastForPlan: vi.fn().mockResolvedValue(null),
    } as unknown as WorkoutExecutionRepository,
    { get: vi.fn().mockResolvedValue(null) } as unknown as WorkoutSessionStore,
    { now: vi.fn(() => now) } as unknown as TrainingClockService,
  );
}

describe('TrainingService offline overview', () => {
  it('emits no validity without an active plan', async () => {
    const result = await createService(null).overview('person-a');

    expect(result).toEqual({
      offlinePreparation: null,
      offlineValidity: null,
      plan: null,
      workouts: [],
    });
  });

  it('emits server validation and expiration exactly seven days apart', async () => {
    const result = await createService({
      catalogEntryId: 'catalog-a',
      ownerPersonId: 'person-a',
      plan: {
        createdAt: now.toISOString(),
        description: '',
        id: 'plan-a',
        name: 'Plano A',
        ownerPersonId: 'person-a',
        updatedAt: now.toISOString(),
        version: 1,
        workouts: [],
      },
      source: 'owned',
    }).overview('person-a');

    expect(result.offlineValidity).toEqual({
      expiresAt: '2026-09-20T12:00:00.000Z',
      validatedAt: now.toISOString(),
    });
    expect(result.offlinePreparation).toMatchObject({
      plan: { id: 'plan-a' },
      workoutIds: [],
    });
  });

  it('adds an opaque offline media identifier to image previews', async () => {
    const storedImage = {
      display: {
        height: 640,
        key: 'exercise-images/private/display.webp',
        width: 320,
      },
      thumbnail: {
        height: 160,
        key: 'exercise-images/private/thumbnail.webp',
        width: 80,
      },
    };
    const exercise = {
      bodyArea: 'chest' as const,
      id: 'exercise-a',
      image: storedImage,
      name: 'Supino',
      repetitions: 12,
      restSeconds: 60,
      sets: 3,
      type: 'image' as const,
    };
    const service = createService(
      {
        catalogEntryId: 'catalog-a',
        ownerPersonId: 'person-a',
        plan: {
          createdAt: now.toISOString(),
          description: '',
          id: 'plan-a',
          name: 'Plano A',
          ownerPersonId: 'person-a',
          updatedAt: now.toISOString(),
          version: 1,
          workouts: [{ exercises: [exercise], id: 'workout-a', name: 'A' }],
        },
        source: 'owned',
      },
      {
        images: {
          createOfflineMediaId: vi.fn(() => 'opaque-media-id'),
          hydrateExercises: vi.fn().mockResolvedValue([
            {
              ...exercise,
              image: {
                displayUrl: 'https://signed.example/display.webp',
                signedUrlExpiresAt: '2026-09-13T12:15:00.000Z',
                thumbnailUrl: 'https://signed.example/thumbnail.webp',
              },
            },
          ]),
        },
        loadProfiles: { findForExercises: vi.fn().mockResolvedValue([]) },
      },
    );

    const result = await service.preview('person-a', 'workout-a');

    expect(result.exercises[0]).toMatchObject({
      image: {
        displayUrl: 'https://signed.example/display.webp',
        offlineMediaId: 'opaque-media-id',
      },
      type: 'image',
    });
  });
});
