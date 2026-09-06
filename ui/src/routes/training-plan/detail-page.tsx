import { useEffect, useState } from 'react';

import { Alert, Button, Table, toast } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Pencil, Plus } from 'lucide-react';

import type { CreateTrainingPlanRequest } from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import { requireActiveSessionGeneration } from '~/auth/session-lifecycle';
import { trackUiEvent } from '~/core/analytics';
import { isExpectedCancellation } from '~/core/http/http-error';
import { useAggregateMutationCoordinator } from '~/routes/training-plan/aggregate-mutation-coordinator';
import {
  ActionsMenu,
  DeleteConfirmationDialog,
  TrainingPlanBreadcrumbs,
  TrainingPlanConflictAlert,
  TrainingPlanTableState,
} from '~/routes/training-plan/components';
import { TrainingPlanInlineForm } from '~/routes/training-plan/inline-form';
import { TrainingPlanPageSkeleton } from '~/routes/training-plan/loading';
import { trainingPlanStyles } from '~/routes/training-plan/styles';
import {
  useCreateTrainingPlanWorkoutMutation,
  useDeleteTrainingPlanWorkoutMutation,
  useUpdateTrainingPlanMutation,
} from '~/routes/training-plan/training-plan-mutations';
import { trainingPlanDetailQueryOptions } from '~/routes/training-plan/training-plan-queries';
import {
  trainingPlanMockSearch,
  type MockTrainingPlansScenario,
} from '~/routes/training-plan/training-plan-service';

const styles = trainingPlanStyles();

interface DetailPageProps {
  mockAuth?: MockAuthScenario;
  mockTrainingPlans: MockTrainingPlansScenario;
  trainingPlanId: string;
}

