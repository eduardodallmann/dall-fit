import { useState } from 'react';

import { Alert, Button, Table, toast } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Pencil, Plus } from 'lucide-react';

import type { CreateTrainingPlanRequest } from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import {
  isSessionGenerationActive,
  requireActiveSessionGeneration,
} from '~/auth/session-lifecycle';
import { trackUiEvent } from '~/core/analytics';
import { isExpectedCancellation } from '~/core/http/http-error';
import { useAggregateMutationCoordinator } from '~/routes/training-plan/aggregate-mutation-coordinator';
import {
  ActionsMenu,
  DeleteConfirmationDialog,
  TrainingPlanConflictAlert,
  TrainingPlanTableState,
} from '~/routes/training-plan/components';
import { TrainingPlanInlineForm } from '~/routes/training-plan/inline-form';
import { TrainingPlanPageSkeleton } from '~/routes/training-plan/loading';
import {
  duplicatePersonalTrainingPlanWorkout,
  updatePersonalTrainingPlan,
} from '~/routes/training-plan/personal-training-plan-service';
import { trainingPlanStyles } from '~/routes/training-plan/styles';
import {
  personalTrainingPlanDetailQueryOptions,
  trainingPlanKeys,
} from '~/routes/training-plan/training-plan-queries';
import {
  createTrainingPlanWorkout,
  deleteTrainingPlanWorkout,
  trainingPlanMockSearch,
  type MockTrainingPlansScenario,
} from '~/routes/training-plan/training-plan-service';

const styles = trainingPlanStyles();

interface PersonalDetailPageProps {
  catalogEntryId: string;
  mockAuth?: MockAuthScenario;
  mockTrainingPlans: MockTrainingPlansScenario;
}

