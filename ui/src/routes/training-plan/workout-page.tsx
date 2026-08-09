import { Alert, Button, Card } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';

import type { MockAuthScenario } from '~/auth/auth-service';
import { trackUiEvent } from '~/core/analytics';
import { TrainingPlanBreadcrumbs } from '~/routes/training-plan/components';
import { TrainingPlanPageSkeleton } from '~/routes/training-plan/loading';
import { trainingPlanStyles } from '~/routes/training-plan/styles';
import { trainingPlanDetailQueryOptions } from '~/routes/training-plan/training-plan-queries';
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';

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
    trainingPlanDetailQueryOptions(trainingPlanId, mockTrainingPlans),
  );
  const plan = query.data;
  const workout = plan?.workouts.find((item) => item.id === workoutId);

  return (
    <div className={styles.page()}>
      <TrainingPlanBreadcrumbs
        mockAuth={mockAuth}
        mockTrainingPlans={mockTrainingPlans}
        plan={plan}
        surface="workout"
        workout={workout}
      />
      {query.isLoading ? (
        <TrainingPlanPageSkeleton label="Carregando treino" />
      ) : null}
      {query.isError && plan === undefined ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível carregar o plano.</Alert.Title>
            <Alert.Description>
              Os nomes do plano e do treino foram omitidos do breadcrumb.
            </Alert.Description>
          </Alert.Content>
          <Button
            onPress={() => {
              trackUiEvent({
                control: 'retry',
                eventName: 'ui_retry_requested',
                resource: 'workout',
                surface: 'workout',
              });
              void query.refetch();
            }}
            variant="secondary"
          >
            Tentar novamente
          </Button>
        </Alert>
      ) : null}
      {query.isError && plan !== undefined ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível atualizar o plano.</Alert.Title>
            <Alert.Description>
              Os nomes em cache permanecem disponíveis.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {plan !== undefined && workout === undefined ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Treino não encontrado.</Alert.Title>
            <Alert.Description>
              O plano foi carregado, mas este treino não pertence a ele.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {plan !== undefined && workout !== undefined ? (
        <Card>
          <Card.Header>
            <h1 className={styles.title()}>{workout.name}</h1>
            <p className={styles.description()}>
              O editor de exercícios será disponibilizado em uma próxima etapa.
            </p>
          </Card.Header>
        </Card>
      ) : null}
    </div>
  );
}
