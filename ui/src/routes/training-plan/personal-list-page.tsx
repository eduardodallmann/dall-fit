import { useState } from 'react';

import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dropdown,
  Modal,
  Pagination,
  Table,
  toast,
} from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDown, Copy, Plus, RotateCcw, X } from 'lucide-react';

import type {
  CreateTrainingPlanRequest,
  GlobalTrainingPlanLibraryItem,
  PersonalTrainingPlanListItem,
} from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import { useOfflinePreparation } from '~/core/platform/native/offline-preparation-context';
import { dashboardKeys } from '~/routes/dashboard/dashboard-queries';
import {
  ActionsMenu,
  DeleteConfirmationDialog,
  TrainingPlanFormModal,
  TrainingPlanTableState,
} from '~/routes/training-plan/components';
import {
  activatePersonalTrainingPlan,
  cancelTrainingPlanClone,
  createGlobalTrainingPlanReference,
  createPersonalTrainingPlan,
  deletePersonalTrainingPlan,
  retryTrainingPlanClone,
  startTrainingPlanClone,
} from '~/routes/training-plan/personal-training-plan-service';
import { trainingPlanStyles } from '~/routes/training-plan/styles';
import { TrainingPlanAssistantModal } from '~/routes/training-plan/training-plan-assistant';
import {
  personalTrainingPlanListQueryOptions,
  trainingPlanKeys,
  trainingPlanLibraryQueryOptions,
} from '~/routes/training-plan/training-plan-queries';
import {
  trainingPlanMockSearch,
  type MockTrainingPlansScenario,
} from '~/routes/training-plan/training-plan-service';
import { trainingKeys } from '~/routes/training/training-queries';

const styles = trainingPlanStyles();

interface PersonalListPageProps {
  mockAuth?: MockAuthScenario;
  mockTrainingPlans: MockTrainingPlansScenario;
  page: number;
}

