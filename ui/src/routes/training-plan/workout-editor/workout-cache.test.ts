import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import type {
  GlobalTrainingPlanCollectionResponse,
  TrainingPlanDetails,
  TrainingPlanWorkoutDetails,
} from '@dall-fit/types';

import {
  trainingPlanDetailFixture,
  trainingPlanWorkoutFixture,
} from '~/mocks/fixtures/training-plans';
import { trainingPlanKeys } from '~/routes/training-plan/training-plan-queries';

import {
  reorderCachedExercises,
  synchronizeWorkoutMutation,
} from './workout-cache';

describe('workout cache synchronization', () => {
  it('updates the workout, detail and matching list after a confirmed mutation', () => {
    const queryClient = new QueryClient();
    const trainingPlanId = trainingPlanDetailFixture.id;
    const workoutId = trainingPlanWorkoutFixture.id;
    const detailKey = trainingPlanKeys.detail(trainingPlanId, 'success');
    const workoutKey = trainingPlanKeys.workout(
      trainingPlanId,
      workoutId,
      'success',
    );
    const listKey = trainingPlanKeys.list(1, 'success');
    const otherScenarioKey = trainingPlanKeys.list(1, 'empty-workout');
    const list: GlobalTrainingPlanCollectionResponse = {
      data: [trainingPlanDetailFixture],
      page: 1,
      pageSize: 20,
      total: 1,
    };
    queryClient.setQueryData(detailKey, trainingPlanDetailFixture);
    queryClient.setQueryData(workoutKey, trainingPlanWorkoutFixture);
    queryClient.setQueryData(listKey, list);
    queryClient.setQueryData(otherScenarioKey, list);

    synchronizeWorkoutMutation(queryClient, {
      mockScenario: 'success',
      trainingPlanId,
      updateDetail: (detail) => ({
        ...detail,
        workouts: detail.workouts.map((workout) =>
          workout.id === workoutId
            ? { ...workout, exerciseCount: workout.exerciseCount + 1 }
            : workout,
        ),
      }),
      updateWorkout: (workout) => ({
        ...workout,
        name: 'Treino sincronizado',
      }),
      version: 7,
      workoutId,
    });

    expect(
      queryClient.getQueryData<TrainingPlanWorkoutDetails>(workoutKey),
    ).toMatchObject({ name: 'Treino sincronizado', version: 7 });
    expect(
      queryClient.getQueryData<TrainingPlanDetails>(detailKey),
    ).toMatchObject({
      version: 7,
      workouts: [{ exerciseCount: 6, id: workoutId }, { exerciseCount: 2 }],
    });
    expect(
      queryClient.getQueryData<GlobalTrainingPlanCollectionResponse>(listKey)
        ?.data[0]?.version,
    ).toBe(7);
    expect(
      queryClient.getQueryData<GlobalTrainingPlanCollectionResponse>(
        otherScenarioKey,
      )?.data[0]?.version,
    ).toBe(0);
  });

  it('reorders cached exercises without losing any item', () => {
    const exercises = trainingPlanWorkoutFixture.exercises;
    const reversedIds = exercises.map((exercise) => exercise.id).reverse();

    expect(
      reorderCachedExercises(exercises, reversedIds).map(
        (exercise) => exercise.id,
      ),
    ).toEqual(reversedIds);
  });
});
