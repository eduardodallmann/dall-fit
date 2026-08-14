import { describe, expect, it, vi } from 'vitest';

import { CreateGlobalTrainingPlanCommand } from '~/training-plan/commands/create-global-training-plan.command';
import { CreateTrainingPlanWorkoutCommand } from '~/training-plan/commands/create-training-plan-workout.command';
import { DeleteGlobalTrainingPlanCommand } from '~/training-plan/commands/delete-global-training-plan.command';
import { DeleteTrainingPlanWorkoutCommand } from '~/training-plan/commands/delete-training-plan-workout.command';
import { GetGlobalTrainingPlanCommand } from '~/training-plan/commands/get-global-training-plan.command';
import { GetTrainingPlanWorkoutCommand } from '~/training-plan/commands/get-training-plan-workout.command';
import { ListGlobalTrainingPlansCommand } from '~/training-plan/commands/list-global-training-plans.command';
import { UpdateGlobalTrainingPlanCommand } from '~/training-plan/commands/update-global-training-plan.command';
import { UploadTrainingPlanExerciseImageCommand } from '~/training-plan/commands/upload-training-plan-exercise-image.command';
import type { TrainingPlanEntity } from '~/training-plan/domain/training-plan.entity';
import type { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import type { TrainingPlanService } from '~/training-plan/services/training-plan.service';

const plan: TrainingPlanEntity = {
  id: '507f1f77bcf86cd799439011',
  ownerPersonId: null,
  name: 'Plano global',
  description: 'Descrição global',
  version: 2,
  workouts: [
    {
      exerciseCount: 0,
      id: '507f1f77bcf86cd799439012',
      name: 'Novo treino',
    },
  ],
  createdAt: '2026-08-07T12:00:00.000Z',
  updatedAt: '2026-08-07T12:00:00.000Z',
};

function createServiceMock() {
  const result = {
    createGlobal: vi.fn(),
    createWorkout: vi.fn(),
    deleteGlobal: vi.fn(),
    deleteWorkout: vi.fn(),
    getGlobal: vi.fn(),
    listGlobal: vi.fn(),
    getWorkout: vi.fn(),
    validateExerciseImageUpload: vi.fn(),
    commitExerciseImage: vi.fn(),
    updateGlobal: vi.fn(),
  };

  return result as typeof result & TrainingPlanService;
}

function createImageServiceMock() {
  const result = {
    createSignedImage: vi.fn(),
    deleteImages: vi.fn(),
    hydrateExercises: vi.fn(),
    processAndUpload: vi.fn(),
    toPublicExercise: vi.fn(),
  };

  return result as typeof result & ExerciseImageService;
}

describe('training plan commands', () => {
  it('maps the list service result to the fixed collection contract', async () => {
    const service = createServiceMock();
    service.listGlobal.mockResolvedValue({ data: [plan], total: 1 });
    const command = new ListGlobalTrainingPlansCommand(service);

    await expect(command.execute(2)).resolves.toEqual({
      data: [plan],
      page: 2,
      pageSize: 20,
      total: 1,
    });
  });

  it('maps creation without leaking ownership or workouts', async () => {
    const service = createServiceMock();
    service.createGlobal.mockResolvedValue(plan);
    const command = new CreateGlobalTrainingPlanCommand(service);

    const result = await command.execute({
      name: plan.name,
      description: plan.description,
    });

    expect(result.data).not.toHaveProperty('ownerPersonId');
    expect(result.data).not.toHaveProperty('workouts');
    expect(result.data).toMatchObject({ id: plan.id, name: plan.name });
  });

  it('maps the projected detail', async () => {
    const service = createServiceMock();
    service.getGlobal.mockResolvedValue(plan);
    const command = new GetGlobalTrainingPlanCommand(service);

    const result = await command.execute(plan.id);

    expect(result.data).toEqual({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      version: plan.version,
      workouts: plan.workouts,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    });
  });

  it('wraps the updated plan summary', async () => {
    const service = createServiceMock();
    service.updateGlobal.mockResolvedValue({ data: plan, version: 3 });
    const command = new UpdateGlobalTrainingPlanCommand(service);

    await expect(
      command.execute(plan.id, 2, { name: plan.name }),
    ).resolves.toEqual({ response: { data: plan }, version: 3 });
  });

  it('waits for plan deletion', async () => {
    const service = createServiceMock();
    service.deleteGlobal.mockResolvedValue(undefined);
    const command = new DeleteGlobalTrainingPlanCommand(service);

    await command.execute(plan.id, 2);

    expect(service.deleteGlobal.mock.calls).toEqual([[plan.id, 2]]);
  });

  it('wraps the workout created by the service', async () => {
    const service = createServiceMock();
    service.createWorkout.mockResolvedValue({
      data: plan.workouts[0],
      version: 3,
    });
    const command = new CreateTrainingPlanWorkoutCommand(service);

    await expect(command.execute(plan.id, 2)).resolves.toEqual({
      response: { data: plan.workouts[0] },
      version: 3,
    });
  });

  it('waits for workout deletion', async () => {
    const service = createServiceMock();
    service.deleteWorkout.mockResolvedValue(3);
    const command = new DeleteTrainingPlanWorkoutCommand(service);

    await command.execute(plan.id, plan.workouts[0].id, 2);

    expect(service.deleteWorkout.mock.calls).toEqual([
      [plan.id, plan.workouts[0].id, 2],
    ]);
  });

  it('hydrates image URLs only after reading the authorized workout', async () => {
    const service = createServiceMock();
    const imageService = createImageServiceMock();
    const workout = {
      createdAt: plan.createdAt,
      exercises: [
        { id: 'exercise-1', restSeconds: 60, type: 'pause' as const },
      ],
      id: plan.workouts[0].id,
      name: plan.workouts[0].name,
      trainingPlan: { id: plan.id, name: plan.name },
      updatedAt: plan.updatedAt,
      version: plan.version,
    };
    service.getWorkout.mockResolvedValue(workout);
    imageService.hydrateExercises.mockResolvedValue(workout.exercises);
    const command = new GetTrainingPlanWorkoutCommand(service, imageService);

    const result = await command.execute(plan.id, workout.id);

    expect(service.getWorkout.mock.invocationCallOrder[0]).toBeLessThan(
      imageService.hydrateExercises.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(result.data.exercises).toEqual(workout.exercises);
  });

  it('signs an uploaded image before CAS and returns the signed contract', async () => {
    const service = createServiceMock();
    const imageService = createImageServiceMock();
    const storedImage = {
      display: { height: 640, key: 'display.webp', width: 320 },
      thumbnail: { height: 160, key: 'thumbnail.webp', width: 80 },
    };
    const signedImage = {
      displayUrl: 'https://private.blob.test/display?signed=fake',
      signedUrlExpiresAt: '2026-08-14T12:15:00.000Z',
      thumbnailUrl: 'https://private.blob.test/thumbnail?signed=fake',
    };
    imageService.processAndUpload.mockResolvedValue(storedImage);
    imageService.createSignedImage.mockResolvedValue(signedImage);
    service.commitExerciseImage.mockResolvedValue(3);
    const command = new UploadTrainingPlanExerciseImageCommand(
      service,
      imageService,
    );

    const result = await command.execute(
      plan.id,
      plan.workouts[0].id,
      'exercise-1',
      2,
      {
        buffer: Buffer.from('image'),
        mimetype: 'image/png',
        originalname: 'image.png',
        size: 5,
      },
    );

    expect(
      imageService.createSignedImage.mock.invocationCallOrder[0],
    ).toBeLessThan(
      service.commitExerciseImage.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(imageService.deleteImages.mock.calls).toHaveLength(0);
    expect(result).toEqual({
      response: { data: { image: signedImage } },
      version: 3,
    });
  });

  it('compensates uploaded blobs when signing fails before CAS', async () => {
    const service = createServiceMock();
    const imageService = createImageServiceMock();
    const storedImage = {
      display: { height: 640, key: 'display.webp', width: 320 },
      thumbnail: { height: 160, key: 'thumbnail.webp', width: 80 },
    };
    imageService.processAndUpload.mockResolvedValue(storedImage);
    imageService.createSignedImage.mockRejectedValue(new Error('sign failed'));
    const command = new UploadTrainingPlanExerciseImageCommand(
      service,
      imageService,
    );

    await expect(
      command.execute(plan.id, plan.workouts[0].id, 'exercise-1', 2, {
        buffer: Buffer.from('image'),
        mimetype: 'image/png',
        originalname: 'image.png',
        size: 5,
      }),
    ).rejects.toThrow('sign failed');
    expect(service.commitExerciseImage.mock.calls).toHaveLength(0);
    expect(imageService.deleteImages.mock.calls).toEqual([[[storedImage]]]);
  });

  it('compensates uploaded blobs when the CAS commit fails', async () => {
    const service = createServiceMock();
    const imageService = createImageServiceMock();
    const storedImage = {
      display: { height: 640, key: 'display.webp', width: 320 },
      thumbnail: { height: 160, key: 'thumbnail.webp', width: 80 },
    };
    imageService.processAndUpload.mockResolvedValue(storedImage);
    imageService.createSignedImage.mockResolvedValue({
      displayUrl: 'https://private.blob.test/display?signed=fake',
      signedUrlExpiresAt: '2026-08-14T12:15:00.000Z',
      thumbnailUrl: 'https://private.blob.test/thumbnail?signed=fake',
    });
    service.commitExerciseImage.mockRejectedValue(new Error('CAS failed'));
    const command = new UploadTrainingPlanExerciseImageCommand(
      service,
      imageService,
    );

    await expect(
      command.execute(plan.id, plan.workouts[0].id, 'exercise-1', 2, {
        buffer: Buffer.from('image'),
        mimetype: 'image/png',
        originalname: 'image.png',
        size: 5,
      }),
    ).rejects.toThrow('CAS failed');
    expect(imageService.deleteImages.mock.calls).toEqual([[[storedImage]]]);
  });
});
