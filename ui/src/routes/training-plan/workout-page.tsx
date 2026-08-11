import { useState } from 'react';

import { Alert, Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';

import type { MockAuthScenario } from '~/auth/auth-service';
import { trackUiEvent } from '~/core/analytics';
import { TrainingPlanBreadcrumbs } from '~/routes/training-plan/components';
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
  const [conflict, setConflict] = useState(false);
  const workout = query.data;
  const plan = workout?.trainingPlan;

  const reload = async () => {
    if (!window.confirm('Recarregar os dados e descartar os rascunhos locais?'))
      return;
    trackUiEvent({
      eventName: 'ui_retry_requested',
      resource: 'workout',
      control: 'retry',
      surface: 'workout',
    });
    const result = await query.refetch();
    if (result.isSuccess) setConflict(false);
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
          <Button onPress={() => void query.refetch()} variant="secondary">
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
      {conflict ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Este plano foi alterado em outro lugar.</Alert.Title>
            <Alert.Description>
              Seus rascunhos permanecem visíveis, mas novas gravações estão
              pausadas.
            </Alert.Description>
          </Alert.Content>
          <Button onPress={() => void reload()}>Recarregar dados</Button>
        </Alert>
      ) : null}
      {workout === undefined ? null : (
        <WorkoutEditor
          data={workout}
          key={`${workout.id}:${workout.version}`}
          mockScenario={mockTrainingPlans}
          onConflict={() => setConflict(true)}
        />
      )}
    </div>
  );
}
