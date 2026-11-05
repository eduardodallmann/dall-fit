import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  AlertDialog,
  Button,
  Card,
  Chip,
  NumberField,
  Skeleton,
  toast,
} from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Check, ChevronDown, ChevronUp, Circle } from 'lucide-react';

import type {
  TrainingExerciseExecution,
  TrainingExercisePreview,
  TrainingSession,
} from '@dall-fit/types';

import {
  getActiveSessionGeneration,
  isSessionGenerationActive,
} from '~/auth/session-lifecycle';
import { trackTrainingAction } from '~/core/analytics';
import { classifyHttpFailure, getApiErrorCode } from '~/core/http/http-error';
import { NativeTrainingRepositoryError } from '~/core/platform/native/native-training-repository';
import { useReloadBlocker } from '~/core/reload-safety/reload-safety-context';
import { dashboardKeys } from '~/routes/dashboard/dashboard-queries';
import {
  bodyAreaLabels,
  exerciseTypeIcons,
  exerciseTypeLabels,
} from '~/routes/training-plan/exercise-presentation';
import { createHttpTrainingRepository } from '~/routes/training/http-training-repository';
import { TrainingMediaViewer } from '~/routes/training/media-viewer';
import { trainingStyles } from '~/routes/training/styles';
import { TrainingTimerOverlay } from '~/routes/training/timer-overlay';
import {
  trainingKeys,
  trainingPreviewQueryOptions,
  trainingSessionQueryOptions,
} from '~/routes/training/training-queries';
import {
  useNativeTrainingRepository,
  type TrainingRepository,
} from '~/routes/training/training-repository';
import {
  trainingMockSearch,
  type MockTrainingScenario,
} from '~/routes/training/training-service';
import { useTimerResolution } from '~/routes/training/use-timer-resolution';

const styles = trainingStyles();

function trainingErrorCode(error: unknown): string | undefined {
  return error instanceof NativeTrainingRepositoryError
    ? error.code
    : getApiErrorCode(error);
}

type SessionAction =
  | {
      exerciseId: string;
      loadKg: number | null;
      seriesNumber: number;
      type: 'complete-series' | 'load';
    }
  | {
      exerciseId: string;
      loadsKg: readonly (number | null)[];
      type: 'complete-remaining';
    }
  | {
      exerciseId: string;
      kind: 'duration' | 'pause';
      type: 'start-timer';
    }
  | { exerciseId: string; type: 'complete-exercise' | 'restart-exercise' };

interface TrainingWorkoutPageProps {
  catalogEntryId?: string;
  mockTraining: MockTrainingScenario;
  workoutId: string;
}

