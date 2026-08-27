import { Alert, Button, Card, Skeleton, toast } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Check, Share2 } from 'lucide-react';

import { trackTrainingAction } from '~/core/analytics';
import { bodyAreaLabels } from '~/routes/training-plan/exercise-presentation';
import { trainingStyles } from '~/routes/training/styles';
import { trainingCompletionQueryOptions } from '~/routes/training/training-queries';
import type { MockTrainingScenario } from '~/routes/training/training-service';

const styles = trainingStyles();
const weekdayLabels = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const;

export function TrainingCompletionPage({
  mockTraining,
  workoutExecutionId,
}: Readonly<{
  mockTraining: MockTrainingScenario;
  workoutExecutionId: string;
}>) {
  const navigate = useNavigate();
  const query = useQuery(
    trainingCompletionQueryOptions(workoutExecutionId, mockTraining),
  );

  if (query.isPending) {
    return (
      <main aria-label="Carregando conclusão" className={styles.page()}>
        <Skeleton className={styles.skeleton()} />
        <Skeleton className={styles.skeleton()} />
      </main>
    );
  }
  if (query.isError) {
    return (
      <main className={styles.page()}>
        <Alert status="danger">
          <Alert.Title>Conclusão não encontrada</Alert.Title>
          <Alert.Description>
            Não foi possível carregar o resumo deste treino.
          </Alert.Description>
        </Alert>
      </main>
    );
  }

  const completion = query.data;
  const durationMinutes = Math.max(
    1,
    Math.round(completion.durationSeconds / 60),
  );
  const shareText = `${completion.workoutName} concluído: ${durationMinutes} min, ${completion.completedExerciseCount} exercícios e ${completion.totalLoadKg} kg.`;
  const share = async () => {
    trackTrainingAction('training_completion', 'share');
    if (navigator.share !== undefined) {
      try {
        await navigator.share({
          text: shareText,
          title: completion.workoutName,
        });
        trackTrainingAction('training_completion', 'share', 'success');
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        toast.danger('Não foi possível compartilhar o treino.');
        trackTrainingAction('training_completion', 'share', 'error');
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareText);
      toast.success('Resumo copiado para a área de transferência.');
      trackTrainingAction('training_completion', 'share', 'success');
    } catch {
      toast.danger('Não foi possível copiar o resumo.');
      trackTrainingAction('training_completion', 'share', 'error');
    }
  };

  return (
    <main className={styles.page()}>
      <div className={styles.completionCheck()}>
        <Check aria-hidden="true" />
      </div>
      <header className={styles.header()}>
        <h1 className={styles.title()}>{completion.workoutName} finalizado</h1>
        <p className={styles.subtitle()}>
          {completion.fullCompletion
            ? 'Todos os exercícios foram concluídos.'
            : 'Treino finalizado com exercícios pendentes.'}
        </p>
      </header>
      <Card className={styles.card()}>
        <Card.Header>
          <h2>
            {completion.week.completedWorkoutCount} de{' '}
            {completion.week.workoutCount} treinos na semana
          </h2>
        </Card.Header>
        <Card.Content>
          <div
            aria-label="Treinos concluídos por dia"
            className={styles.week()}
          >
            {completion.week.days.map((day, index) => (
              <div className={styles.weekDay()} key={day.date}>
                <span>{weekdayLabels[index]}</span>
                <span
                  className={styles.weekMarker({ completed: day.completed })}
                >
                  {day.completed ? <Check aria-hidden="true" /> : null}
                </span>
              </div>
            ))}
          </div>
        </Card.Content>
      </Card>
      <section className={styles.completionGrid()}>
        <div className={styles.completionMetric()}>
          <span className={styles.metricLabel()}>Exercícios</span>
          <strong className={styles.completionValue()}>
            {completion.completedExerciseCount}/{completion.totalExerciseCount}
          </strong>
          <span>
            {completion.bodyAreas
              .map((area) => bodyAreaLabels[area])
              .join(', ') || 'Nenhuma área registrada'}
          </span>
        </div>
        <div className={styles.completionMetric()}>
          <span className={styles.metricLabel()}>Carga total</span>
          <strong className={styles.completionValue()}>
            {completion.totalLoadKg} kg
          </strong>
        </div>
        <div className={styles.completionMetric()}>
          <span className={styles.metricLabel()}>Duração</span>
          <strong className={styles.completionValue()}>
            {durationMinutes} min
          </strong>
        </div>
      </section>
      <div className={styles.pageActions()}>
        <Button onPress={() => void share()} variant="primary">
          <Share2 aria-hidden="true" className={styles.icon()} />
          Compartilhar
        </Button>
        <Button
          onPress={() =>
            void navigate({
              replace: true,
              search: { mockTraining },
              to: '/training',
            })
          }
          variant="secondary"
        >
          Voltar para treinos
        </Button>
      </div>
    </main>
  );
}
