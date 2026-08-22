import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, Button, Pagination, Table, toast } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import type {
  CreateTrainingPlanRequest,
  GlobalTrainingPlanSummary,
  TrainingPlanSummary,
} from '@dall-fit/types';

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
import {
  trainingPlanLastPage,
  trainingPlanPaginationItems,
} from '~/routes/training-plan/training-plan-pagination';
import { trainingPlanListQueryOptions } from '~/routes/training-plan/training-plan-queries';
import {
  trainingPlanMockSearch,
  type MockTrainingPlansScenario,
} from '~/routes/training-plan/training-plan-service';

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
  const mockSearch = trainingPlanMockSearch(mockTrainingPlans);
  const [formPlan, setFormPlan] = useState<
    TrainingPlanSummary | null | undefined
  >(null);
  const [deletePlan, setDeletePlan] = useState<GlobalTrainingPlanSummary>();
  const currentPage = useRef(page);
  useEffect(() => {
    currentPage.current = page;
  }, [page]);
  const activePlan =
    formPlan !== null && formPlan !== undefined ? formPlan : deletePlan;
  const aggregate = useAggregateMutationCoordinator(
    activePlan?.id,
    activePlan?.version,
    activePlan !== undefined,
  );
  const rows = query.data?.data ?? [];
  const pageCount =
    query.data === undefined
      ? 1
      : trainingPlanLastPage(query.data.total, query.data.pageSize);
  const isCorrectingPage = query.data !== undefined && page > pageCount;
  const paginationItems =
    query.data === undefined || isCorrectingPage
      ? []
      : trainingPlanPaginationItems(page, pageCount);
  const navigateToPage = useCallback(
    (nextPage: number, replace = false) =>
      navigate({
        replace,
        search: {
          mockAuth,
          ...trainingPlanMockSearch(mockTrainingPlans),
          ...(nextPage === 1 ? {} : { page: nextPage }),
        },
        to: '/global/training-plan',
      }),
    [mockAuth, mockTrainingPlans, navigate],
  );
  useEffect(() => {
    if (!isCorrectingPage) return;
    void navigateToPage(pageCount, true).catch(() => {
      toast.danger('Não foi possível corrigir a página da listagem.');
    });
  }, [isCorrectingPage, navigateToPage, pageCount]);
  const submitPlan = async (input: CreateTrainingPlanRequest) => {
    if (formPlan === null) return;
    const generation = requireActiveSessionGeneration();
    if (formPlan === undefined) {
      const previousPage = page;
      trackUiEvent({
        control: 'submit',
        eventName: 'ui_operation_started',
        operation: 'training_plan_create',
        surface: 'training_plan_form',
      });
      try {
        await navigateToPage(1);
        await createMutation.mutateAsync({ generation, input });
        toast.success('Plano criado.');
        trackUiEvent({
          control: 'submit',
          eventName: 'ui_operation_completed',
          operation: 'training_plan_create',
          outcome: 'success',
          surface: 'training_plan_form',
        });
      } catch (error) {
        if (isExpectedCancellation(error)) throw error;
        trackUiEvent({
          control: 'submit',
          eventName: 'ui_operation_completed',
          operation: 'training_plan_create',
          outcome: 'error',
          surface: 'training_plan_form',
        });
        if (currentPage.current === 1) await navigateToPage(previousPage);
        throw error;
      }

      return;
    }

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
        trainingPlanId: formPlan.id,
        version: formPlan.version,
      });
      toast.success('Plano atualizado.');
      trackUiEvent({
        control: 'submit',
        eventName: 'ui_operation_completed',
        operation: 'training_plan_update',
        outcome: 'success',
        surface: 'training_plan_form',
      });
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
  const confirmDelete = async () => {
    if (deletePlan === undefined) return;
    const generation = requireActiveSessionGeneration();
    trackUiEvent({
      control: 'delete_confirmation',
      eventName: 'ui_operation_started',
      operation: 'training_plan_delete',
      surface: 'training_plan_list',
    });
    const previousPage = page;
    const shouldReturnPage = rows.length === 1 && page > 1;
    try {
      if (shouldReturnPage) await navigateToPage(page - 1);
      await deleteMutation.mutateAsync({
        generation,
        trainingPlanId: deletePlan.id,
        version: deletePlan.version,
      });
      toast.success('Plano excluído.');
      trackUiEvent({
        control: 'delete_confirmation',
        eventName: 'ui_operation_completed',
        operation: 'training_plan_delete',
        outcome: 'success',
        surface: 'training_plan_list',
      });
    } catch (error) {
      if (isExpectedCancellation(error)) throw error;
      toast.danger('Não foi possível excluir o plano.');
      trackUiEvent({
        control: 'delete_confirmation',
        eventName: 'ui_operation_completed',
        operation: 'training_plan_delete',
        outcome: 'error',
        surface: 'training_plan_list',
      });
      if (shouldReturnPage && currentPage.current === page - 1)
        await navigateToPage(previousPage);
      throw error;
    }
  };
  const reloadConflict = async () => {
    if (activePlan === undefined) return;
    trackUiEvent({
      control: 'retry',
      eventName: 'ui_retry_requested',
      resource: 'training_plans',
      surface: 'training_plan_list',
    });
    const result = await query.refetch();
    const latest = result.data?.data.find((plan) => plan.id === activePlan.id);
    if (!result.isSuccess || latest === undefined)
      throw result.error ?? new Error('Training plan reload failed.');
    await aggregate.reset(latest.version);
    if (aggregate.pauseReason === 'conflict') {
      setFormPlan(null);
      setDeletePlan(undefined);
    }
  };
  let emptyState = (
    <TrainingPlanTableState
      description="Crie o primeiro plano global para começar."
      kind="empty"
      title="Nenhum plano de treino"
    />
  );
  if (query.isLoading || isCorrectingPage) {
    emptyState = (
      <TrainingPlanTableLoading columnCount={5} label="Carregando planos" />
    );
  } else if (query.isError && query.data === undefined) {
    emptyState = (
      <TrainingPlanTableState
        description="A consulta falhou. Você pode tentar novamente sem sair desta página."
        kind="error"
        onRetry={() => {
          trackUiEvent({
            control: 'retry',
            eventName: 'ui_retry_requested',
            resource: 'training_plans',
            surface: 'training_plan_list',
          });
          query.refetch().catch(() => undefined);
        }}
        title="Não foi possível carregar os planos"
      />
    );
  }

  return (
    <div className={styles.page()}>
      <TrainingPlanBreadcrumbs
        mockAuth={mockAuth}
        mockTrainingPlans={mockTrainingPlans}
        surface="training_plan_list"
      />
      <header className={styles.pageHeader()}>
        <div className={styles.titleGroup()}>
          <h1 className={styles.title()}>Planos de treino</h1>
          <p className={styles.description()}>
            Crie e mantenha os modelos globais disponíveis para administração.
          </p>
        </div>
        <Button
          onPress={() => {
            trackUiEvent({
              control: 'new_plan',
              eventName: 'ui_overlay_opened',
              mode: 'create',
              overlay: 'plan_form',
              surface: 'training_plan_list',
            });
            setFormPlan(undefined);
          }}
        >
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
          <Button
            onPress={() => {
              trackUiEvent({
                control: 'retry',
                eventName: 'ui_retry_requested',
                resource: 'training_plans',
                surface: 'training_plan_list',
              });
              query.refetch().catch(() => undefined);
            }}
            variant="ghost"
          >
            Tentar novamente
          </Button>
        </Alert>
      ) : null}
      {aggregate.paused ? (
        <TrainingPlanConflictAlert
          onReload={reloadConflict}
          reason={aggregate.pauseReason}
        />
      ) : null}
      <section aria-label="Planos globais" className={styles.section()}>
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Planos de treino globais">
              <Table.Header>
                <Table.Column isRowHeader>Nome</Table.Column>
                <Table.Column>Descrição</Table.Column>
                <Table.Column>Atualização</Table.Column>
                <Table.Column>Uso</Table.Column>
                <Table.Column>Ações</Table.Column>
              </Table.Header>
              <Table.Body items={rows} renderEmptyState={() => emptyState}>
                {(plan) => (
                  <Table.Row id={plan.id}>
                    <Table.Cell>
                      <Link
                        className={styles.planLink()}
                        onClick={() => {
                          trackUiEvent({
                            control: 'plan_link',
                            destination: 'training_plan_detail',
                            eventName: 'ui_navigation_selected',
                            navigationKind: 'row_link',
                            surface: 'training_plan_list',
                          });
                        }}
                        params={{ trainingPlanId: plan.id }}
                        search={{ mockAuth, ...mockSearch }}
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
                      {plan.usage.linkedPeople} vinculadas ·{' '}
                      {plan.usage.activePeople} ativas
                    </Table.Cell>
                    <Table.Cell>
                      <ActionsMenu
                        ariaLabel={`Ações de ${plan.name}`}
                        onDelete={() => {
                          trackUiEvent({
                            control: 'delete_confirmation',
                            eventName: 'ui_overlay_opened',
                            overlay: 'delete_confirmation',
                            surface: 'training_plan_list',
                          });
                          setDeletePlan(plan);
                        }}
                        onEdit={() => {
                          trackUiEvent({
                            control: 'plan_form',
                            eventName: 'ui_overlay_opened',
                            mode: 'edit',
                            overlay: 'plan_form',
                            surface: 'training_plan_list',
                          });
                          setFormPlan(plan);
                        }}
                        surface="training_plan_list"
                      />
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
        {query.data === undefined ||
        query.data.total === 0 ||
        pageCount <= 1 ||
        isCorrectingPage ? null : (
          <Pagination aria-label="Paginação dos planos">
            <Pagination.Summary>
              Página {page} de {pageCount}
            </Pagination.Summary>
            <Pagination.Content>
              <Pagination.Item>
                <Pagination.Previous
                  isDisabled={page === 1}
                  onPress={() => {
                    trackUiEvent({
                      control: 'pagination_previous',
                      destination: 'training_plan_list',
                      eventName: 'ui_navigation_selected',
                      navigationKind: 'pagination',
                      surface: 'training_plan_list',
                    });
                    void navigateToPage(page - 1).catch(() => {
                      toast.danger(
                        'Não foi possível mudar a página da listagem.',
                      );
                    });
                  }}
                >
                  Anterior
                </Pagination.Previous>
              </Pagination.Item>
              {paginationItems.map((item, index) =>
                item === 'ellipsis' ? (
                  <Pagination.Item key={`ellipsis-${index}`}>
                    <Pagination.Ellipsis />
                  </Pagination.Item>
                ) : (
                  <Pagination.Item key={item}>
                    <Pagination.Link
                      isActive={item === page}
                      onPress={() => {
                        trackUiEvent({
                          control: 'pagination_page',
                          destination: 'training_plan_list',
                          eventName: 'ui_navigation_selected',
                          navigationKind: 'pagination',
                          surface: 'training_plan_list',
                        });
                        void navigateToPage(item).catch(() => {
                          toast.danger(
                            'Não foi possível mudar a página da listagem.',
                          );
                        });
                      }}
                    >
                      {item}
                    </Pagination.Link>
                  </Pagination.Item>
                ),
              )}
              <Pagination.Item>
                <Pagination.Next
                  isDisabled={page >= pageCount}
                  onPress={() => {
                    trackUiEvent({
                      control: 'pagination_next',
                      destination: 'training_plan_list',
                      eventName: 'ui_navigation_selected',
                      navigationKind: 'pagination',
                      surface: 'training_plan_list',
                    });
                    void navigateToPage(page + 1).catch(() => {
                      toast.danger(
                        'Não foi possível mudar a página da listagem.',
                      );
                    });
                  }}
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
          isWritePaused={aggregate.paused}
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
            : `O plano “${deletePlan.name}” e todos os seus treinos serão removidos. ${deletePlan.usage.linkedPeople} pessoa(s) vinculada(s), sendo ${deletePlan.usage.activePeople} com este plano ativo, serão impactadas.`
        }
        isWritePaused={aggregate.paused}
        onConfirm={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setDeletePlan(undefined);
        }}
        open={deletePlan !== undefined}
        surface="training_plan_list"
        title="Excluir plano de treino?"
      />
    </div>
  );
}