export function TrainingWorkoutPage({
  catalogEntryId,
  mockTraining,
  workoutId,
}: Readonly<TrainingWorkoutPageProps>) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const nativeRepository = useNativeTrainingRepository();
  const httpRepository = useMemo(
    () => createHttpTrainingRepository(mockTraining),
    [mockTraining],
  );
  const repository = nativeRepository ?? httpRepository;
  const previewQuery = useQuery(
    trainingPreviewQueryOptions(
      workoutId,
      repository,
      mockTraining,
      catalogEntryId,
    ),
  );
  const sessionOptions = trainingSessionQueryOptions(repository, mockTraining);
  const sessionQuery = useQuery(sessionOptions);
  const [discardOpen, setDiscardOpen] = useState(false);
  const expiredHandled = useRef(false);
  const session = sessionQuery.data;
  const sessionNotFound =
    sessionQuery.isError &&
    trainingErrorCode(sessionQuery.error) === 'WORKOUT_SESSION_NOT_FOUND';
  const sessionExpired =
    sessionQuery.isError &&
    trainingErrorCode(sessionQuery.error) === 'WORKOUT_SESSION_EXPIRED';
  const startMutation = useMutation({
    mutationFn: () => repository.startSession(workoutId, catalogEntryId),
    onSuccess: (data) => {
      queryClient.setQueryData(sessionOptions.queryKey, data);
      trackTrainingAction('training_workout', 'start_workout', 'success');
    },
    onError: () => {
      trackTrainingAction('training_workout', 'start_workout', 'error');
      toast.danger('Não foi possível iniciar o treino.');
    },
  });
  const discardMutation = useMutation({
    mutationFn: async () => {
      await repository.abandonSession();
      return repository.startSession(workoutId, catalogEntryId);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(sessionOptions.queryKey, data);
      setDiscardOpen(false);
      trackTrainingAction('training_workout', 'abandon', 'success');
    },
    onError: () => {
      trackTrainingAction('training_workout', 'abandon', 'error');
      toast.danger('Não foi possível trocar o treino em andamento.');
    },
  });

  useEffect(() => {
    if (!sessionExpired || expiredHandled.current) return;
    expiredHandled.current = true;
    toast.warning('Seu treino em andamento expirou');
    void navigate({
      replace: true,
      search: trainingMockSearch('active-plan'),
      to: '/training',
    });
  }, [navigate, sessionExpired]);

  if (previewQuery.isPending || sessionQuery.isPending || sessionExpired) {
    return (
      <main aria-label="Carregando treino" className={styles.page()}>
        <Skeleton className={styles.skeleton()} />
        <Skeleton className={styles.skeleton()} />
      </main>
    );
  }

  if (previewQuery.isError || (sessionQuery.isError && !sessionNotFound)) {
    return (
      <main className={styles.page()}>
        <Alert status="danger">
          <Alert.Title>Não foi possível carregar o treino</Alert.Title>
          <Alert.Description>
            Verifique sua conexão e tente novamente.
          </Alert.Description>
        </Alert>
      </main>
    );
  }

  if (session !== undefined && session.workout.id === workoutId) {
    return (
      <ActiveWorkout
        key={session.id}
        mockTraining={mockTraining}
        repository={repository}
        session={session}
        sessionQueryKey={sessionOptions.queryKey}
      />
    );
  }

  if (session !== undefined && session.workout.id !== workoutId) {
    return (
      <main className={styles.page()}>
        <Link
          className={styles.backLink()}
          search={{
            ...trainingMockSearch(mockTraining),
            ...(catalogEntryId === undefined ? {} : { catalogEntryId }),
          }}
          to="/training"
        >
          Voltar para treinos
        </Link>
        <header className={styles.header()}>
          <h1 className={styles.title()}>{previewQuery.data.workout.name}</h1>
          <p className={styles.subtitle()}>
            {session.workout.name} já está em andamento.
          </p>
        </header>
        <div className={styles.pageActions()}>
          <Button
            onPress={() =>
              void navigate({
                params: { workoutId: session.workout.id },
                search: trainingMockSearch(mockTraining),
                to: '/training/workout/$workoutId',
              })
            }
            variant="primary"
          >
            Retomar treino
          </Button>
          <Button onPress={() => setDiscardOpen(true)} variant="danger">
            Descartar e iniciar este
          </Button>
        </div>
        <PreviewExercises exercises={previewQuery.data.exercises} />
        <AlertDialog isOpen={discardOpen} onOpenChange={setDiscardOpen}>
          <AlertDialog.Backdrop>
            <AlertDialog.Container>
              <AlertDialog.Dialog>
                <AlertDialog.Header>
                  <AlertDialog.Heading>
                    Descartar treino em andamento?
                  </AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  O progresso de {session.workout.name} será perdido.
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button
                    isDisabled={discardMutation.isPending}
                    onPress={() => setDiscardOpen(false)}
                    variant="secondary"
                  >
                    Manter treino
                  </Button>
                  <Button
                    isPending={discardMutation.isPending}
                    onPress={() => {
                      trackTrainingAction('training_workout', 'abandon');
                      discardMutation.mutate();
                    }}
                    variant="danger"
                  >
                    Descartar e iniciar
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      </main>
    );
  }

  return (
    <main className={styles.page()}>
      <Link
        className={styles.backLink()}
        search={{
          ...trainingMockSearch(mockTraining),
          ...(catalogEntryId === undefined ? {} : { catalogEntryId }),
        }}
        to="/training"
      >
        Voltar para treinos
      </Link>
      <header className={styles.header()}>
        <h1 className={styles.title()}>{previewQuery.data.workout.name}</h1>
        <p className={styles.subtitle()}>
          Confira os exercícios antes de começar.
        </p>
      </header>
      <PreviewExercises exercises={previewQuery.data.exercises} />
      <Button
        isPending={startMutation.isPending}
        onPress={() => {
          trackTrainingAction('training_workout', 'start_workout');
          startMutation.mutate();
        }}
        variant="primary"
      >
        Iniciar treino
      </Button>
    </main>
  );
}

