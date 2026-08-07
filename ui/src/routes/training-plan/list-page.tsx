import { useState } from 'react';

import { Alert, Button, Pagination, Table, toast } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import type {
  CreateTrainingPlanRequest,
  TrainingPlanSummary,
} from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import {
  ActionsMenu,
  DeleteConfirmationDialog,
  TrainingPlanBreadcrumbs,
  TrainingPlanFormModal,
  TrainingPlanTableState,
} from '~/routes/training-plan/components';
import { TrainingPlanTableLoading } from '~/routes/training-plan/loading';
import { trainingPlanStyles } from '~/routes/training-plan/styles';
import {
  useCreateTrainingPlanMutation,
  useDeleteTrainingPlanMutation,
  useUpdateTrainingPlanMutation,
} from '~/routes/training-plan/training-plan-mutations';
import { trainingPlanListQueryOptions } from '~/routes/training-plan/training-plan-queries';
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';

const styles = trainingPlanStyles();

interface ListPageProps {
  mockAuth?: MockAuthScenario;
  mockTrainingPlans: MockTrainingPlansScenario;
  page: number;
}

export function TrainingPlanListPage({
  mockAuth,
  mockTrainingPlans,
  page,
}: Readonly<ListPageProps>) {
  const navigate = useNavigate();
  const query = useQuery(trainingPlanListQueryOptions(page, mockTrainingPlans));
  const createMutation = useCreateTrainingPlanMutation(mockTrainingPlans);
  const updateMutation = useUpdateTrainingPlanMutation(mockTrainingPlans);
  const deleteMutation = useDeleteTrainingPlanMutation(mockTrainingPlans);
  const [formPlan, setFormPlan] = useState<
    TrainingPlanSummary | null | undefined
  >(null);
  const [deletePlan, setDeletePlan] = useState<TrainingPlanSummary>();
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(
    1,
    Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 20)),
  );
  const navigateToPage = (nextPage: number) =>
    navigate({
      search: { mockAuth, mockTrainingPlans, page: nextPage },
      to: '/global/training-plan',
    });
  const submitPlan = async (input: CreateTrainingPlanRequest) => {
    if (formPlan === null) return;
    if (formPlan === undefined) {
      const previousPage = page;
      await navigateToPage(1);
      const promise = createMutation.mutateAsync(input);
      toast.promise(promise, {
        error: 'Não foi possível criar o plano.',
        loading: 'Criando plano…',
        success: 'Plano criado.',
      });
      try {
        await promise;
        setFormPlan(null);
      } catch {
        await navigateToPage(previousPage);
      }

      return;
    }

    const promise = updateMutation.mutateAsync({
      changes: input,
      trainingPlanId: formPlan.id,
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
  const confirmDelete = async () => {
    if (deletePlan === undefined) return;
    const previousPage = page;
    const shouldReturnPage = rows.length === 1 && page > 1;
    if (shouldReturnPage) await navigateToPage(page - 1);
    const promise = deleteMutation.mutateAsync(deletePlan.id);
    toast.promise(promise, {
      error: 'Não foi possível excluir o plano.',
      loading: 'Excluindo plano…',
      success: 'Plano excluído.',
    });
    try {
      await promise;
    } catch {
      if (shouldReturnPage) await navigateToPage(previousPage);
    }
  };
  let emptyState = (
    <TrainingPlanTableState
      description="Crie o primeiro plano global para começar."
      kind="empty"
      title="Nenhum plano de treino"
    />
  );
  if (query.isLoading) {
    emptyState = (
      <TrainingPlanTableLoading columnCount={4} label="Carregando planos" />
    );
  } else if (query.isError && query.data === undefined) {
    emptyState = (
      <TrainingPlanTableState
        description="A consulta falhou. Você pode tentar novamente sem sair desta página."
        kind="error"
        onRetry={() => void query.refetch()}
        title="Não foi possível carregar os planos"
      />
    );
  }

  return (
    <div className={styles.page()}>
      <TrainingPlanBreadcrumbs
        mockAuth={mockAuth}
        mockTrainingPlans={mockTrainingPlans}
      />
      <header className={styles.pageHeader()}>
        <div className={styles.titleGroup()}>
          <h1 className={styles.title()}>Planos de treino</h1>
          <p className={styles.description()}>
            Crie e mantenha os modelos globais disponíveis para administração.
          </p>
        </div>
        <Button onPress={() => setFormPlan(undefined)}>
          <Plus aria-hidden="true" className={styles.icon()} />
          Novo plano
        </Button>
      </header>
      {query.isError && query.data !== undefined ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível atualizar os planos.</Alert.Title>
            <Alert.Description>
              Os dados exibidos são a última versão disponível.
            </Alert.Description>
          </Alert.Content>
          <Button onPress={() => void query.refetch()} variant="ghost">
            Tentar novamente
          </Button>
        </Alert>
      ) : null}
      <section aria-label="Planos globais" className={styles.section()}>
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Planos de treino globais">
              <Table.Header>
                <Table.Column isRowHeader>Nome</Table.Column>
                <Table.Column>Descrição</Table.Column>
                <Table.Column>Atualização</Table.Column>
                <Table.Column>Ações</Table.Column>
              </Table.Header>
              <Table.Body items={rows} renderEmptyState={() => emptyState}>
                {(plan) => (
                  <Table.Row id={plan.id}>
                    <Table.Cell>
                      <Link
                        className={styles.planLink()}
                        params={{ trainingPlanId: plan.id }}
                        search={{ mockAuth, mockTrainingPlans }}
                        title={plan.name}
                        to="/global/training-plan/$trainingPlanId"
                      >
                        {plan.name}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      <span
                        className={styles.truncated()}
                        title={plan.description}
                      >
                        {plan.description}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      {new Intl.DateTimeFormat('pt-BR').format(
                        new Date(plan.updatedAt),
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <ActionsMenu
                        ariaLabel={`Ações de ${plan.name}`}
                        onDelete={() => setDeletePlan(plan)}
                        onEdit={() => setFormPlan(plan)}
                      />
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
        {query.data === undefined || query.data.total === 0 ? null : (
          <Pagination aria-label="Paginação dos planos">
            <Pagination.Summary>
              Página {page} de {pageCount}
            </Pagination.Summary>
            <Pagination.Content>
              <Pagination.Item>
                <Pagination.Previous
                  isDisabled={page === 1}
                  onPress={() => void navigateToPage(page - 1)}
                >
                  Anterior
                </Pagination.Previous>
              </Pagination.Item>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <Pagination.Item key={pageNumber}>
                    <Pagination.Link
                      isActive={pageNumber === page}
                      onPress={() => void navigateToPage(pageNumber)}
                    >
                      {pageNumber}
                    </Pagination.Link>
                  </Pagination.Item>
                ),
              )}
              <Pagination.Item>
                <Pagination.Next
                  isDisabled={page >= pageCount}
                  onPress={() => void navigateToPage(page + 1)}
                >
                  Próxima
                </Pagination.Next>
              </Pagination.Item>
            </Pagination.Content>
          </Pagination>
        )}
      </section>
      {formPlan === null ? null : (
        <TrainingPlanFormModal
          key={formPlan?.id ?? 'new'}
          onOpenChange={(open) => {
            if (!open) setFormPlan(null);
          }}
          onSubmit={submitPlan}
          open
          plan={formPlan}
        />
      )}
      <DeleteConfirmationDialog
        description={
          deletePlan === undefined
            ? ''
            : `O plano “${deletePlan.name}” e todos os seus treinos serão removidos.`
        }
        onConfirm={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setDeletePlan(undefined);
        }}
        open={deletePlan !== undefined}
        title="Excluir plano de treino?"
      />
    </div>
  );
}