export function PersonalTrainingPlanListPage({
  mockAuth,
  mockTrainingPlans,
  page,
}: Readonly<PersonalListPageProps>) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const offlinePreparation = useOfflinePreparation();
  const query = useQuery(
    personalTrainingPlanListQueryOptions(page, mockTrainingPlans),
  );
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [libraryPage, setLibraryPage] = useState(1);
  const [deleteItem, setDeleteItem] =
    useState<
      Extract<PersonalTrainingPlanListItem, { itemType: 'training-plan' }>
    >();
  const mockSearch = trainingPlanMockSearch(mockTrainingPlans);
  const invalidateCatalog = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trainingPlanKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: trainingPlanKeys.libraries() }),
    ]);
  };
  const createMutation = useMutation({
    mutationFn: (input: CreateTrainingPlanRequest) =>
      createPersonalTrainingPlan(input, mockTrainingPlans),
    onSuccess: invalidateCatalog,
  });
  const activateMutation = useMutation({
    mutationFn: ({
      active,
      catalogEntryId,
    }: {
      active: boolean;
      catalogEntryId: string;
    }) =>
      activatePersonalTrainingPlan(catalogEntryId, active, mockTrainingPlans),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: trainingKeys.all });
      await queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      await offlinePreparation?.replaceActivePlan();
      await invalidateCatalog();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (item: NonNullable<typeof deleteItem>) =>
      deletePersonalTrainingPlan(
        item.catalogEntryId,
        item.source === 'owned' ? item.version : undefined,
        mockTrainingPlans,
      ),
    onSuccess: async (_, item) => {
      if (item.active)
        queryClient.removeQueries({ queryKey: trainingKeys.all });
      if (item.active) await offlinePreparation?.replaceActivePlan();
      await invalidateCatalog();
    },
  });
  const cloneMutation = useMutation({
    mutationFn: (globalTrainingPlanId: string) =>
      startTrainingPlanClone(globalTrainingPlanId, mockTrainingPlans),
    onSuccess: invalidateCatalog,
  });
  const referenceMutation = useMutation({
    mutationFn: (globalTrainingPlanId: string) =>
      createGlobalTrainingPlanReference(
        globalTrainingPlanId,
        mockTrainingPlans,
      ),
    onSuccess: invalidateCatalog,
  });
  const retryMutation = useMutation({
    mutationFn: (cloneJobId: string) =>
      retryTrainingPlanClone(cloneJobId, mockTrainingPlans),
    onSuccess: invalidateCatalog,
  });
  const cancelMutation = useMutation({
    mutationFn: (cloneJobId: string) =>
      cancelTrainingPlanClone(cloneJobId, mockTrainingPlans),
    onSuccess: invalidateCatalog,
  });
  const rows = query.data?.data ?? [];
  const activeLimitReached = (query.data?.activeCount ?? 0) >= 5;
  const pageCount = Math.max(
    1,
    Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 20)),
  );

  return (
    <div className={styles.page()}>
      <header className={styles.pageHeader()}>
        <div className={styles.titleGroup()}>
          <h1 className={styles.title()}>Meus planos</h1>
          <p className={styles.description()}>
            Crie planos próprios ou use modelos disponibilizados.
          </p>
        </div>
        <Dropdown>
          <Dropdown.Trigger className={styles.newPlanTrigger()}>
            <Plus aria-hidden="true" className={styles.icon()} />
            Novo plano
            <ChevronDown aria-hidden="true" className={styles.icon()} />
          </Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu
              aria-label="Criar ou copiar plano"
              onAction={(key) => {
                if (key === 'create') setCreating(true);
                if (key === 'copy') setCopying(true);
                if (key === 'assistant') setAssistantOpen(true);
              }}
            >
              <Dropdown.Item id="create" textValue="Criar novo plano">
                Criar novo plano
              </Dropdown.Item>
              <Dropdown.Item id="copy" textValue="Copiar um plano">
                Copiar um plano
              </Dropdown.Item>
              <Dropdown.Item id="assistant" textValue="Me ajude a criar">
                Me ajude a criar
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </header>
      {query.isError ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível carregar seus planos.</Alert.Title>
          </Alert.Content>
          <Button onPress={() => void query.refetch()} variant="secondary">
            Tentar novamente
          </Button>
        </Alert>
      ) : null}
      <section aria-label="Meus planos de treino" className={styles.section()}>
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Meus planos de treino">
              <Table.Header>
                <Table.Column isRowHeader>Nome</Table.Column>
                <Table.Column>Origem</Table.Column>
                <Table.Column>Em uso</Table.Column>
                <Table.Column>Atualização</Table.Column>
                <Table.Column>Ações</Table.Column>
              </Table.Header>
              <Table.Body
                items={rows}
                renderEmptyState={() => (
                  <TrainingPlanTableState
                    description="Crie um plano ou escolha um modelo disponibilizado."
                    kind="empty"
                    title={
                      query.isLoading ? 'Carregando planos' : 'Nenhum plano'
                    }
                  />
                )}
              >
                {(item) =>
                  item.itemType === 'clone-job' ? (
                    <Table.Row id={`clone-${item.cloneJobId}`}>
                      <Table.Cell>
                        <span className={styles.truncated()}>
                          {item.sourceName}
                        </span>
                        <span className={styles.description()}>
                          {cloneStateLabel(
                            item.state,
                            item.completedImages,
                            item.totalImages,
                          )}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <Chip color="accent" variant="soft">
                          <Chip.Label>Clonando</Chip.Label>
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>—</Table.Cell>
                      <Table.Cell>
                        {new Intl.DateTimeFormat('pt-BR').format(
                          new Date(item.updatedAt),
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <div className={styles.inlineActions()}>
                          {item.state === 'failed' ||
                          item.state === 'start-failed' ? (
                            <Button
                              aria-label={`Tentar novamente ${item.sourceName}`}
                              isIconOnly
                              isPending={retryMutation.isPending}
                              onPress={() =>
                                void retryMutation.mutateAsync(item.cloneJobId)
                              }
                              size="sm"
                              variant="ghost"
                            >
                              <RotateCcw
                                aria-hidden="true"
                                className={styles.icon()}
                              />
                            </Button>
                          ) : null}
                          <Button
                            aria-label={`Cancelar clonagem de ${item.sourceName}`}
                            isIconOnly
                            isPending={cancelMutation.isPending}
                            onPress={() =>
                              void cancelMutation.mutateAsync(item.cloneJobId)
                            }
                            size="sm"
                            variant="ghost"
                          >
                            <X aria-hidden="true" className={styles.icon()} />
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    <Table.Row
                      className={item.active ? styles.activeRow() : undefined}
                      id={item.catalogEntryId}
                    >
                      <Table.Cell>
                        <Link
                          className={styles.planLink()}
                          params={{ catalogEntryId: item.catalogEntryId }}
                          search={{ mockAuth, ...mockSearch }}
                          to="/training-plan/$catalogEntryId"
                        >
                          {item.name}
                        </Link>
                      </Table.Cell>
                      <Table.Cell>
                        {item.source === 'owned'
                          ? 'Próprio'
                          : 'Modelo disponibilizado'}
                      </Table.Cell>
                      <Table.Cell>
                        <Checkbox
                          aria-label={`Usar ${item.name}`}
                          isDisabled={
                            activateMutation.isPending ||
                            (!item.active && activeLimitReached)
                          }
                          isSelected={item.active}
                          onChange={(active) => {
                            void activateMutation.mutateAsync({
                              active,
                              catalogEntryId: item.catalogEntryId,
                            });
                          }}
                        >
                          <Checkbox.Content>
                            <Checkbox.Control
                              className={styles.activeCheckbox()}
                            >
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                            <span className={styles.srOnly()}>
                              Usar {item.name}
                            </span>
                          </Checkbox.Content>
                        </Checkbox>
                      </Table.Cell>
                      <Table.Cell>
                        {new Intl.DateTimeFormat('pt-BR').format(
                          new Date(item.updatedAt),
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <ActionsMenu
                          ariaLabel={`Ações de ${item.name}`}
                          onDelete={() => setDeleteItem(item)}
                          onEdit={
                            item.source === 'owned'
                              ? () =>
                                  void navigate({
                                    params: {
                                      catalogEntryId: item.catalogEntryId,
                                    },
                                    search: { mockAuth, ...mockSearch },
                                    to: '/training-plan/$catalogEntryId',
                                  })
                              : undefined
                          }
                          surface="training_plan_list"
                        />
                      </Table.Cell>
                    </Table.Row>
                  )
                }
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
        {pageCount > 1 ? (
          <Pagination aria-label="Paginação dos meus planos">
            <Pagination.Summary>
              Página {page} de {pageCount}
            </Pagination.Summary>
            <Pagination.Content>
              <Pagination.Item>
                <Pagination.Previous
                  isDisabled={page <= 1}
                  onPress={() =>
                    void navigate({
                      search: { mockAuth, page: page - 1 },
                      to: '/training-plan',
                    })
                  }
                >
                  Anterior
                </Pagination.Previous>
              </Pagination.Item>
              <Pagination.Item>
                <Pagination.Next
                  isDisabled={page >= pageCount}
                  onPress={() =>
                    void navigate({
                      search: { mockAuth, page: page + 1 },
                      to: '/training-plan',
                    })
                  }
                >
                  Próxima
                </Pagination.Next>
              </Pagination.Item>
            </Pagination.Content>
          </Pagination>
        ) : null}
      </section>
      {activeLimitReached ? (
        <p aria-live="polite" className={styles.description()}>
          Você pode manter até 5 planos em uso. Desmarque um plano para
          selecionar outro.
        </p>
      ) : null}
      {creating ? (
        <TrainingPlanFormModal
          hideLegend
          onOpenChange={setCreating}
          onSubmit={async (input) => {
            await createMutation.mutateAsync(input);
            toast.success('Plano criado.');
          }}
          open
        />
      ) : null}
      <TrainingPlanLibraryModal
        cloningPlanId={
          cloneMutation.isPending ? cloneMutation.variables : undefined
        }
        mockTrainingPlans={mockTrainingPlans}
        onClone={async (plan) => {
          await cloneMutation.mutateAsync(plan.id);
          toast.success('Clonagem iniciada.');
          setCopying(false);
        }}
        onOpenChange={setCopying}
        onPageChange={setLibraryPage}
        onReference={async (plan) => {
          await referenceMutation.mutateAsync(plan.id);
          toast.success('Plano adicionado.');
          setCopying(false);
        }}
        open={copying}
        page={libraryPage}
        referencingPlanId={
          referenceMutation.isPending ? referenceMutation.variables : undefined
        }
      />
      <TrainingPlanAssistantModal
        mockTrainingPlans={mockTrainingPlans}
        onOpenChange={setAssistantOpen}
        open={assistantOpen}
      />
      <DeleteConfirmationDialog
        description={
          deleteItem?.source === 'global-reference'
            ? 'O modelo disponibilizado será removido da sua lista. O original não será excluído.'
            : 'O plano e todos os seus treinos serão excluídos.'
        }
        onConfirm={async () => {
          if (deleteItem === undefined) return;
          await deleteMutation.mutateAsync(deleteItem);
          toast.success('Plano excluído.');
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteItem(undefined);
        }}
        open={deleteItem !== undefined}
        surface="training_plan_list"
        title="Excluir plano?"
      />
    </div>
  );
}

interface LibraryModalProps {
  cloningPlanId?: string;
  mockTrainingPlans: MockTrainingPlansScenario;
  onClone: (plan: GlobalTrainingPlanLibraryItem) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onPageChange: (page: number) => void;
  onReference: (plan: GlobalTrainingPlanLibraryItem) => Promise<void>;
  open: boolean;
  page: number;
  referencingPlanId?: string;
}

function TrainingPlanLibraryModal({
  cloningPlanId,
  mockTrainingPlans,
  onClone,
  onOpenChange,
  onPageChange,
  onReference,
  open,
  page,
  referencingPlanId,
}: Readonly<LibraryModalProps>) {
  const query = useQuery({
    ...trainingPlanLibraryQueryOptions(page, mockTrainingPlans),
    enabled: open,
  });
  const pageCount = Math.max(
    1,
    Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 20)),
  );
  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Copiar um modelo</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className={styles.libraryList()}>
                {query.isSuccess && query.data.data.length === 0 ? (
                  <div className={styles.emptyContent()}>
                    <h3>Nenhum modelo disponível</h3>
                    <p className={styles.description()}>
                      Feche esta janela e tente novamente mais tarde.
                    </p>
                  </div>
                ) : null}
                {query.data?.data.map((plan) => {
                  const clonePending = cloningPlanId === plan.id;
                  const referencePending = referencingPlanId === plan.id;
                  const actionPending = clonePending || referencePending;
                  return (
                    <article className={styles.libraryItem()} key={plan.id}>
                      <div className={styles.titleGroup()}>
                        <h3>{plan.name}</h3>
                        <p className={styles.description()}>
                          {plan.description}
                        </p>
                        <p className={styles.description()}>
                          {plan.workoutCount} treinos · {plan.exerciseCount}{' '}
                          exercícios
                        </p>
                        {plan.workouts.map((workout) => (
                          <p
                            className={styles.libraryPreview()}
                            key={workout.id}
                          >
                            {workout.name}:{' '}
                            {workout.exercises
                              .map((exercise) => exercise.name)
                              .join(', ') || 'sem exercícios'}
                            {workout.hiddenExerciseCount > 0
                              ? ` e mais ${workout.hiddenExerciseCount}`
                              : ''}
                          </p>
                        ))}
                      </div>
                      <div className={styles.actions()}>
                        <Button
                          isDisabled={
                            plan.cloneBlocked ||
                            plan.referenced ||
                            actionPending
                          }
                          isPending={referencePending}
                          onPress={() => void onReference(plan)}
                          variant="secondary"
                        >
                          Usar esse plano
                        </Button>
                        <Button
                          isDisabled={plan.cloneBlocked || actionPending}
                          isPending={clonePending}
                          onPress={() => void onClone(plan)}
                        >
                          <Copy aria-hidden="true" className={styles.icon()} />
                          Clonar
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {query.isError ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>
                      Não foi possível carregar os modelos disponíveis.
                    </Alert.Title>
                  </Alert.Content>
                </Alert>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              {pageCount > 1 ? (
                <div className={styles.inlineActions()}>
                  <Button
                    isDisabled={page <= 1}
                    onPress={() => onPageChange(page - 1)}
                    variant="ghost"
                  >
                    Anterior
                  </Button>
                  <span>
                    {page} de {pageCount}
                  </span>
                  <Button
                    isDisabled={page >= pageCount}
                    onPress={() => onPageChange(page + 1)}
                    variant="ghost"
                  >
                    Próxima
                  </Button>
                </div>
              ) : null}
              <Button onPress={() => onOpenChange(false)} variant="secondary">
                Fechar
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function cloneStateLabel(
  state: Extract<
    PersonalTrainingPlanListItem,
    { itemType: 'clone-job' }
  >['state'],
  completedImages: number,
  totalImages: number | null,
): string {
  if (state === 'failed' || state === 'start-failed')
    return 'Falha na clonagem';
  if (state === 'cancelling') return 'Cancelando clonagem';
  if (totalImages === null) return 'Preparando clonagem';
  return `Clonando imagens: ${completedImages} de ${totalImages}`;
}
