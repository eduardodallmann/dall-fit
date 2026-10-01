import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  Alert,
  AlertDialog,
  Button,
  Card,
  Chip,
  Skeleton,
} from '@heroui/react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Dumbbell, ImageOff, Play, Video } from 'lucide-react';

import type { TrainingOverview, TrainingWorkoutCard } from '@dall-fit/types';

import { trackTrainingAction } from '~/core/analytics';
import { useOfflinePreparation } from '~/core/platform/native/offline-preparation-context';
import type {
  OfflineCompletionPresentation,
  OfflineSyncAction,
} from '~/core/platform/native/offline-storage-plugin';
import type { OfflineSyncSnapshot } from '~/core/platform/native/offline-sync';
import { useOfflineSync } from '~/core/platform/native/offline-sync-context';
import { bodyAreaLabels } from '~/routes/training-plan/exercise-presentation';
import { createHttpTrainingRepository } from '~/routes/training/http-training-repository';
import { trainingStyles } from '~/routes/training/styles';
import { trainingOverviewQueryOptions } from '~/routes/training/training-queries';
import { useNativeTrainingRepository } from '~/routes/training/training-repository';
import {
  trainingMockSearch,
  type MockTrainingScenario,
} from '~/routes/training/training-service';

const styles = trainingStyles();

export function TrainingOverviewPage({
  catalogEntryId,
  mockTraining,
}: Readonly<{
  catalogEntryId?: string;
  mockTraining: MockTrainingScenario;
}>) {
  const nativeRepository = useNativeTrainingRepository();
  const httpRepository = useMemo(
    () => createHttpTrainingRepository(mockTraining),
    [mockTraining],
  );
  const repository = nativeRepository ?? httpRepository;
  const query = useQuery(
    trainingOverviewQueryOptions(repository, mockTraining, catalogEntryId),
  );
  const refetch = query.refetch;
  const offlinePreparation = useOfflinePreparation();
  const offlineSync = useOfflineSync();

  useEffect(() => {
    void offlinePreparation?.enter().finally(() => void refetch());
  }, [offlinePreparation, refetch]);

  if (offlinePreparation !== null)
    return (
      <NativeTrainingOverview
        mockTraining={mockTraining}
        catalogEntryId={catalogEntryId}
        offlinePreparation={offlinePreparation}
        offlineSync={offlineSync}
        query={query}
        repository={repository}
      />
    );

  return (
    <OnlineTrainingOverview
      catalogEntryId={catalogEntryId}
      mockTraining={mockTraining}
      query={query}
    />
  );
}

