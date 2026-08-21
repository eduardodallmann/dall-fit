import { useState } from 'react';

import { Alert, Button, Table, toast } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Pencil, Plus } from 'lucide-react';

import type { CreateTrainingPlanRequest } from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import {
  ActionsMenu,
  DeleteConfirmationDialog,
  TrainingPlanTableState,
} from '~/routes/training-plan/components';
import { TrainingPlanInlineForm } from '~/routes/training-plan/inline-form';
import { TrainingPlanPageSkeleton } from '~/routes/training-plan/loading';
import { updatePersonalTrainingPlan } from '~/routes/training-plan/personal-training-plan-service';
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
  const query = useQuery(
    personalTrainingPlanDetailQueryOptions(catalogEntryId, mockTrainingPlans),
  );
  const [editing, setEditing] = useState(false);
  const [deleteWorkoutId, setDeleteWorkoutId] = useState<string>();
  const plan = query.data;
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
    ]);
  };
  const updateMutation = useMutation({
    mutationFn: (input: CreateTrainingPlanRequest) =>
      updatePersonalTrainingPlan(
        catalogEntryId,
        input,
        plan?.version ?? 0,
        mockTrainingPlans,
      ),
    onSuccess: invalidate,
  });
  const createWorkoutMutation = useMutation({
    mutationFn: () =>
      createTrainingPlanWorkout(
        catalogEntryId,
        plan?.version ?? 0,
        mockTrainingPlans,
        'personal',
      ),
    onSuccess: invalidate,
  });
  const deleteWorkoutMutation = useMutation({
    mutationFn: (workoutId: string) =>
      deleteTrainingPlanWorkout(
        catalogEntryId,
        workoutId,
        plan?.version ?? 0,
        mockTrainingPlans,
        'personal',
      ),
    onSuccess: invalidate,
  });

  if (query.isLoading && plan === undefined)
    return (
      <div className={styles.page()}>
        <PersonalBreadcrumbs />
        <TrainingPlanPageSkeleton label="Carregando plano" />
      </div>
    );

  if (query.isError || plan === undefined)
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
            <Alert.Title>Plano global em modo de leitura.</Alert.Title>
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
      <section aria-label="Treinos do plano" className={styles.section()}>
        <header className={styles.pageHeader()}>
          <div className={styles.titleGroup()}>
            <h2>Treinos</h2>
            <p className={styles.description()}>
              {readOnly
                ? 'Consulte os treinos e exercícios deste modelo global.'
                : 'Organize os treinos que pertencem a este plano.'}
            </p>
          </div>
          {readOnly ? null : (
            <Button
              isPending={createWorkoutMutation.isPending}
              onPress={() =>
                void createWorkoutMutation
                  .mutateAsync()
                  .then(() => toast.success('Treino criado.'))
              }
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
                          onDelete={() => setDeleteWorkoutId(workout.id)}
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
