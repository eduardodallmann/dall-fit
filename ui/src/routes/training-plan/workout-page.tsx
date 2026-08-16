import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { MockAuthScenario } from '~/auth/auth-service';
import { trackUiEvent } from '~/core/analytics';
import { getApiErrorCode } from '~/core/http/http-error';
import { useAggregateMutationCoordinator } from '~/routes/training-plan/aggregate-mutation-coordinator';
import {
  TrainingPlanBreadcrumbs,
  TrainingPlanConflictAlert,
} from '~/routes/training-plan/components';
import { TrainingPlanPageSkeleton } from '~/routes/training-plan/loading';
import {
  getSignedImageRefreshDelay,
  isSignedImageNearExpiration,
} from '~/routes/training-plan/signed-image-urls';
import { trainingPlanStyles } from '~/routes/training-plan/styles';
import { trainingPlanWorkoutQueryOptions } from '~/routes/training-plan/training-plan-queries';
import {
  trainingPlanMockSearch,
  type MockTrainingPlansScenario,
} from '~/routes/training-plan/training-plan-service';
import { WorkoutEditor } from '~/routes/training-plan/workout-editor';

const styles = trainingPlanStyles();

interface WorkoutPageProps {
  mockAuth?: MockAuthScenario;
  mockTrainingPlans: MockTrainingPlansScenario;
  trainingPlanId: string;
  workoutId: string;
}

export function TrainingPlanWorkoutPage({
  mockAuth,
  mockTrainingPlans,
  trainingPlanId,
  workoutId,
}: Readonly<WorkoutPageProps>) {
  const navigate = useNavigate();
  const query = useQuery(
    trainingPlanWorkoutQueryOptions(
      trainingPlanId,
      workoutId,
      mockTrainingPlans,
    ),
  );
  const refetchWorkout = query.refetch;
  const [reloadKey, setReloadKey] = useState(0);
  const [hasUnsavedWork, setHasUnsavedWork] = useState(false);
  const automaticallyRetriedExpirations = useRef(new Set<string>());
  const workout = query.data;
  const plan = workout?.trainingPlan;
  const mockSearch = trainingPlanMockSearch(mockTrainingPlans);
  const aggregate = useAggregateMutationCoordinator(
    trainingPlanId,
    workout?.version,
    hasUnsavedWork,
  );

  useEffect(() => {
    const external = aggregate.externalChange;
    if (external === undefined || aggregate.paused) return;
    if (external.state === 'deleted') {
      void navigate({ replace: true, to: '/global/training-plan' });
      return;
    }
    const errorCode = getApiErrorCode(query.error);
    if (errorCode === 'TRAINING_PLAN_NOT_FOUND') {
      void navigate({ replace: true, to: '/global/training-plan' });
      return;
    }
    if (errorCode === 'WORKOUT_NOT_FOUND') {
      void navigate({
        params: { trainingPlanId },
        replace: true,
        search: { mockAuth, ...mockSearch },
        to: '/global/training-plan/$trainingPlanId',
      });
      return;
    }
    if (workout !== undefined && workout.version >= external.version) {
      void aggregate.reset(workout.version).then(() => {
        setReloadKey((current) => current + 1);
      });
    }
  }, [
    aggregate,
    mockAuth,
    mockSearch,
    navigate,
    query.error,
    trainingPlanId,
    workout,
  ]);

  const refreshSignedImageUrls = useCallback(() => {
    refetchWorkout().catch(() => undefined);
  }, [refetchWorkout]);

  useEffect(() => {
    if (workout === undefined) return;
    const delay = getSignedImageRefreshDelay(workout.exercises);
    if (delay === undefined) return;
    const timer = window.setTimeout(refreshSignedImageUrls, delay);
    return () => window.clearTimeout(timer);
  }, [refreshSignedImageUrls, workout]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || workout === undefined)
        return;
      const delay = getSignedImageRefreshDelay(workout.exercises);
      if (delay === 0) refreshSignedImageUrls();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [refreshSignedImageUrls, workout]);

  const handleImageLoadError = (signedUrlExpiresAt: string) => {
    if (
      !isSignedImageNearExpiration(signedUrlExpiresAt) ||
      automaticallyRetriedExpirations.current.has(signedUrlExpiresAt)
    )
      return;
    automaticallyRetriedExpirations.current.add(signedUrlExpiresAt);
    refreshSignedImageUrls();
  };

  const trackRetry = () =>
    trackUiEvent({
      eventName: 'ui_retry_requested',
      resource: 'workout',
      control: 'retry',
      surface: 'workout',
    });

  const retryInitialLoad = () => {
    trackRetry();
    query.refetch().catch(() => undefined);
  };

  const reload = async () => {
    trackRetry();
    const result = await query.refetch();
    const errorCode = getApiErrorCode(result.error);
    if (errorCode === 'TRAINING_PLAN_NOT_FOUND') {
      await navigate({ replace: true, to: '/global/training-plan' });
      return;
    }
    if (errorCode === 'WORKOUT_NOT_FOUND') {
      await navigate({
        params: { trainingPlanId },
        replace: true,
        search: { mockAuth, ...mockSearch },
        to: '/global/training-plan/$trainingPlanId',
      });
      return;
    }
    if (!result.isSuccess || result.data === undefined)
      throw result.error ?? new Error('Workout reload failed.');
    await aggregate.reset(result.data.version);
    if (aggregate.pauseReason === 'conflict')
      setReloadKey((current) => current + 1);
  };

  return (
    <div className={styles.page()}>
      <TrainingPlanBreadcrumbs
        mockAuth={mockAuth}
        mockTrainingPlans={mockTrainingPlans}
        plan={plan}
        surface="workout"
        workout={workout}
      />
      {query.isLoading && workout === undefined ? (
        <TrainingPlanPageSkeleton label="Carregando treino" />
      ) : null}
      {query.isError && workout === undefined ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível carregar o treino.</Alert.Title>
            <Alert.Description>
              O plano ou o treino pode não existir.
            </Alert.Description>
          </Alert.Content>
          <Button onPress={retryInitialLoad} variant="secondary">
            Tentar novamente
          </Button>
        </Alert>
      ) : null}
      {query.isError && workout !== undefined ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível atualizar o treino.</Alert.Title>
            <Alert.Description>
              O editor preserva a última versão disponível.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {aggregate.paused ? (
        <TrainingPlanConflictAlert
          directReload
          onReload={reload}
          reason={aggregate.pauseReason}
        />
      ) : null}
      {workout === undefined ? null : (
        <WorkoutEditor
          data={workout}
          key={`${workout.id}:${reloadKey}`}
          mockScenario={mockTrainingPlans}
          onImageLoadError={handleImageLoadError}
          onRetryImage={refreshSignedImageUrls}
          onUnsavedWorkChange={setHasUnsavedWork}
        />
      )}
    </div>
  );
}
