import { useEffect, useState, useSyncExternalStore } from 'react';

import { Alert, Button, Card, Chip, Skeleton } from '@heroui/react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Dumbbell, ImageOff, Play, Video } from 'lucide-react';

import type { TrainingOverview, TrainingWorkoutCard } from '@dall-fit/types';

import { trackTrainingAction } from '~/core/analytics';
import { useOfflinePreparation } from '~/core/platform/native/offline-preparation-context';
import { bodyAreaLabels } from '~/routes/training-plan/exercise-presentation';
import { trainingStyles } from '~/routes/training/styles';
import { trainingOverviewQueryOptions } from '~/routes/training/training-queries';
import {
  trainingMockSearch,
  type MockTrainingScenario,
} from '~/routes/training/training-service';

const styles = trainingStyles();

export function TrainingOverviewPage({
  mockTraining,
}: Readonly<{ mockTraining: MockTrainingScenario }>) {
  const query = useQuery(trainingOverviewQueryOptions(mockTraining));
  const offlinePreparation = useOfflinePreparation();

  useEffect(() => {
    void offlinePreparation?.enter();
  }, [offlinePreparation]);

  if (offlinePreparation !== null)
    return (
      <NativeTrainingOverview
        mockTraining={mockTraining}
        offlinePreparation={offlinePreparation}
        query={query}
      />
    );

  return <OnlineTrainingOverview mockTraining={mockTraining} query={query} />;
}

function NativeTrainingOverview({
  mockTraining,
  offlinePreparation,
  query,
}: Readonly<{
  mockTraining: MockTrainingScenario;
  offlinePreparation: NonNullable<ReturnType<typeof useOfflinePreparation>>;
  query: UseQueryResult<TrainingOverview, Error>;
}>) {
  const snapshot = useSyncExternalStore(
    offlinePreparation.subscribe,
    offlinePreparation.getSnapshot,
  );
  const [retrying, setRetrying] = useState(false);
  const blocked =
    snapshot.status === 'preparing-data' ||
    snapshot.status === 'expired' ||
    snapshot.status === 'failed';
  let heading = 'Não foi possível preparar seus treinos';
  if (snapshot.status === 'preparing-data') heading = 'Preparando seus treinos';
  if (snapshot.status === 'expired') heading = 'Seus treinos offline expiraram';
  if (blocked)
    return (
      <main className={styles.page()}>
        <Alert status={snapshot.status === 'failed' ? 'danger' : 'default'}>
          <Alert.Title>{heading}</Alert.Title>
          <Alert.Description>
            {snapshot.status === 'preparing-data'
              ? 'Aguarde enquanto os dados essenciais são salvos neste aparelho.'
              : 'Conecte-se à internet para preparar os dados essenciais deste aparelho.'}
          </Alert.Description>
        </Alert>
        <div aria-live="polite" className={styles.pageActions()} role="status">
          {snapshot.status === 'preparing-data'
            ? 'Preparação em andamento.'
            : null}
        </div>
        {snapshot.status !== 'preparing-data' ? (
          <Button
            isDisabled={retrying}
            isPending={retrying}
            onPress={() => {
              setRetrying(true);
              void offlinePreparation.retry().finally(() => setRetrying(false));
            }}
          >
            Tentar novamente
          </Button>
        ) : null}
        <Link className={styles.backLink()} to="/training-plan">
          Ir para Meus planos
        </Link>
      </main>
    );
  return <OnlineTrainingOverview mockTraining={mockTraining} query={query} />;
}

function OnlineTrainingOverview({
  mockTraining,
  query,
}: Readonly<{
  mockTraining: MockTrainingScenario;
  query: UseQueryResult<TrainingOverview, Error>;
}>) {
  const navigate = useNavigate();

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
                search={trainingMockSearch(mockTraining)}
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
              <Chip color="accent" key={bodyArea} size="sm" variant="soft">
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
        <span aria-hidden="true" className={styles.mediaOverlay()}>
          <Play className={styles.icon()} />
        </span>
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