function NativeTrainingOverview({
  mockTraining,
  catalogEntryId,
  offlinePreparation,
  offlineSync,
  query,
  repository,
}: Readonly<{
  mockTraining: MockTrainingScenario;
  catalogEntryId?: string;
  offlinePreparation: NonNullable<ReturnType<typeof useOfflinePreparation>>;
  offlineSync: ReturnType<typeof useOfflineSync>;
  query: UseQueryResult<TrainingOverview, Error>;
  repository: NonNullable<ReturnType<typeof useNativeTrainingRepository>>;
}>) {
  const navigate = useNavigate();
  const snapshot = useSyncExternalStore(
    offlinePreparation.subscribe,
    offlinePreparation.getSnapshot,
  );
  const [retrying, setRetrying] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const syncSnapshot = useSyncExternalStore(
    offlineSync?.subscribe ?? emptySubscribe,
    offlineSync?.getSnapshot ?? emptySyncSnapshot,
  );
  const activeWorkout = query.data?.workouts.find(
    (workout) => workout.indicator === 'in-progress',
  );
  const blocked =
    syncSnapshot.action === undefined &&
    (snapshot.status === 'preparing-data' ||
      snapshot.status === 'takeover-required' ||
      snapshot.status === 'expired' ||
      snapshot.status === 'failed');
  if (blocked)
    return (
      <NativePreparationGate
        coordinator={offlinePreparation}
        isPending={retrying}
        onPendingChange={setRetrying}
        status={snapshot.status}
      />
    );
  return (
    <>
      <OnlineTrainingOverview
        completion={syncSnapshot.completion}
        catalogEntryId={catalogEntryId}
        mockTraining={mockTraining}
        query={query}
      />
      {offlineSync === null ? null : (
        <>
          <NativeRecoveryDialog
            action={syncSnapshot.action}
            key={`${syncSnapshot.action?.executionId ?? 'none'}:${syncSnapshot.action?.revision ?? 0}`}
            onDiscard={(action) => offlineSync.discard(action)}
            onResolve={(action, choice, token) =>
              offlineSync.resolveConflict(action, choice, token)
            }
          />
          <NotificationPermissionDialog
            isOpen={
              syncSnapshot.action === undefined &&
              syncSnapshot.notificationPrompt === true &&
              (snapshot.status === 'ready' ||
                snapshot.status === 'data-ready-media-in-progress' ||
                snapshot.status === 'ready-media-incomplete')
            }
            onFinish={(requestPermission) =>
              offlineSync.finishNotificationPrompt(requestPermission)
            }
          />
        </>
      )}
      <AlertDialog isOpen={activeWorkout !== undefined}>
        <AlertDialog.Backdrop isDismissable={false} isKeyboardDismissDisabled>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>Treino em andamento</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Continue o treino salvo neste aparelho ou descarte o progresso
                para liberar uma nova execução.
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  isDisabled={discarding}
                  onPress={() => {
                    if (activeWorkout === undefined) return;
                    void navigate({
                      params: { workoutId: activeWorkout.id },
                      search: trainingMockSearch(mockTraining),
                      to: '/training/workout/$workoutId',
                    });
                  }}
                  variant="primary"
                >
                  Continuar treino
                </Button>
                <Button
                  isPending={discarding}
                  onPress={() => {
                    setDiscarding(true);
                    void repository
                      .abandonSession()
                      .then(() => query.refetch())
                      .finally(() => setDiscarding(false));
                  }}
                  variant="danger"
                >
                  Descartar treino
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}

function OnlineTrainingOverview({
  catalogEntryId,
  completion,
  mockTraining,
  query,
}: Readonly<{
  completion?: OfflineCompletionPresentation;
  catalogEntryId?: string;
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

  if (query.data.plan === null && query.data.availablePlans.length === 0) {
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

  if (query.data.plan === null) {
    return (
      <main className={styles.page()}>
        <header className={styles.header()}>
          <h1 className={styles.title()}>Escolha um plano</h1>
          <p className={styles.subtitle()}>
            Selecione qual dos seus planos em uso deseja treinar agora.
          </p>
        </header>
        <ol aria-label="Planos em uso" className={styles.cardList()}>
          {query.data.availablePlans.map((plan) => (
            <li key={plan.catalogEntryId}>
              <Link
                className={styles.cardLink()}
                search={{
                  ...trainingMockSearch(mockTraining),
                  catalogEntryId: plan.catalogEntryId,
                }}
                to="/training"
              >
                <Card className={styles.card()}>
                  <Card.Content>
                    <h2 className={styles.cardTitle()}>{plan.name}</h2>
                    <p className={styles.exerciseMeta()}>
                      {plan.source === 'owned'
                        ? 'Plano próprio'
                        : 'Modelo disponibilizado'}{' '}
                      · {plan.workoutCount}{' '}
                      {plan.workoutCount === 1 ? 'treino' : 'treinos'}
                    </p>
                  </Card.Content>
                </Card>
              </Link>
            </li>
          ))}
        </ol>
      </main>
    );
  }

  return (
    <main className={styles.page()}>
      {completion === undefined ? null : (
        <LatestCompletionCard completion={completion} />
      )}
      <header className={styles.header()}>
        <h1 className={styles.title()}>{query.data.plan.name}</h1>
        <p className={styles.subtitle()}>Selecione o treino</p>
      </header>
      {query.data.availablePlans.length > 1 ? (
        <Link
          className={styles.backLink()}
          search={trainingMockSearch(mockTraining)}
          to="/training"
        >
          Escolher outro plano
        </Link>
      ) : null}
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
                search={{
                  ...trainingMockSearch(mockTraining),
                  ...(catalogEntryId === undefined ? {} : { catalogEntryId }),
                }}
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

function LatestCompletionCard({
  completion,
}: Readonly<{ completion: OfflineCompletionPresentation }>) {
  const value = completion.presentation;
  return (
    <Card className={styles.provisionalCard()}>
      <div className={styles.provisionalHeader()}>
        <div>
          <p className={styles.exerciseMeta()}>Último treino concluído</p>
          <h2 className={styles.cardTitle()}>{value.workoutName}</h2>
        </div>
        <Chip color={completion.status === 'pending' ? 'warning' : 'success'}>
          {completion.status === 'pending'
            ? 'Aguardando sincronização'
            : 'Sincronizado'}
        </Chip>
      </div>
      <p className={styles.exerciseMeta()}>
        {value.completedExerciseCount} de {value.totalExerciseCount} exercícios
        concluídos ·{' '}
        {value.fullCompletion ? 'Treino completo' : 'Treino parcial'}
      </p>
      <time className={styles.exerciseMeta()} dateTime={value.completedAt}>
        Concluído em {new Date(value.completedAt).toLocaleString('pt-BR')}
      </time>
    </Card>
  );
}

function NativePreparationGate({
  coordinator,
  isPending,
  onPendingChange,
  status,
}: Readonly<{
  coordinator: NonNullable<ReturnType<typeof useOfflinePreparation>>;
  isPending: boolean;
  onPendingChange: (pending: boolean) => void;
  status: ReturnType<
    NonNullable<ReturnType<typeof useOfflinePreparation>>['getSnapshot']
  >['status'];
}>) {
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const preparing = status === 'preparing-data';
  const takeover = status === 'takeover-required';
  let heading = 'Não foi possível preparar seus treinos';
  let description =
    'Conecte-se à internet para preparar os dados essenciais deste aparelho.';
  if (preparing) {
    heading = 'Preparando seus treinos';
    description =
      'Aguarde enquanto os dados essenciais são salvos neste aparelho.';
  }
  if (status === 'expired') heading = 'Seus treinos offline expiraram';
  if (takeover) {
    heading = 'Outro aparelho está com os treinos offline';
    description =
      'Você pode tornar este aparelho o único editor offline. O outro aparelho deixará de sincronizar.';
  }
  const retry = () => {
    onPendingChange(true);
    void coordinator.retry().finally(() => onPendingChange(false));
  };
  const confirmTakeover = () => {
    onPendingChange(true);
    void coordinator.takeover().finally(() => {
      onPendingChange(false);
      setTakeoverOpen(false);
    });
  };
  return (
    <main className={styles.page()}>
      <Alert status={status === 'failed' ? 'danger' : 'default'}>
        <Alert.Title>{heading}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert>
      <div aria-live="polite" className={styles.pageActions()} role="status">
        {preparing ? 'Preparação em andamento.' : null}
      </div>
      {takeover ? (
        <Button onPress={() => setTakeoverOpen(true)} variant="primary">
          Usar este aparelho
        </Button>
      ) : null}
      {!takeover && !preparing ? (
        <Button isDisabled={isPending} isPending={isPending} onPress={retry}>
          Tentar novamente
        </Button>
      ) : null}
      <Link className={styles.backLink()} to="/training-plan">
        Ir para Meus planos
      </Link>
      <AlertDialog isOpen={takeoverOpen} onOpenChange={setTakeoverOpen}>
        <AlertDialog.Backdrop isDismissable={false} isKeyboardDismissDisabled>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  Transferir o acesso offline?
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Este aparelho passará a ser o único editor offline. O outro não
                poderá mais enviar alterações locais.
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  onPress={() => setTakeoverOpen(false)}
                  variant="secondary"
                >
                  Manter outro aparelho
                </Button>
                <Button
                  isPending={isPending}
                  onPress={confirmTakeover}
                  variant="danger"
                >
                  Confirmar transferência
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </main>
  );
}

function NativeRecoveryDialog({
  action,
  onDiscard,
  onResolve,
}: Readonly<{
  action?: OfflineSyncAction;
  onDiscard: (action: OfflineSyncAction) => Promise<boolean>;
  onResolve: (
    action: OfflineSyncAction,
    choice: 'local' | 'server',
    token: string,
  ) => Promise<boolean>;
}>) {
  if (action === undefined) return null;
  const conflictDetails =
    action.reason === 'conflict' &&
    action.details?.allowedResolution === 'local-or-server'
      ? action.details
      : undefined;
  if (conflictDetails !== undefined)
    return (
      <ConflictRecoveryDialog
        action={action}
        conflictDetails={conflictDetails}
        onResolve={onResolve}
      />
    );
  return <DiscardRecoveryDialog action={action} onDiscard={onDiscard} />;
}

function ConflictRecoveryDialog({
  action,
  conflictDetails,
  onResolve,
}: Readonly<{
  action: OfflineSyncAction;
  conflictDetails: Extract<
    NonNullable<OfflineSyncAction['details']>,
    { allowedResolution: 'local-or-server' }
  >;
  onResolve: (
    action: OfflineSyncAction,
    choice: 'local' | 'server',
    token: string,
  ) => Promise<boolean>;
}>) {
  const [choice, setChoice] = useState<'local' | 'server' | null>(null);
  const [pending, setPending] = useState(false);
  if (choice === null)
    return (
      <AlertDialog isOpen>
        <AlertDialog.Backdrop isDismissable={false} isKeyboardDismissDisabled>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  Escolha qual versão manter
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <div className={styles.comparisonGrid()}>
                  <section aria-label="Dados deste aparelho">
                    <h3>Dados deste aparelho</h3>
                    <pre className={styles.comparisonPanel()}>
                      {JSON.stringify(action.local, null, 2)}
                    </pre>
                  </section>
                  <section aria-label="Dados do servidor">
                    <h3>Dados do servidor</h3>
                    <pre className={styles.comparisonPanel()}>
                      {JSON.stringify(conflictDetails.serverVersion, null, 2)}
                    </pre>
                  </section>
                </div>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button onPress={() => setChoice('local')} variant="primary">
                  Usar dados deste aparelho
                </Button>
                <Button onPress={() => setChoice('server')} variant="secondary">
                  Usar dados do servidor
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    );
  const discardedVersion =
    choice === 'local' ? 'do servidor' : 'deste aparelho';
  const confirm = () => {
    setPending(true);
    void onResolve(action, choice, conflictDetails.conflictToken).finally(() =>
      setPending(false),
    );
  };
  return (
    <AlertDialog isOpen>
      <AlertDialog.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>Confirmar substituição?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              A versão {discardedVersion} será descartada por inteiro. Esta ação
              não pode ser desfeita.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                isDisabled={pending}
                onPress={() => setChoice(null)}
                variant="secondary"
              >
                Voltar à comparação
              </Button>
              <Button isPending={pending} onPress={confirm} variant="danger">
                Confirmar escolha
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

function DiscardRecoveryDialog({
  action,
  onDiscard,
}: Readonly<{
  action: OfflineSyncAction;
  onDiscard: (action: OfflineSyncAction) => Promise<boolean>;
}>) {
  const [pending, setPending] = useState(false);
  let title = 'A execução já foi encerrada no servidor';
  if (action.reason === 'lease-revoked')
    title = 'Este aparelho perdeu o acesso offline';
  if (action.reason === 'lease-expired') title = 'Os dados offline expiraram';
  const discard = () => {
    setPending(true);
    void onDiscard(action).finally(() => setPending(false));
  };
  return (
    <AlertDialog isOpen>
      <AlertDialog.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Os dados locais vinculados a esta execução não podem ser enviados.
              Confirme o descarte para continuar.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button isPending={pending} onPress={discard} variant="danger">
                Descartar dados deste aparelho
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

function NotificationPermissionDialog({
  isOpen,
  onFinish,
}: Readonly<{
  isOpen: boolean;
  onFinish: (requestPermission: boolean) => Promise<void>;
}>) {
  const [pending, setPending] = useState(false);
  const finish = (requestPermission: boolean) => {
    setPending(true);
    void onFinish(requestPermission).finally(() => setPending(false));
  };
  return (
    <AlertDialog isOpen={isOpen}>
      <AlertDialog.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>
                Avisar quando você precisar agir?
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              O Dall Fit pode enviar um aviso discreto quando for necessário
              entrar novamente ou resolver um conflito. Negar não desativa seus
              treinos.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                isDisabled={pending}
                onPress={() => finish(false)}
                variant="secondary"
              >
                Agora não
              </Button>
              <Button
                isPending={pending}
                onPress={() => finish(true)}
                variant="primary"
              >
                Permitir avisos
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

const emptySubscribe = () => () => undefined;
const emptySnapshot: OfflineSyncSnapshot = {};
const emptySyncSnapshot = () => emptySnapshot;

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