export function TrainingPlanDetailPage({
  mockAuth,
  mockTrainingPlans,
  trainingPlanId,
}: Readonly<DetailPageProps>) {
  const navigate = useNavigate();
  const query = useQuery(
    trainingPlanDetailQueryOptions(trainingPlanId, mockTrainingPlans),
  );
  const updateMutation = useUpdateTrainingPlanMutation(mockTrainingPlans);
  const createWorkoutMutation =
    useCreateTrainingPlanWorkoutMutation(mockTrainingPlans);
  const deleteWorkoutMutation =
    useDeleteTrainingPlanWorkoutMutation(mockTrainingPlans);
  const mockSearch = trainingPlanMockSearch(mockTrainingPlans);
  const [editing, setEditing] = useState(false);
  const [deleteWorkoutId, setDeleteWorkoutId] = useState<string>();
  const plan = query.data;
  const aggregate = useAggregateMutationCoordinator(
    trainingPlanId,
    plan?.version,
    editing || deleteWorkoutId !== undefined,
  );
  useEffect(() => {
    const external = aggregate.externalChange;
    if (external === undefined || aggregate.paused) return;
    if (external.state === 'deleted') {
      void navigate({ replace: true, to: '/global/training-plan' });
      return;
    }
    if (plan !== undefined && plan.version >= external.version)
      void aggregate.reset(plan.version);
  }, [aggregate, navigate, plan]);
  const submitChanges = async (input: CreateTrainingPlanRequest) => {
    const generation = requireActiveSessionGeneration();
    trackUiEvent({
      control: 'submit',
      eventName: 'ui_operation_started',
      operation: 'training_plan_update',
      surface: 'training_plan_form',
    });
    try {
      await updateMutation.mutateAsync({
        changes: input,
        generation,
        trainingPlanId,
        version: plan?.version ?? 0,
      });
      toast.success('Plano atualizado.');
      trackUiEvent({
        control: 'submit',
        eventName: 'ui_operation_completed',
        operation: 'training_plan_update',
        outcome: 'success',
        surface: 'training_plan_form',
      });
      setEditing(false);
    } catch (error) {
      if (isExpectedCancellation(error)) throw error;
      trackUiEvent({
        control: 'submit',
        eventName: 'ui_operation_completed',
        operation: 'training_plan_update',
        outcome: 'error',
        surface: 'training_plan_form',
      });
      throw error;
    }
  };
  const createWorkout = async () => {
    if (plan === undefined) return;
    const generation = requireActiveSessionGeneration();
    trackUiEvent({
      control: 'new_workout',
      eventName: 'ui_operation_started',
      operation: 'workout_create',
      surface: 'training_plan_detail',
    });
    try {
      const workout = (
        await createWorkoutMutation.mutateAsync({
          generation,
          trainingPlanId,
          version: plan.version,
        })
      ).data;
      toast.success('Treino criado.');
      await navigate({
        params: { trainingPlanId, workoutId: workout.id },
        search: { mockAuth, ...mockSearch },
        to: '/global/training-plan/$trainingPlanId/workout/$workoutId',
      });
      trackUiEvent({
        control: 'new_workout',
        eventName: 'ui_operation_completed',
        operation: 'workout_create',
        outcome: 'success',
        surface: 'training_plan_detail',
      });
    } catch (error) {
      if (isExpectedCancellation(error)) return;
      toast.danger('Não foi possível criar o treino.');
      trackUiEvent({
        control: 'new_workout',
        eventName: 'ui_operation_completed',
        operation: 'workout_create',
        outcome: 'error',
        surface: 'training_plan_detail',
      });
    }
  };
  const deleteWorkout = async () => {
    if (deleteWorkoutId === undefined) return;
    const generation = requireActiveSessionGeneration();
    trackUiEvent({
      control: 'delete_confirmation',
      eventName: 'ui_operation_started',
      operation: 'workout_delete',
      surface: 'training_plan_detail',
    });
    try {
      await deleteWorkoutMutation.mutateAsync({
        generation,
        trainingPlanId,
        workoutId: deleteWorkoutId,
        version: plan?.version ?? 0,
      });
      toast.success('Treino excluído.');
      trackUiEvent({
        control: 'delete_confirmation',
        eventName: 'ui_operation_completed',
        operation: 'workout_delete',
        outcome: 'success',
        surface: 'training_plan_detail',
      });
    } catch (error) {
      if (isExpectedCancellation(error)) throw error;
      toast.danger('Não foi possível excluir o treino.');
      trackUiEvent({
        control: 'delete_confirmation',
        eventName: 'ui_operation_completed',
        operation: 'workout_delete',
        outcome: 'error',
        surface: 'training_plan_detail',
      });
      throw error;
    }
  };
  const reloadConflict = async () => {
    trackUiEvent({
      control: 'retry',
      eventName: 'ui_retry_requested',
      resource: 'training_plan',
      surface: 'training_plan_detail',
    });
    const result = await query.refetch();
    if (!result.isSuccess || result.data === undefined)
      throw result.error ?? new Error('Training plan reload failed.');
    await aggregate.reset(result.data.version);
    if (aggregate.pauseReason === 'conflict') {
      setEditing(false);
      setDeleteWorkoutId(undefined);
    }
  };

  if (query.isLoading && plan === undefined) {
    return (
      <div className={styles.page()}>
        <TrainingPlanBreadcrumbs
          mockAuth={mockAuth}
          mockTrainingPlans={mockTrainingPlans}
          surface="training_plan_detail"
        />
        <TrainingPlanPageSkeleton label="Carregando plano" />
      </div>
    );
  }

  if (query.isError && plan === undefined) {
    return (
      <div className={styles.page()}>
        <TrainingPlanBreadcrumbs
          mockAuth={mockAuth}
          mockTrainingPlans={mockTrainingPlans}
          surface="training_plan_detail"
        />
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível carregar o plano.</Alert.Title>
            <Alert.Description>
              O nome foi omitido do breadcrumb porque não há dado válido em
              cache.
            </Alert.Description>
          </Alert.Content>
          <Button
            onPress={() => {
              trackUiEvent({
                control: 'retry',
                eventName: 'ui_retry_requested',
                resource: 'training_plan',
                surface: 'training_plan_detail',
              });
              query.refetch().catch(() => undefined);
            }}
            variant="secondary"
          >
            Tentar novamente
          </Button>
        </Alert>
      </div>
    );
  }

  if (plan === undefined) return null;

  return (
    <div className={styles.page()}>
      <TrainingPlanBreadcrumbs
        mockAuth={mockAuth}
        mockTrainingPlans={mockTrainingPlans}
        plan={plan}
        surface="training_plan_detail"
      />
      {query.isError ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível atualizar o plano.</Alert.Title>
            <Alert.Description>
              A última versão disponível permanece na tela.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {aggregate.paused ? (
        <TrainingPlanConflictAlert
          onReload={reloadConflict}
          reason={aggregate.pauseReason}
        />
      ) : null}
      <Alert status={plan.usage.linkedPeople > 0 ? 'warning' : 'default'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Impacto deste modelo</Alert.Title>
          <Alert.Description>
            {plan.usage.linkedPeople} pessoa(s) vinculada(s), sendo{' '}
            {plan.usage.activePeople} com este plano ativo.
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <header className={styles.pageHeader()}>
        {editing ? (
          <TrainingPlanInlineForm
            defaultValues={{
              description: plan.description,
              name: plan.name,
            }}
            isWritePaused={aggregate.paused}
            onCancel={() => setEditing(false)}
            onSubmit={submitChanges}
          />
        ) : (
          <div className={styles.titleGroup()}>
            <div className={styles.titleRow()}>
              <h1 className={styles.title()}>{plan.name}</h1>
              <Button
                aria-label="Editar plano"
                isIconOnly
                onPress={() => {
                  trackUiEvent({
                    action: 'open_inline_edit',
                    control: 'edit_plan',
                    eventName: 'ui_button_pressed',
                    surface: 'training_plan_detail',
                  });
                  setEditing(true);
                }}
                size="sm"
                variant="ghost"
              >
                <Pencil aria-hidden="true" className={styles.icon()} />
              </Button>
            </div>
            <p className={styles.description()}>{plan.description}</p>
          </div>
        )}
      </header>
      <section aria-label="Treinos do plano" className={styles.section()}>
        <header className={styles.pageHeader()}>
          <div className={styles.titleGroup()}>
            <h2>Treinos</h2>
            <p className={styles.description()}>
              Organize os treinos que pertencem a este plano.
            </p>
          </div>
          <Button
            isDisabled={aggregate.paused}
            isPending={createWorkoutMutation.isPending}
            onPress={() => void createWorkout()}
          >
            <Plus aria-hidden="true" className={styles.icon()} />
            Novo treino
          </Button>
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
                items={plan.workouts}
                renderEmptyState={() => (
                  <TrainingPlanTableState
                    description="Crie o primeiro treino deste plano."
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
                        onClick={() => {
                          trackUiEvent({
                            control: 'workout_link',
                            destination: 'workout',
                            eventName: 'ui_navigation_selected',
                            navigationKind: 'row_link',
                            surface: 'training_plan_detail',
                          });
                        }}
                        params={{ trainingPlanId, workoutId: workout.id }}
                        search={{ mockAuth, ...mockSearch }}
                        to="/global/training-plan/$trainingPlanId/workout/$workoutId"
                      >
                        {workout.name}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>{workout.exerciseCount}</Table.Cell>
                    <Table.Cell>
                      <ActionsMenu
                        ariaLabel={`Ações de ${workout.name}`}
                        onDelete={() => {
                          trackUiEvent({
                            control: 'delete_confirmation',
                            eventName: 'ui_overlay_opened',
                            overlay: 'delete_confirmation',
                            surface: 'training_plan_detail',
                          });
                          setDeleteWorkoutId(workout.id);
                        }}
                        surface="training_plan_detail"
                      />
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
        onConfirm={deleteWorkout}
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