function PreviewExercises({
  exercises,
}: Readonly<{ exercises: readonly TrainingExercisePreview[] }>) {
  return (
    <ol aria-label="Exercícios do treino" className={styles.exerciseList()}>
      {exercises.map((exercise, index) => {
        const Icon = exerciseTypeIcons[exercise.type];
        return (
          <li key={exercise.id}>
            <Card className={styles.exerciseCard()} variant="secondary">
              <div className={styles.cardButton()}>
                <div className={styles.exerciseIdentity()}>
                  <span className={styles.indicator()}>{index + 1}</span>
                  <Icon aria-hidden="true" className={styles.icon()} />
                  <div className={styles.cardText()}>
                    <h2 className={styles.exerciseHeading()}>
                      {'name' in exercise ? exercise.name : 'Pausa'}
                    </h2>
                    <ExerciseSummary exercise={exercise} preview />
                  </div>
                </div>
                <Chip size="sm" variant="soft">
                  {exerciseTypeLabels[exercise.type]}
                </Chip>
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

function ActiveWorkout({
  mockTraining,
  repository,
  session,
  sessionQueryKey,
}: Readonly<{
  mockTraining: MockTrainingScenario;
  repository: TrainingRepository;
  session: TrainingSession;
  sessionQueryKey: readonly unknown[];
}>) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(
    session.exercises.find((exercise) => exercise.completedAt === null)?.id ??
      null,
  );
  const [drafts, setDrafts] = useState<Record<string, number | null>>(() =>
    sessionDrafts(session),
  );
  const [finishOpen, setFinishOpen] = useState(false);
  const debounceTimers = useRef(new Map<string, number>());
  const [hasPendingDraft, setHasPendingDraft] = useState(false);

  const focusExercise = (exerciseId: string) => {
    const generation = getActiveSessionGeneration();
    window.requestAnimationFrame(() => {
      if (
        isSessionGenerationActive(generation) &&
        queryClient.getQueryData<TrainingSession>(sessionQueryKey)?.id ===
          session.id
      )
        document.getElementById(`training-exercise-${exerciseId}`)?.focus();
    });
  };

  const executeSessionAction = async (action: SessionAction) => {
    const current = queryClient.getQueryData<TrainingSession>(sessionQueryKey);
    const version = current?.version ?? session.version;
    switch (action.type) {
      case 'load':
        return repository.saveLoad(
          action.exerciseId,
          action.seriesNumber,
          action.loadKg,
          version,
        );
      case 'complete-series':
        return repository.completeSeries(
          action.exerciseId,
          action.seriesNumber,
          action.loadKg,
          version,
        );
      case 'complete-remaining':
        return repository.completeRemainingSeries(
          action.exerciseId,
          action.loadsKg,
          version,
        );
      case 'start-timer':
        return repository.startTimer(action.exerciseId, action.kind, version);
      case 'complete-exercise':
        return repository.completeExercise(action.exerciseId, version);
      case 'restart-exercise':
        return repository.restartExercise(action.exerciseId, version);
    }
  };
  const handleSessionSuccess = (
    data: TrainingSession,
    action: SessionAction,
  ) => {
    trackTrainingAction(
      'training_workout',
      trainingActionName(action),
      'success',
    );
    applySession(data);
  };
  const applySession = (data: TrainingSession, exerciseId = expandedId) => {
    queryClient.setQueryData(sessionQueryKey, data);
    const completed = data.exercises.find(
      (exercise) => exercise.id === exerciseId,
    )?.completedAt;
    if (completed !== null && completed !== undefined) {
      const next = data.exercises.find(
        (exercise) => exercise.completedAt === null,
      );
      setExpandedId(next?.id ?? null);
      if (next !== undefined) focusExercise(next.id);
    }
    if (data.exercises.every((exercise) => exercise.completedAt !== null))
      setFinishOpen(true);
  };
  const handleSessionError = async (error: unknown, action: SessionAction) => {
    trackTrainingAction(
      'training_workout',
      trainingActionName(action),
      'error',
    );
    await recoverSessionError(error);
  };
  const recoverSessionError = async (error: unknown) => {
    const generation = getActiveSessionGeneration();
    if (
      trainingErrorCode(error) === 'WORKOUT_SESSION_VERSION_CONFLICT' &&
      (error instanceof NativeTrainingRepositoryError ||
        classifyHttpFailure(error).status === 409)
    ) {
      try {
        const canonical = await queryClient.fetchQuery({
          ...trainingSessionQueryOptions(repository, mockTraining),
          staleTime: 0,
        });
        if (
          !isSessionGenerationActive(generation) ||
          canonical.id !== session.id
        )
          return;
        setDrafts(sessionDrafts(canonical));
        clearDebounces(debounceTimers.current);
        setHasPendingDraft(false);
        toast.warning('O treino foi atualizado em outro lugar.');
        return;
      } catch {
        if (!isSessionGenerationActive(generation)) return;
        toast.danger('Não foi possível atualizar o treino. Tente novamente.');
        return;
      }
    }
    toast.danger('Não foi possível salvar o progresso.');
  };
  const loadMutation = useMutation({
    mutationFn: executeSessionAction,
    mutationKey: ['training-session-write', session.id],
    scope: { id: session.id },
    onError: handleSessionError,
    onSuccess: handleSessionSuccess,
  });
  const actionMutation = useMutation({
    mutationFn: executeSessionAction,
    mutationKey: ['training-session-write', session.id],
    scope: { id: session.id },
    onError: handleSessionError,
    onSuccess: handleSessionSuccess,
  });
  const timerResolution = useTimerResolution({
    onError: recoverSessionError,
    onSuccess: (data) => {
      const exerciseId = session.activeTimer?.exerciseId;
      applySession(data, exerciseId);
      if (
        session.activeTimer?.kind === 'series-rest' &&
        exerciseId !== undefined
      )
        focusExercise(exerciseId);
    },
    repository,
    session,
    sessionQueryKey,
  });
  const completeMutation = useMutation({
    mutationFn: (confirmIncomplete: boolean) =>
      repository.completeSession(
        confirmIncomplete,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        queryClient.getQueryData<TrainingSession>(sessionQueryKey)?.version ??
          session.version,
      ),
    mutationKey: ['training-session-write', session.id],
    scope: { id: session.id },
    onSuccess: (completion) => {
      queryClient.removeQueries({ queryKey: sessionQueryKey });
      void queryClient.invalidateQueries({ queryKey: trainingKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      if (completion === null) {
        void navigate({
          replace: true,
          search: trainingMockSearch(mockTraining),
          to: '/training',
        });
        trackTrainingAction('training_workout', 'complete_workout', 'success');
        return;
      }
      void navigate({
        params: { workoutExecutionId: completion.id },
        replace: true,
        search: trainingMockSearch(mockTraining),
        to: '/training/completion/$workoutExecutionId',
      });
      trackTrainingAction('training_workout', 'complete_workout', 'success');
    },
    onError: async (error) => {
      trackTrainingAction('training_workout', 'complete_workout', 'error');
      if (trainingErrorCode(error) === 'WORKOUT_SESSION_VERSION_CONFLICT') {
        const canonical = await queryClient.fetchQuery({
          ...trainingSessionQueryOptions(repository, mockTraining),
          staleTime: 0,
        });
        setDrafts(sessionDrafts(canonical));
        clearDebounces(debounceTimers.current);
        setHasPendingDraft(false);
        setFinishOpen(false);
        toast.warning('O treino foi atualizado em outro lugar.');
        return;
      }
      toast.danger('Não foi possível finalizar o treino.');
    },
  });
  useReloadBlocker(
    hasPendingDraft ||
      loadMutation.isPending ||
      actionMutation.isPending ||
      timerResolution.isPending ||
      completeMutation.isPending,
  );

  useEffect(() => () => clearDebounces(debounceTimers.current), []);

  const setLoad = (
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
  ) => {
    const key = draftKey(exerciseId, seriesNumber);
    setDrafts((current) => ({ ...current, [key]: loadKg }));
    const previous = debounceTimers.current.get(key);
    if (previous !== undefined) window.clearTimeout(previous);
    if (!isValidLoad(loadKg)) {
      debounceTimers.current.delete(key);
      setHasPendingDraft(true);
      return;
    }
    const timer = window.setTimeout(() => {
      debounceTimers.current.delete(key);
      setHasPendingDraft(debounceTimers.current.size > 0);
      loadMutation.mutate({
        exerciseId,
        loadKg,
        seriesNumber,
        type: 'load',
      });
    }, 500);
    debounceTimers.current.set(key, timer);
    setHasPendingDraft(true);
  };
  const flushLoad = (
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
  ) => {
    const key = draftKey(exerciseId, seriesNumber);
    const timer = debounceTimers.current.get(key);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    debounceTimers.current.delete(key);
    setHasPendingDraft(debounceTimers.current.size > 0);
    loadMutation.mutate({
      exerciseId,
      loadKg,
      seriesNumber,
      type: 'load',
    });
  };
  const submitAction = (action: SessionAction) => {
    trackTrainingAction('training_workout', trainingActionName(action));
    const keys = actionDraftKeys(action);
    for (const key of keys) {
      const timer = debounceTimers.current.get(key);
      if (timer !== undefined) window.clearTimeout(timer);
      debounceTimers.current.delete(key);
    }
    setHasPendingDraft(debounceTimers.current.size > 0);
    actionMutation.mutate(action);
  };
  const allComplete = session.exercises.every(
    (exercise) => exercise.completedAt !== null,
  );

  return (
    <main className={styles.page()}>
      <header className={styles.header()}>
        <h1 className={styles.title()}>{session.workout.name}</h1>
        <p className={styles.subtitle()}>
          Progresso salvo até{' '}
          {new Date(session.expiresAt).toLocaleString('pt-BR')}.
        </p>
      </header>
      <ol
        aria-label="Execução dos exercícios"
        className={styles.exerciseList()}
      >
        {session.exercises.map((exercise, index) => (
          <li key={exercise.id}>
            <ExecutionExerciseCard
              drafts={drafts}
              exercise={exercise}
              expanded={expandedId === exercise.id}
              index={index}
              isPending={actionMutation.isPending}
              onAction={submitAction}
              onExpand={() =>
                setExpandedId((current) => {
                  trackTrainingAction('training_workout', 'expand_exercise');
                  return current === exercise.id ? null : exercise.id;
                })
              }
              onLoadBlur={flushLoad}
              onLoadChange={setLoad}
            />
          </li>
        ))}
      </ol>
      <Button
        isDisabled={hasPendingDraft}
        onPress={() => setFinishOpen(true)}
        variant="primary"
      >
        Finalizar treino
      </Button>
      {session.activeTimer === null ? null : (
        <TrainingTimerOverlay
          key={timerResolution.timerKey}
          error={timerResolution.error}
          isPending={actionMutation.isPending || timerResolution.isPending}
          onResolve={timerResolution.resolve}
          serverNow={session.serverNow}
          timer={session.activeTimer}
        />
      )}
      <AlertDialog
        isOpen={finishOpen}
        onOpenChange={(open) => {
          if (!open && !completeMutation.isPending) setFinishOpen(false);
        }}
      >
        <AlertDialog.Backdrop
          isDismissable={!allComplete}
          isKeyboardDismissDisabled={allComplete}
        >
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  {allComplete ? 'Parabéns!' : 'Finalizar treino incompleto?'}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {allComplete
                  ? 'Todos os exercícios foram concluídos. Deseja finalizar o treino?'
                  : 'O progresso incompleto será encerrado e entrará no resumo.'}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  isDisabled={completeMutation.isPending}
                  onPress={() => setFinishOpen(false)}
                  variant="secondary"
                >
                  {allComplete ? 'Voltar' : 'Continuar treino'}
                </Button>
                <Button
                  isPending={completeMutation.isPending}
                  onPress={() => {
                    trackTrainingAction('training_workout', 'complete_workout');
                    completeMutation.mutate(!allComplete);
                  }}
                  variant="primary"
                >
                  {allComplete ? 'Sim, finalizar' : 'Finalizar mesmo assim'}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </main>
  );
}

interface ExerciseCardProps {
  drafts: Readonly<Record<string, number | null>>;
  exercise: TrainingExerciseExecution;
  expanded: boolean;
  index: number;
  isPending: boolean;
  onAction: (action: SessionAction) => void;
  onExpand: () => void;
  onLoadBlur: (
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
  ) => void;
  onLoadChange: (
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
  ) => void;
}

function ExecutionExerciseCard({
  drafts,
  exercise,
  expanded,
  index,
  isPending,
  onAction,
  onExpand,
  onLoadBlur,
  onLoadChange,
}: Readonly<ExerciseCardProps>) {
  const Icon = exerciseTypeIcons[exercise.type];
  const completed = exercise.completedAt !== null;

  return (
    <Card className={styles.exerciseCard({ completed })} variant="secondary">
      <Button
        aria-expanded={expanded}
        className={styles.cardButton()}
        fullWidth
        id={`training-exercise-${exercise.id}`}
        onPress={onExpand}
        variant="ghost"
      >
        <div className={styles.exerciseIdentity()}>
          <span className={styles.indicator({ completed })}>
            {completed ? <Check aria-hidden="true" /> : index + 1}
          </span>
          <Icon aria-hidden="true" className={styles.icon()} />
          <div className={styles.cardText()}>
            <h2 className={styles.exerciseHeading()}>
              {'name' in exercise ? exercise.name : 'Pausa'}
            </h2>
            <ExerciseSummary exercise={exercise} />
          </div>
        </div>
        {expanded ? (
          <ChevronUp aria-hidden="true" />
        ) : (
          <ChevronDown aria-hidden="true" />
        )}
      </Button>
      {expanded ? (
        <ExpandedExerciseContent
          drafts={drafts}
          exercise={exercise}
          isPending={isPending}
          onAction={onAction}
          onLoadBlur={onLoadBlur}
          onLoadChange={onLoadChange}
        />
      ) : null}
    </Card>
  );
}

function ExpandedExerciseContent({
  drafts,
  exercise,
  isPending,
  onAction,
  onLoadBlur,
  onLoadChange,
}: Readonly<
  Pick<
    ExerciseCardProps,
    | 'drafts'
    | 'exercise'
    | 'isPending'
    | 'onAction'
    | 'onLoadBlur'
    | 'onLoadChange'
  >
>) {
  const isSetExercise =
    exercise.type === 'image' || exercise.type === 'youtube-short';
  return (
    <div className={styles.exerciseContent()}>
      <div className={styles.actionRow()}>
        {exercise.type === 'duration' && exercise.instructions ? (
          <p>{exercise.instructions}</p>
        ) : null}
        <TrainingMediaViewer exercise={exercise} />
        <Chip size="sm" variant="soft">
          {exerciseTypeLabels[exercise.type]}
        </Chip>
      </div>
      {isSetExercise ? (
        <SeriesEditor
          drafts={drafts}
          exercise={exercise}
          isPending={isPending}
          onAction={onAction}
          onLoadBlur={onLoadBlur}
          onLoadChange={onLoadChange}
        />
      ) : null}
      <ExerciseAction
        exercise={exercise}
        isPending={isPending}
        onAction={onAction}
      />
    </div>
  );
}

type SetExecutionExercise = Extract<
  TrainingExerciseExecution,
  { type: 'image' | 'youtube-short' }
>;

function SeriesEditor({
  drafts,
  exercise,
  isPending,
  onAction,
  onLoadBlur,
  onLoadChange,
}: Readonly<{
  drafts: Readonly<Record<string, number | null>>;
  exercise: SetExecutionExercise;
  isPending: boolean;
  onAction: (action: SessionAction) => void;
  onLoadBlur: ExerciseCardProps['onLoadBlur'];
  onLoadChange: ExerciseCardProps['onLoadChange'];
}>) {
  const loads = exercise.series.map((series) =>
    draftLoad(drafts, exercise.id, series),
  );
  const invalid = loads.some((load) => !isValidLoad(load));
  const current = exercise.series.find((series) => series.completedAt === null);
  return (
    <div className={styles.series()}>
      {exercise.series.map((series) => {
        const load = draftLoad(drafts, exercise.id, series);
        return (
          <SeriesRow
            exerciseId={exercise.id}
            isPending={isPending}
            key={series.number}
            load={load}
            onLoadBlur={onLoadBlur}
            onLoadChange={onLoadChange}
            series={series}
          />
        );
      })}
      {exercise.completedAt === null ? (
        <div className={styles.actionRow()}>
          <Button
            isDisabled={current === undefined || invalid || isPending}
            data-series-action
            onPress={() => {
              if (current === undefined) return;
              onAction({
                exerciseId: exercise.id,
                loadKg: draftLoad(drafts, exercise.id, current),
                seriesNumber: current.number,
                type: 'complete-series',
              });
            }}
            variant="primary"
          >
            Finalizar série {current?.number ?? ''}
          </Button>
          <Button
            isDisabled={invalid || isPending}
            data-series-action
            onPress={() =>
              onAction({
                exerciseId: exercise.id,
                loadsKg: loads,
                type: 'complete-remaining',
              })
            }
            variant="secondary"
          >
            Finalizar séries restantes
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SeriesRow({
  exerciseId,
  isPending,
  load,
  onLoadBlur,
  onLoadChange,
  series,
}: Readonly<{
  exerciseId: string;
  isPending: boolean;
  load: number | null;
  onLoadBlur: ExerciseCardProps['onLoadBlur'];
  onLoadChange: ExerciseCardProps['onLoadChange'];
  series: SetExecutionExercise['series'][number];
}>) {
  const completed = series.completedAt !== null;
  return (
    <div className={styles.seriesRow()}>
      <strong className={styles.seriesLabel()}>Série {series.number}</strong>
      <span className={styles.seriesRepetitions()}>
        {series.repetitions} repetições
      </span>
      <NumberField
        aria-label={`Carga da série ${series.number}`}
        className={styles.loadField()}
        fullWidth
        isDisabled={completed || isPending}
        maxValue={9999}
        minValue={0}
        step={1}
        value={load ?? Number.NaN}
      >
        <NumberField.Group className={styles.loadFieldGroup()}>
          <NumberField.Input
            className={styles.loadFieldInput()}
            onBlur={(event) => {
              const next = event.relatedTarget;
              if (
                next instanceof HTMLElement &&
                next.closest('[data-series-action]') !== null
              )
                return;
              onLoadBlur(exerciseId, series.number, load);
            }}
            onInput={(event) =>
              onLoadChange(
                exerciseId,
                series.number,
                parseLoadInput(event.currentTarget.value),
              )
            }
          />
        </NumberField.Group>
      </NumberField>
      <span className={styles.seriesState({ completed })}>
        {completed ? (
          <Check aria-hidden="true" />
        ) : (
          <Circle aria-hidden="true" />
        )}
      </span>
    </div>
  );
}

function ExerciseAction({
  exercise,
  isPending,
  onAction,
}: Readonly<{
  exercise: TrainingExerciseExecution;
  isPending: boolean;
  onAction: (action: SessionAction) => void;
}>) {
  if (exercise.completedAt !== null) {
    return (
      <Button
        isDisabled={isPending}
        onPress={() =>
          onAction({ exerciseId: exercise.id, type: 'restart-exercise' })
        }
        variant="secondary"
      >
        Reiniciar exercício
      </Button>
    );
  }
  if (exercise.type === 'pause' || exercise.type === 'duration') {
    return (
      <Button
        isDisabled={isPending}
        onPress={() =>
          onAction({
            exerciseId: exercise.id,
            kind: exercise.type,
            type: 'start-timer',
          })
        }
      >
        {exercise.type === 'pause' ? 'Iniciar descanso' : 'Iniciar cronômetro'}
      </Button>
    );
  }
  if (exercise.type === 'youtube-long') {
    return (
      <Button
        isDisabled={isPending}
        onPress={() =>
          onAction({ exerciseId: exercise.id, type: 'complete-exercise' })
        }
      >
        Concluir exercício
      </Button>
    );
  }
  return null;
}

function ExerciseSummary({
  exercise,
  preview = false,
}: Readonly<{
  exercise: TrainingExerciseExecution | TrainingExercisePreview;
  preview?: boolean;
}>) {
  const metrics = useMemo(() => {
    const values: string[] = [];
    if ('bodyArea' in exercise) values.push(bodyAreaLabels[exercise.bodyArea]);
    if (exercise.type === 'image' || exercise.type === 'youtube-short') {
      values.push(`${exercise.sets} séries`);
      values.push(`${exercise.repetitions} repetições`);
      values.push(`${exercise.restSeconds} s de descanso`);
      if (preview && 'lastLoadsKg' in exercise) {
        const loads = [
          ...new Set(exercise.lastLoadsKg.filter((load) => load !== null)),
        ];
        if (loads.length > 0) values.push(`${loads.join(' / ')} kg`);
      }
    } else if (exercise.type === 'pause') {
      values.push(`${exercise.restSeconds} s`);
    } else if (exercise.type === 'duration') {
      values.push(`${exercise.durationMinutes} min`);
    }
    return values;
  }, [exercise, preview]);
  return (
    <p className={styles.exerciseSummary()}>
      {metrics.map((metric) => (
        <span key={metric}>{metric}</span>
      ))}
    </p>
  );
}

function draftKey(exerciseId: string, seriesNumber: number): string {
  return `${exerciseId}:${seriesNumber}`;
}

function parseLoadInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (normalized === '') return null;
  const result = Number(normalized);
  return result;
}

function isValidLoad(loadKg: number | null): boolean {
  return (
    loadKg === null ||
    (Number.isInteger(loadKg) && loadKg >= 0 && loadKg <= 9999)
  );
}

function draftLoad(
  drafts: Readonly<Record<string, number | null>>,
  exerciseId: string,
  series: Readonly<{ loadKg: number | null; number: number }>,
): number | null {
  const draft = drafts[draftKey(exerciseId, series.number)];
  return draft === undefined ? series.loadKg : draft;
}

function actionDraftKeys(action: SessionAction): readonly string[] {
  if (action.type === 'complete-series') {
    return [draftKey(action.exerciseId, action.seriesNumber)];
  }
  if (action.type === 'complete-remaining') {
    return action.loadsKg.map((_, index) =>
      draftKey(action.exerciseId, index + 1),
    );
  }
  return [];
}

function trainingActionName(
  action: SessionAction,
):
  | 'complete_exercise'
  | 'complete_series'
  | 'restart_exercise'
  | 'save_load'
  | 'start_timer' {
  switch (action.type) {
    case 'complete-series':
    case 'complete-remaining':
      return 'complete_series';
    case 'start-timer':
      return 'start_timer';
    case 'restart-exercise':
      return 'restart_exercise';
    case 'complete-exercise':
      return 'complete_exercise';
    case 'load':
      return 'save_load';
  }
}

function sessionDrafts(
  session: TrainingSession,
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const exercise of session.exercises) {
    if (exercise.type !== 'image' && exercise.type !== 'youtube-short')
      continue;
    for (const series of exercise.series)
      result[draftKey(exercise.id, series.number)] = series.loadKg;
  }
  return result;
}

function clearDebounces(timers: Map<string, number>): void {
  for (const timer of timers.values()) window.clearTimeout(timer);
  timers.clear();
}
