import { Button } from '@heroui/react';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import type { Exercise, TrainingPlanWorkoutDetails } from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import { TrainingPlanPageSkeleton } from '~/routes/training-plan/loading';
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
        <ReadOnlyWorkout workout={workout} />
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

function ReadOnlyWorkout({
  workout,
}: Readonly<{ workout: TrainingPlanWorkoutDetails }>) {
  return (
    <section
      aria-label="Treino em modo de leitura"
      className={styles.section()}
    >
      <div className={styles.titleGroup()}>
        <h1 className={styles.title()}>{workout.name}</h1>
        <p className={styles.description()}>
          Exercícios definidos no plano global. Nenhuma informação pode ser
          alterada neste vínculo.
        </p>
      </div>
      <div className={styles.exerciseList()}>
        {workout.exercises.map((exercise, index) => (
          <article className={styles.exerciseCard()} key={exercise.id}>
            <h2>
              {index + 1}. {exerciseLabel(exercise)}
            </h2>
            <ExerciseDetails exercise={exercise} />
          </article>
        ))}
      </div>
    </section>
  );
}

function ExerciseDetails({ exercise }: Readonly<{ exercise: Exercise }>) {
  if (exercise.type === 'pause')
    return <p>Pausa: {exercise.restSeconds} segundos</p>;
  if (exercise.type === 'duration')
    return (
      <p>
        {exercise.bodyArea} · {exercise.durationMinutes} minutos
      </p>
    );
  if (exercise.type === 'youtube-long')
    return (
      <p>
        {exercise.bodyArea} · YouTube: {exercise.youtubeId || 'não informado'}
      </p>
    );
  if (exercise.type === 'youtube-short')
    return (
      <p>
        {exercise.bodyArea} · {exercise.sets} séries · {exercise.repetitions}{' '}
        repetições · {exercise.restSeconds}s de descanso · YouTube:{' '}
        {exercise.youtubeId || 'não informado'}
      </p>
    );
  return (
    <div className={styles.titleGroup()}>
      <p>
        {exercise.bodyArea} · {exercise.sets} séries · {exercise.repetitions}{' '}
        repetições · {exercise.restSeconds}s de descanso
      </p>
      {exercise.image === null ? (
        <p>Sem imagem.</p>
      ) : (
        <img
          alt={exercise.name}
          className={styles.exerciseImage()}
          src={exercise.image.displayUrl}
        />
      )}
    </div>
  );
}

function exerciseLabel(exercise: Exercise): string {
  if (exercise.type === 'pause') return 'Pausa';
  return exercise.name;
}
