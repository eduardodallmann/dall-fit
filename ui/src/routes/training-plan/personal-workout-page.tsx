import { Button } from '@heroui/react';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import type { TrainingPlanWorkoutDetails } from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import { TrainingPlanPageSkeleton } from '~/routes/training-plan/loading';
import { ReadOnlyWorkout } from '~/routes/training-plan/read-only-workout';
import { trainingPlanStyles } from '~/routes/training-plan/styles';
import {
  personalTrainingPlanDetailQueryOptions,
  trainingPlanKeys,
} from '~/routes/training-plan/training-plan-queries';
import {
  getTrainingPlanWorkout,
  type MockTrainingPlansScenario,
} from '~/routes/training-plan/training-plan-service';
import { WorkoutEditor } from '~/routes/training-plan/workout-editor';

const styles = trainingPlanStyles();

interface PersonalWorkoutPageProps {
  catalogEntryId: string;
  mockAuth?: MockAuthScenario;
  mockTrainingPlans: MockTrainingPlansScenario;
  workoutId: string;
}

export function PersonalTrainingPlanWorkoutPage({
  catalogEntryId,
  mockTrainingPlans,
  workoutId,
}: Readonly<PersonalWorkoutPageProps>) {
  const detailQuery = useQuery(
    personalTrainingPlanDetailQueryOptions(catalogEntryId, mockTrainingPlans),
  );
  const workoutQuery = useQuery(
    queryOptions({
      queryKey: trainingPlanKeys.workout(
        catalogEntryId,
        workoutId,
        mockTrainingPlans,
        'personal',
      ),
      queryFn: ({ signal }) =>
        getTrainingPlanWorkout(
          catalogEntryId,
          workoutId,
          mockTrainingPlans,
          signal,
          'personal',
        ),
    }),
  );
  const plan = detailQuery.data;
  const workout = workoutQuery.data;

  if (
    (detailQuery.isLoading || workoutQuery.isLoading) &&
    workout === undefined
  )
    return (
      <div className={styles.page()}>
        <TrainingPlanPageSkeleton label="Carregando treino" />
      </div>
    );

  if (plan === undefined || workout === undefined)
    return (
      <div className={styles.page()}>
        <p>Não foi possível carregar este treino.</p>
        <Button onPress={() => void workoutQuery.refetch()} variant="secondary">
          Tentar novamente
        </Button>
      </div>
    );

  const editorData: TrainingPlanWorkoutDetails = {
    ...workout,
    trainingPlan: { id: catalogEntryId, name: workout.trainingPlan.name },
  };

  return (
    <div className={styles.page()}>
      <nav aria-label="Navegação estrutural" className={styles.breadcrumbs()}>
        <Link className={styles.breadcrumbLink()} to="/training-plan">
          Meus planos
        </Link>
        <span>›</span>
        <Link
          className={styles.breadcrumbLink()}
          params={{ catalogEntryId }}
          to="/training-plan/$catalogEntryId"
        >
          {plan.name}
        </Link>
        <span>›</span>
        <span>{workout.name}</span>
      </nav>
      {plan.source === 'global-reference' ? (
        <ReadOnlyWorkout
          onImageLoadError={() => void workoutQuery.refetch()}
          onRetryImage={() => void workoutQuery.refetch()}
          workout={workout}
        />
      ) : (
        <WorkoutEditor
          data={editorData}
          mockScenario={mockTrainingPlans}
          onImageLoadError={() => void workoutQuery.refetch()}
          onRetryImage={() => void workoutQuery.refetch()}
          resource="personal"
        />
      )}
    </div>
  );
}
