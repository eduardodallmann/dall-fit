import { useState } from 'react';

import { Alert, Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';

import type { MockAuthScenario } from '~/auth/auth-service';
import { trackUiEvent } from '~/core/analytics';
import { useAggregateMutationCoordinator } from '~/routes/training-plan/aggregate-mutation-coordinator';
import {
  TrainingPlanBreadcrumbs,
  TrainingPlanConflictAlert,
} from '~/routes/training-plan/components';
import { TrainingPlanPageSkeleton } from '~/routes/training-plan/loading';
import { trainingPlanStyles } from '~/routes/training-plan/styles';
import { trainingPlanWorkoutQueryOptions } from '~/routes/training-plan/training-plan-queries';
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';
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
  const query = useQuery(
    trainingPlanWorkoutQueryOptions(
      trainingPlanId,
      workoutId,
      mockTrainingPlans,
    ),
  );
  const [reloadKey, setReloadKey] = useState(0);
  const workout = query.data;
  const plan = workout?.trainingPlan;
  const aggregate = useAggregateMutationCoordinator(
    trainingPlanId,
    workout?.version,
  );

  const trackRetry = () =>
    trackUiEvent({
      eventName: 'ui_retry_requested',
      resource: 'workout',
      control: 'retry',
      surface: 'workout',
    });

  const retryInitialLoad = () => {
    trackRetry();
    void query.refetch();
  };

  const reload = async () => {
    trackRetry();
    const result = await query.refetch();
    if (!result.isSuccess || result.data === undefined)
      throw result.error ?? new Error('Workout reload failed.');
    await aggregate.reset(result.data.version);
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
        <TrainingPlanConflictAlert onReload={reload} />
      ) : null}
      {workout === undefined ? null : (
        <WorkoutEditor
          data={workout}
          key={`${workout.id}:${reloadKey}`}
          mockScenario={mockTrainingPlans}
          onConflict={() => undefined}
        />
      )}
    </div>
  );
}
