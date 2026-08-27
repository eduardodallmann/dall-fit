import { Alert, Button, Card, Chip, Skeleton } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Dumbbell, ImageOff, Play, Video } from 'lucide-react';

import type { TrainingWorkoutCard } from '@dall-fit/types';

import { trackTrainingAction } from '~/core/analytics';
import { bodyAreaLabels } from '~/routes/training-plan/exercise-presentation';
import { trainingStyles } from '~/routes/training/styles';
import { trainingOverviewQueryOptions } from '~/routes/training/training-queries';
import type { MockTrainingScenario } from '~/routes/training/training-service';

const styles = trainingStyles();

export function TrainingOverviewPage({
  mockTraining,
}: Readonly<{ mockTraining: MockTrainingScenario }>) {
  const navigate = useNavigate();
  const query = useQuery(trainingOverviewQueryOptions(mockTraining));

  if (query.isPending) {
    return (
      <main aria-label="Carregando treinos" className={styles.page()}>
        <Skeleton className={styles.skeleton()} />
        <Skeleton className={styles.skeleton()} />
      </main>
    );
  }

  if (query.isError) {
    return (
      <main className={styles.page()}>
        <Alert status="danger">
          <Alert.Title>Não foi possível carregar seus treinos</Alert.Title>
          <Alert.Description>
            Verifique sua conexão e tente novamente.
          </Alert.Description>
        </Alert>
        <Button
          onPress={() => {
            trackTrainingAction('training', 'retry');
            void query.refetch();
          }}
        >
          Tentar novamente
        </Button>
      </main>
    );
  }

  if (query.data.plan === null) {
    return (
      <main className={styles.page()}>
        <section className={styles.empty()}>
          <Dumbbell aria-hidden="true" className={styles.icon()} />
          <div className={styles.header()}>
            <h1 className={styles.title()}>Nenhum plano em uso</h1>
            <p className={styles.subtitle()}>
              Escolha um dos seus planos para começar a treinar.
            </p>
          </div>
          <Button
            onPress={() => void navigate({ to: '/training-plan' })}
            variant="primary"
          >
            Ir para Meus planos
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page()}>
      <header className={styles.header()}>
        <h1 className={styles.title()}>{query.data.plan.name}</h1>
        <p className={styles.subtitle()}>Selecione o treino</p>
      </header>
      {query.data.workouts.length === 0 ? (
        <section className={styles.empty()}>
          <Dumbbell aria-hidden="true" className={styles.icon()} />
          <p>Este plano ainda não possui treinos.</p>
          <Button onPress={() => void navigate({ to: '/training-plan' })}>
            Ir para Meus planos
          </Button>
        </section>
      ) : (
        <ol aria-label="Treinos do plano" className={styles.cardList()}>
          {query.data.workouts.map((workout) => (
            <li key={workout.id}>
              <Link
                className={styles.cardLink()}
                onClick={() =>
                  trackTrainingAction('training', 'select_workout')
                }
                params={{ workoutId: workout.id }}
                search={{ mockTraining }}
                to="/training/workout/$workoutId"
              >
                <WorkoutCard workout={workout} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

function WorkoutCard({ workout }: Readonly<{ workout: TrainingWorkoutCard }>) {
  return (
    <Card className={styles.card()} variant="secondary">
      <div className={styles.cardButton()}>
        <WorkoutMedia workout={workout} />
        <div className={styles.cardText()}>
          <h2 className={styles.cardTitle()}>{workout.name}</h2>
          <div className={styles.bodyAreas()}>
            {workout.bodyAreas.map((bodyArea) => (
              <Chip key={bodyArea} size="sm" variant="soft">
                {bodyAreaLabels[bodyArea]}
              </Chip>
            ))}
          </div>
        </div>
        {workout.indicator === null ? null : (
          <Chip color="accent" size="sm" variant="soft">
            {workout.indicator === 'current' ? 'Atual' : 'Em andamento'}
          </Chip>
        )}
      </div>
    </Card>
  );
}

function WorkoutMedia({ workout }: Readonly<{ workout: TrainingWorkoutCard }>) {
  if (workout.media?.type === 'image') {
    return (
      <div className={styles.cardMedia()}>
        <img
          alt=""
          className={styles.cardMediaImage()}
          referrerPolicy="no-referrer"
          src={workout.media.image.thumbnailUrl}
        />
      </div>
    );
  }
  if (
    workout.media?.type === 'youtube-long' ||
    workout.media?.type === 'youtube-short'
  ) {
    return (
      <div className={styles.cardMedia()}>
        <img
          alt=""
          className={styles.cardMediaImage()}
          referrerPolicy="no-referrer"
          src={`https://img.youtube.com/vi/${workout.media.youtubeId}/mqdefault.jpg`}
        />
        <Play aria-hidden="true" className={styles.icon()} />
      </div>
    );
  }
  return (
    <div className={styles.cardMedia()}>
      {workout.media === null ? (
        <ImageOff aria-hidden="true" className={styles.icon()} />
      ) : (
        <Video aria-hidden="true" className={styles.icon()} />
      )}
    </div>
  );
}