export function PersonalTrainingPlanDetailPage({
  catalogEntryId,
  mockAuth,
  mockTrainingPlans,
}: Readonly<PersonalDetailPageProps>) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery(
    personalTrainingPlanDetailQueryOptions(catalogEntryId, mockTrainingPlans),
  );
  const [editing, setEditing] = useState(false);
  const [deleteWorkoutId, setDeleteWorkoutId] = useState<string>();
  const [duplicationFailed, setDuplicationFailed] = useState(false);
  const plan = query.data;
  const aggregate = useAggregateMutationCoordinator(
    catalogEntryId,
    plan?.version,
    editing || deleteWorkoutId !== undefined,
  );
  const writeDisabled = aggregate.isPending || aggregate.paused;
  const readOnly = plan?.source === 'global-reference';
  const mockSearch = trainingPlanMockSearch(mockTrainingPlans);
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.personalDetail(
          catalogEntryId,
          mockTrainingPlans,
        ),
      }),
      queryClient.invalidateQueries({ queryKey: trainingPlanKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: trainingPlanKeys.workouts() }),
    ]);
  };
  const updateMutation = useMutation({
    mutationFn: (input: CreateTrainingPlanRequest) =>
      aggregate.enqueue(async (version) => {
        const data = await updatePersonalTrainingPlan(
          catalogEntryId,
          input,
          version,
          mockTrainingPlans,
        );
        return { data, version: data.version };
      }),
    onSuccess: invalidate,
  });
  const createWorkoutMutation = useMutation({
    mutationFn: () =>
      aggregate.enqueue((version) =>
        createTrainingPlanWorkout(
          catalogEntryId,
          version,
          mockTrainingPlans,
          'personal',
        ),
      ),
    onSuccess: async (result) => {
      await invalidate();
      toast.success('Treino criado.');
      await navigate({
        params: { catalogEntryId, workoutId: result.id },
        search: { mockAuth, ...mockSearch },
        to: '/training-plan/$catalogEntryId/workout/$workoutId',
      });
    },
  });
  const deleteWorkoutMutation = useMutation({
    mutationFn: (workoutId: string) =>
      aggregate.enqueue(async (version) => {
        const nextVersion = await deleteTrainingPlanWorkout(
          catalogEntryId,
          workoutId,
          version,
          mockTrainingPlans,
          'personal',
        );
        return { data: undefined, version: nextVersion };
      }),
    onSuccess: invalidate,
  });
  const duplicateWorkoutMutation = useMutation({
    mutationFn: ({ workoutId }: { workoutId: string; generation: number }) =>
      aggregate.enqueue(async (version) => {
        const result = await duplicatePersonalTrainingPlanWorkout(
          catalogEntryId,
          workoutId,
          version,
          mockTrainingPlans,
        );
        return { data: result, version: result.version };
      }),
    onMutate: () => {
      setDuplicationFailed(false);
      trackUiEvent({
        eventName: 'ui_operation_started',
        operation: 'workout_duplicate',
        control: 'row_actions',
        surface: 'training_plan_detail',
      });
    },
    onSuccess: async ({ data: workout, version }, { generation }) => {
      if (!isSessionGenerationActive(generation)) return;
      queryClient.setQueryData(
        personalTrainingPlanDetailQueryOptions(
          catalogEntryId,
          mockTrainingPlans,
        ).queryKey,
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                version: Math.max(current.version, version),
                workouts: current.workouts.some(
                  (item) => item.id === workout.id,
                )
                  ? current.workouts
                  : [...current.workouts, workout],
              },
      );
      await invalidate();
      if (!isSessionGenerationActive(generation)) return;
      toast.success('Treino duplicado.');
      trackUiEvent({
        eventName: 'ui_operation_completed',
        operation: 'workout_duplicate',
        outcome: 'success',
        control: 'row_actions',
        surface: 'training_plan_detail',
      });
    },
    onError: (error, { generation }) => {
      if (
        !isSessionGenerationActive(generation) ||
        isExpectedCancellation(error)
      )
        return;
      setDuplicationFailed(true);
      trackUiEvent({
        eventName: 'ui_operation_completed',
        operation: 'workout_duplicate',
        outcome: 'error',
        control: 'row_actions',
        surface: 'training_plan_detail',
      });
    },
  });

  if (query.isLoading && plan === undefined)
    return (
      <div className={styles.page()}>
        <PersonalBreadcrumbs />
        <TrainingPlanPageSkeleton label="Carregando plano" />
      </div>
    );

  if (plan === undefined)
    return (
      <div className={styles.page()}>
        <PersonalBreadcrumbs />
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível carregar o plano.</Alert.Title>
          </Alert.Content>
          <Button onPress={() => void query.refetch()} variant="secondary">
            Tentar novamente
          </Button>
        </Alert>
      </div>
    );

  return (
    <div className={styles.page()}>
      <PersonalBreadcrumbs planName={plan.name} />
      {readOnly ? (
        <Alert status="accent">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              Modelo disponibilizado em modo de leitura.
            </Alert.Title>
            <Alert.Description>
              Este conteúdo acompanha automaticamente as alterações feitas pela
              administração.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      <header className={styles.pageHeader()}>
        {editing && !readOnly ? (
          <TrainingPlanInlineForm
            defaultValues={{ description: plan.description, name: plan.name }}
            isWritePaused={writeDisabled}
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              await updateMutation.mutateAsync(input);
              toast.success('Plano atualizado.');
              setEditing(false);
            }}
          />
        ) : (
          <div className={styles.titleGroup()}>
            <div className={styles.titleRow()}>
              <h1 className={styles.title()}>{plan.name}</h1>
              {readOnly ? null : (
                <Button
                  aria-label="Editar plano"
                  isDisabled={writeDisabled}
                  isIconOnly
                  onPress={() => setEditing(true)}
                  size="sm"
                  variant="ghost"
                >
                  <Pencil aria-hidden="true" className={styles.icon()} />
                </Button>
              )}
            </div>
            <p className={styles.description()}>{plan.description}</p>
          </div>
        )}
      </header>
      {aggregate.paused ? (
        <TrainingPlanConflictAlert
          directReload
          reason={aggregate.pauseReason}
          onReload={async () => {
            const generation = requireActiveSessionGeneration();
            const result = await query.refetch();
            if (!isSessionGenerationActive(generation)) return;
            if (!result.isSuccess || result.data === undefined)
              throw new Error('Training plan reload failed.');
            await aggregate.reset(result.data.version);
            setEditing(false);
            setDeleteWorkoutId(undefined);
            setDuplicationFailed(false);
          }}
        />
      ) : null}
      {duplicationFailed && !aggregate.paused ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível duplicar o treino.</Alert.Title>
            <Alert.Description>
              Tente novamente pelo menu de ações do treino.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {duplicateWorkoutMutation.isPending ? (
        <p role="status">Duplicando treino…</p>
      ) : null}
      <section aria-label="Treinos do plano" className={styles.section()}>
        <header className={styles.pageHeader()}>
          <div className={styles.titleGroup()}>
            <h2>Treinos</h2>
            <p className={styles.description()}>
              {readOnly
                ? 'Consulte os treinos e exercícios deste modelo disponibilizado.'
                : 'Organize os treinos que pertencem a este plano.'}
            </p>
          </div>
          {readOnly ? null : (
            <Button
              isDisabled={writeDisabled || duplicateWorkoutMutation.isPending}
              isPending={createWorkoutMutation.isPending}
              onPress={() => createWorkoutMutation.mutate()}
            >
              <Plus aria-hidden="true" className={styles.icon()} />
              Novo treino
            </Button>
          )}
        </header>
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Treinos do plano">
              <Table.Header>
                <Table.Column isRowHeader>Nome</Table.Column>
                <Table.Column>Exercícios</Table.Column>
                <Table.Column>Ações</Table.Column>
              </Table.Header>
              <Table.Body
                dependencies={[
                  writeDisabled,
                  duplicateWorkoutMutation.isPending,
                ]}
                items={plan.workouts}
                renderEmptyState={() => (
                  <TrainingPlanTableState
                    description="Este plano ainda não possui treinos."
                    kind="empty"
                    title="Nenhum treino"
                  />
                )}
              >
                {(workout) => (
                  <Table.Row id={workout.id}>
                    <Table.Cell>
                      <Link
                        className={styles.planLink()}
                        params={{ catalogEntryId, workoutId: workout.id }}
                        search={{ mockAuth, ...mockSearch }}
                        to="/training-plan/$catalogEntryId/workout/$workoutId"
                      >
                        {workout.name}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>{workout.exerciseCount}</Table.Cell>
                    <Table.Cell>
                      {readOnly ? (
                        'Somente leitura'
                      ) : (
                        <ActionsMenu
                          ariaLabel={`Ações de ${workout.name}`}
                          isDisabled={
                            writeDisabled || duplicateWorkoutMutation.isPending
                          }
                          onDelete={() => setDeleteWorkoutId(workout.id)}
                          onDuplicate={() => {
                            if (
                              duplicateWorkoutMutation.isPending ||
                              writeDisabled
                            )
                              return;
                            duplicateWorkoutMutation.mutate({
                              workoutId: workout.id,
                              generation: requireActiveSessionGeneration(),
                            });
                          }}
                          surface="training_plan_detail"
                        />
                      )}
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </section>
      <DeleteConfirmationDialog
        description="Este treino será removido do plano."
        isWritePaused={aggregate.paused}
        onConfirm={async () => {
          if (deleteWorkoutId === undefined) return;
          await deleteWorkoutMutation.mutateAsync(deleteWorkoutId);
          toast.success('Treino excluído.');
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteWorkoutId(undefined);
        }}
        open={deleteWorkoutId !== undefined}
        surface="training_plan_detail"
        title="Excluir treino?"
      />
    </div>
  );
}

function PersonalBreadcrumbs({ planName }: Readonly<{ planName?: string }>) {
  return (
    <nav aria-label="Navegação estrutural">
      <div className={styles.breadcrumbs()}>
        <Link className={styles.breadcrumbLink()} to="/dash">
          Home
        </Link>
        <span>›</span>
        {planName === undefined ? (
          <span>Meus planos</span>
        ) : (
          <>
            <Link className={styles.breadcrumbLink()} to="/training-plan">
              Meus planos
            </Link>
            <span>›</span>
            <span>{planName}</span>
          </>
        )}
      </div>
    </nav>
  );
}
