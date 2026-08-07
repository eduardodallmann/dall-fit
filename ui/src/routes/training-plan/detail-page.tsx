import { useState } from 'react';

import { Alert, Button, Table, toast } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Pencil, Plus } from 'lucide-react';

import type { CreateTrainingPlanRequest } from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import {
  ActionsMenu,
  DeleteConfirmationDialog,
  TrainingPlanBreadcrumbs,
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
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';

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
  const [editing, setEditing] = useState(false);
  const [deleteWorkoutId, setDeleteWorkoutId] = useState<string>();
  const plan = query.data;
  const submitChanges = async (input: CreateTrainingPlanRequest) => {
    setEditing(false);
    const promise = updateMutation.mutateAsync({
      changes: input,
      trainingPlanId,
    });
    toast.promise(promise, {
      error: 'Não foi possível salvar o plano.',
      loading: 'Salvando alterações…',
      success: 'Plano atualizado.',
    });
    try {
      await promise;
    } catch {
      return;
    }
  };
  const createWorkout = async () => {
    const promise = createWorkoutMutation.mutateAsync(trainingPlanId);
    toast.promise(promise, {
      error: 'Não foi possível criar o treino.',
      loading: 'Criando treino…',
      success: 'Treino criado.',
    });
    const workout = await promise;
    await navigate({
      params: { trainingPlanId, workoutId: workout.id },
      search: { mockAuth, mockTrainingPlans },
      to: '/global/training-plan/$trainingPlanId/workout/$workoutId',
    });
  };
  const deleteWorkout = async () => {
    if (deleteWorkoutId === undefined) return;
    const promise = deleteWorkoutMutation.mutateAsync({
      trainingPlanId,
      workoutId: deleteWorkoutId,
    });
    toast.promise(promise, {
      error: 'Não foi possível excluir o treino.',
      loading: 'Excluindo treino…',
      success: 'Treino excluído.',
    });
    try {
      await promise;
    } catch {
      return;
    }
  };

  if (query.isLoading && plan === undefined) {
    return (
      <div className={styles.page()}>
        <TrainingPlanBreadcrumbs
          mockAuth={mockAuth}
          mockTrainingPlans={mockTrainingPlans}
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
          <Button onPress={() => void query.refetch()} variant="secondary">
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
      <header className={styles.pageHeader()}>
        {editing ? (
          <TrainingPlanInlineForm
            defaultValues={{
              description: plan.description,
              name: plan.name,
            }}
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
                onPress={() => setEditing(true)}
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
                        params={{ trainingPlanId, workoutId: workout.id }}
                        search={{ mockAuth, mockTrainingPlans }}
                        to="/global/training-plan/$trainingPlanId/workout/$workoutId"
                      >
                        {workout.name}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>{workout.exerciseCount}</Table.Cell>
                    <Table.Cell>
                      <ActionsMenu
                        ariaLabel={`Ações de ${workout.name}`}
                        onDelete={() => setDeleteWorkoutId(workout.id)}
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
        onConfirm={deleteWorkout}
        onOpenChange={(open) => {
          if (!open) setDeleteWorkoutId(undefined);
        }}
        open={deleteWorkoutId !== undefined}
        title="Excluir treino?"
      />
    </div>
  );
}
