import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  Alert,
  AlertDialog,
  Button,
  Label,
  Modal,
  TextArea,
  TextField,
} from '@heroui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate } from '@tanstack/react-router';

import type { TrainingPlanAssistantSession } from '@dall-fit/types';

import { trackTrainingPlanAssistantAction } from '~/core/analytics';
import { classifyHttpFailure } from '~/core/http/http-error';
import { useReloadBlocker } from '~/core/reload-safety/reload-safety-context';
import {
  abandonTrainingPlanAssistantSession,
  confirmTrainingPlanAssistantSession,
  createTrainingPlanAssistantSession,
  generateTrainingPlanAssistantDraft,
  sendTrainingPlanAssistantMessage,
} from '~/routes/training-plan/training-plan-assistant-service';
import { assistantStyles } from '~/routes/training-plan/training-plan-assistant/styles';
import {
  trainingPlanAssistantQueryOptions,
  trainingPlanKeys,
} from '~/routes/training-plan/training-plan-queries';
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';

const styles = assistantStyles();

interface AssistantModalProps {
  mockTrainingPlans: MockTrainingPlansScenario;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface MessageVariables {
  id: string;
  text: string;
  version: number;
}

interface DraftVariables {
  adjustment?: string;
  key: string;
  version: number;
}

interface ConfirmVariables {
  key: string;
  version: number;
}

// The route-owned modal composes all accessible state surfaces while mutations remain isolated above the render tree.
// eslint-disable-next-line sonarjs/cognitive-complexity
export function TrainingPlanAssistantModal({
  mockTrainingPlans,
  onOpenChange,
  open,
}: Readonly<AssistantModalProps>) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryOptions = trainingPlanAssistantQueryOptions(mockTrainingPlans);
  const query = useQuery({ ...queryOptions, enabled: open });
  const allowInternalNavigation = useRef(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [persistentError, setPersistentError] = useState<string>();
  const [lastRetry, setLastRetry] = useState<
    | { kind: 'confirm'; variables: ConfirmVariables }
    | { kind: 'draft'; variables: DraftVariables }
    | { kind: 'message'; variables: MessageVariables }
  >();

  useEffect(() => {
    if (open) allowInternalNavigation.current = false;
  }, [open]);

  const setSession = (session: TrainingPlanAssistantSession | null) => {
    queryClient.setQueryData(queryOptions.queryKey, session);
  };

  const startMutation = useMutation({
    mutationFn: () => createTrainingPlanAssistantSession(mockTrainingPlans),
    onSuccess: (session) => {
      setSession(session);
      setPersistentError(undefined);
      trackTrainingPlanAssistantAction('assistant_open', 'success');
    },
    onError: () => setPersistentError('Não foi possível iniciar o assistente.'),
  });
  const messageMutation = useMutation({
    mutationFn: (variables: MessageVariables) =>
      sendTrainingPlanAssistantMessage(mockTrainingPlans, variables.version, {
        clientMessageId: variables.id,
        text: variables.text,
      }),
    onSuccess: (session) => {
      setSession(session);
      form.reset();
      setPersistentError(undefined);
      setLastRetry(undefined);
      trackTrainingPlanAssistantAction(
        'assistant_message',
        session.status === 'blocked' ? 'blocked' : 'success',
      );
    },
    onError: (error, variables) => {
      handleMutationError(error);
      setLastRetry({ kind: 'message', variables });
    },
  });
  const draftMutation = useMutation({
    mutationFn: (variables: DraftVariables) =>
      generateTrainingPlanAssistantDraft(
        mockTrainingPlans,
        variables.version,
        variables.key,
        variables.adjustment === undefined
          ? {}
          : { adjustment: variables.adjustment },
      ),
    onSuccess: (session) => {
      setSession(session);
      form.reset();
      setPersistentError(undefined);
      setLastRetry(undefined);
      trackTrainingPlanAssistantAction(
        session.draft === null ? 'assistant_adjust' : 'assistant_preview',
        'success',
      );
    },
    onError: (error, variables) => {
      handleMutationError(error);
      setLastRetry({ kind: 'draft', variables });
    },
  });
  const confirmMutation = useMutation({
    mutationFn: (variables: ConfirmVariables) =>
      confirmTrainingPlanAssistantSession(
        mockTrainingPlans,
        variables.version,
        variables.key,
      ),
    onSuccess: async (confirmation) => {
      setSession(null);
      setPersistentError(undefined);
      setLastRetry(undefined);
      await queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.lists(),
      });
      trackTrainingPlanAssistantAction('assistant_confirm', 'success');
      allowInternalNavigation.current = true;
      onOpenChange(false);
      await navigate({
        params: { catalogEntryId: confirmation.catalogEntryId },
        search: {},
        to: '/training-plan/$catalogEntryId',
      });
    },
    onError: (error, variables) => {
      handleMutationError(error);
      setLastRetry({ kind: 'confirm', variables });
    },
  });
  const abandonMutation = useMutation({
    mutationFn: () => abandonTrainingPlanAssistantSession(mockTrainingPlans),
    onSuccess: () => {
      setSession(null);
      setAbandonOpen(false);
      onOpenChange(false);
      trackTrainingPlanAssistantAction('assistant_abandon', 'success');
    },
    onError: () => setPersistentError('Não foi possível excluir a sessão.'),
  });
  const pending =
    startMutation.isPending ||
    messageMutation.isPending ||
    draftMutation.isPending ||
    confirmMutation.isPending ||
    abandonMutation.isPending;
  useReloadBlocker(pending);
  const navigationBlocker = useBlocker({
    disabled: !pending,
    enableBeforeUnload: pending,
    shouldBlockFn: () => !allowInternalNavigation.current,
    withResolver: true,
  });
  const session = query.data;
  const form = useForm({
    defaultValues: { text: '' },
    onSubmit: async ({ value }) => {
      const text = value.text.trim();
      if (text.length === 0 || session === null || session === undefined)
        return;
      if (session.status === 'preview') {
        await draftMutation.mutateAsync({
          adjustment: text,
          key: crypto.randomUUID(),
          version: session.version,
        });
      } else {
        await messageMutation.mutateAsync({
          id: crypto.randomUUID(),
          text,
          version: session.version,
        });
      }
    },
  });

  function handleMutationError(error: unknown) {
    const failure = classifyHttpFailure(error);
    if (
      failure.kind === 'http' &&
      failure.code === 'ASSISTANT_SESSION_VERSION_CONFLICT'
    ) {
      setPersistentError(
        'A sessão foi atualizada em outro lugar. Recarregamos a versão canônica; revise antes de continuar.',
      );
      void query.refetch();
      return;
    }
    if (failure.kind === 'cancelled') return;
    if (failure.kind === 'http' && failure.status === 429) {
      setPersistentError(
        'Muitas tentativas. Aguarde um pouco e tente novamente.',
      );
      return;
    }
    setPersistentError(
      'Não foi possível concluir a operação. Seu texto e sua sessão foram preservados.',
    );
    trackTrainingPlanAssistantAction('assistant_retry', 'error');
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit().catch(() => undefined);
  };

  const retry = () => {
    if (lastRetry?.kind === 'message')
      messageMutation.mutate(lastRetry.variables);
    if (lastRetry?.kind === 'draft') draftMutation.mutate(lastRetry.variables);
    if (lastRetry?.kind === 'confirm')
      confirmMutation.mutate(lastRetry.variables);
    trackTrainingPlanAssistantAction('assistant_retry');
  };

  const handleModalOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (session?.status === 'blocked') {
      if (!abandonMutation.isPending) abandonMutation.mutate();
      return;
    }
    onOpenChange(false);
  };

  return (
    <>
      <Modal isOpen={open} onOpenChange={handleModalOpenChange}>
        <Modal.Backdrop>
          <Modal.Container scroll="inside" size="cover">
            <Modal.Dialog>
              <Modal.CloseTrigger isDisabled={pending} />
              <Modal.Header>
                <Modal.Heading>Me ajude a criar um plano</Modal.Heading>
                <p className={styles.status()}>
                  Sugestão informativa com triagem conservadora. Não substitui
                  avaliação profissional.
                </p>
              </Modal.Header>
              <Modal.Body>
                {query.isLoading ? <p>Carregando sua sessão…</p> : null}
                {query.isError ? (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>
                        Não foi possível consultar a sessão.
                      </Alert.Title>
                    </Alert.Content>
                    <Button
                      onPress={() => void query.refetch()}
                      variant="secondary"
                    >
                      Tentar novamente
                    </Button>
                  </Alert>
                ) : null}
                {persistentError === undefined ? null : (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>{persistentError}</Alert.Title>
                    </Alert.Content>
                    {lastRetry === undefined ? null : (
                      <Button onPress={retry} variant="secondary">
                        Tentar novamente
                      </Button>
                    )}
                  </Alert>
                )}
                {session === null ? (
                  <div className={styles.notice()}>
                    <p>
                      Suas respostas podem incluir dados de saúde e serão
                      mantidas por até sete dias para permitir retomada. Elas
                      não serão armazenadas neste navegador nem usadas para
                      diagnóstico.
                    </p>
                    <div className={styles.actions()}>
                      <Button
                        onPress={() => onOpenChange(false)}
                        variant="secondary"
                      >
                        Agora não
                      </Button>
                      <Button
                        isPending={startMutation.isPending}
                        onPress={() => startMutation.mutate()}
                      >
                        Aceitar e continuar
                      </Button>
                    </div>
                  </div>
                ) : null}
                {session === undefined || session === null ? null : (
                  <div className={styles.layout()}>
                    <section
                      aria-label="Histórico da conversa"
                      className={styles.conversation()}
                    >
                      {session.messages.map((message) => (
                        <p
                          className={styles.message()}
                          data-role={message.role}
                          key={message.id}
                        >
                          {message.text}
                        </p>
                      ))}
                    </section>
                    <p
                      aria-atomic="true"
                      aria-live="polite"
                      className={styles.announcer()}
                      role="status"
                    >
                      {session.messages.at(-1)?.text}
                    </p>
                    <section
                      aria-label="Resposta e prévia"
                      className={styles.form()}
                    >
                      {session.currentPrompt === null ? null : (
                        <p className={styles.prompt()}>
                          {session.currentPrompt}
                        </p>
                      )}
                      {session.availableAnswers.length === 0 ? null : (
                        <div
                          aria-label="Respostas rápidas"
                          className={styles.answerActions()}
                          role="group"
                        >
                          {session.availableAnswers.map((answer) => (
                            <Button
                              isDisabled={pending}
                              key={answer.value}
                              onPress={() =>
                                messageMutation.mutate({
                                  id: crypto.randomUUID(),
                                  text: answer.value,
                                  version: session.version,
                                })
                              }
                              size="sm"
                              variant="secondary"
                            >
                              {answer.label}
                            </Button>
                          ))}
                        </div>
                      )}
                      {session.status === 'blocked' ? (
                        <Alert status="warning">
                          <Alert.Indicator />
                          <Alert.Content>
                            <Alert.Title>
                              Geração indisponível nesta sessão
                            </Alert.Title>
                          </Alert.Content>
                        </Alert>
                      ) : null}
                      {session.draft === null ? null : (
                        <AssistantDraftPreview session={session} />
                      )}
                      {session.status === 'blocked' ? null : (
                        <form className={styles.form()} onSubmit={handleSubmit}>
                          <form.Field name="text">
                            {(field) => (
                              <TextField isDisabled={pending}>
                                <Label>
                                  {session.status === 'preview'
                                    ? 'Ajuste da prévia'
                                    : 'Sua resposta'}
                                </Label>
                                <TextArea
                                  aria-label={
                                    session.status === 'preview'
                                      ? 'Ajuste da prévia'
                                      : 'Sua resposta à pergunta atual'
                                  }
                                  className={styles.textArea()}
                                  maxLength={1000}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                  value={field.state.value}
                                />
                              </TextField>
                            )}
                          </form.Field>
                          <div className={styles.actions()}>
                            <Button
                              isDisabled={pending}
                              isPending={
                                messageMutation.isPending ||
                                draftMutation.isPending
                              }
                              type="submit"
                            >
                              {session.status === 'preview'
                                ? 'Ajustar prévia'
                                : 'Enviar resposta'}
                            </Button>
                            {session.status === 'ready' ? (
                              <Button
                                isPending={draftMutation.isPending}
                                onPress={() =>
                                  draftMutation.mutate({
                                    key: crypto.randomUUID(),
                                    version: session.version,
                                  })
                                }
                                type="button"
                                variant="secondary"
                              >
                                Gerar prévia
                              </Button>
                            ) : null}
                          </div>
                        </form>
                      )}
                    </section>
                  </div>
                )}
              </Modal.Body>
              <Modal.Footer>
                {session === undefined || session === null ? null : (
                  <Button
                    isDisabled={pending}
                    onPress={() => setAbandonOpen(true)}
                    variant="danger"
                  >
                    Desistir
                  </Button>
                )}
                {session?.status === 'preview' ? (
                  <Button
                    isPending={confirmMutation.isPending}
                    onPress={() =>
                      confirmMutation.mutate({
                        key: crypto.randomUUID(),
                        version: session.version,
                      })
                    }
                  >
                    Criar plano
                  </Button>
                ) : null}
                <Button
                  isDisabled={pending}
                  onPress={() => handleModalOpenChange(false)}
                  variant="secondary"
                >
                  Fechar
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <AlertDialog.Backdrop isOpen={abandonOpen} onOpenChange={setAbandonOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Excluir esta conversa?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Respostas, triagem e prévia serão apagadas e não poderão ser
              recuperadas.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button onPress={() => setAbandonOpen(false)} variant="secondary">
                Continuar conversa
              </Button>
              <Button
                isPending={abandonMutation.isPending}
                onPress={() => abandonMutation.mutate()}
                variant="danger"
              >
                Excluir conversa
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
      <AlertDialog.Backdrop
        isOpen={navigationBlocker.status === 'blocked'}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && navigationBlocker.status === 'blocked')
            navigationBlocker.reset();
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Operação em andamento</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Aguarde a operação terminar para preservar o resultado canônico.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                onPress={() => {
                  if (navigationBlocker.status === 'blocked')
                    navigationBlocker.reset();
                }}
              >
                Permanecer
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}

function AssistantDraftPreview({
  session,
}: Readonly<{ session: TrainingPlanAssistantSession }>) {
  const draft = session.draft;
  if (draft === null) return null;
  return (
    <section aria-label="Prévia do plano" className={styles.draft()}>
      <div>
        <h3>{draft.planName}</h3>
        <p>{draft.description}</p>
      </div>
      {draft.workouts.map((workout, workoutIndex) => (
        <article
          className={styles.previewWorkout()}
          key={`${workout.name}-${workoutIndex}`}
        >
          <h4>{workout.name}</h4>
          <p className={styles.metadata()}>
            Duração estimada: {workout.estimatedDurationMinutes} minutos
          </p>
          {workout.exercises.map((exercise) => (
            <div className={styles.exercise()} key={exercise.catalogKey}>
              <strong>{exercise.name}</strong>
              <span>
                {exercise.sets} × {exercise.repetitions} · descanso de{' '}
                {exercise.restSeconds}s
              </span>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
