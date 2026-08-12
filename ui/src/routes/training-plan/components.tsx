import { useState, type FormEvent } from 'react';

import {
  Alert,
  AlertDialog,
  Button,
  Dropdown,
  EmptyState,
  FieldError,
  Fieldset,
  Input,
  Label,
  Modal,
  TextArea,
  TextField,
} from '@heroui/react';
import { useForm } from '@tanstack/react-form';
import { Link } from '@tanstack/react-router';
import {
  ChevronRight,
  EllipsisVertical,
  Inbox,
  TriangleAlert,
} from 'lucide-react';

import type {
  CreateTrainingPlanRequest,
  TrainingPlanSummary,
} from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import { trackUiEvent, type AnalyticsSurface } from '~/core/analytics';
import { trainingPlanStyles } from '~/routes/training-plan/styles';
import { useTrainingPlanFieldAnalytics } from '~/routes/training-plan/training-plan-analytics';
import {
  trainingPlanMockSearch,
  type MockTrainingPlansScenario,
} from '~/routes/training-plan/training-plan-service';
import {
  validateTrainingPlanDescription,
  validateTrainingPlanName,
} from '~/routes/training-plan/training-plan-validation';

const styles = trainingPlanStyles();

interface BreadcrumbProps {
  mockAuth?: MockAuthScenario;
  mockTrainingPlans?: MockTrainingPlansScenario;
  plan?: { id: string; name: string };
  surface: Extract<
    AnalyticsSurface,
    'training_plan_detail' | 'training_plan_list' | 'workout'
  >;
  workout?: { id: string; name: string };
}

export function TrainingPlanBreadcrumbs({
  mockAuth,
  mockTrainingPlans,
  plan,
  surface,
  workout,
}: Readonly<BreadcrumbProps>) {
  const mockSearch =
    mockTrainingPlans === undefined
      ? {}
      : trainingPlanMockSearch(mockTrainingPlans);

  return (
    <nav aria-label="Navegação estrutural">
      <ol aria-label="Navegação estrutural" className={styles.breadcrumbs()}>
        <li className={styles.breadcrumbItem()}>
          <Link
            className={styles.breadcrumbLink()}
            onClick={() => {
              trackUiEvent({
                control: 'breadcrumb_home',
                destination: 'dash',
                eventName: 'ui_navigation_selected',
                navigationKind: 'breadcrumb',
                surface,
              });
            }}
            search={{ mockAuth }}
            to="/dash"
          >
            Home
          </Link>
        </li>
        <li className={styles.breadcrumbItem()}>
          <ChevronRight
            aria-hidden="true"
            className={styles.breadcrumbSeparator()}
          />
          {plan === undefined ? (
            <span aria-current="page">Planos de treino</span>
          ) : (
            <Link
              className={styles.breadcrumbLink()}
              onClick={() => {
                trackUiEvent({
                  control: 'breadcrumb_training_plans',
                  destination: 'training_plan_list',
                  eventName: 'ui_navigation_selected',
                  navigationKind: 'breadcrumb',
                  surface,
                });
              }}
              search={{ mockAuth, ...mockSearch }}
              to="/global/training-plan"
            >
              Planos de treino
            </Link>
          )}
        </li>
        {plan === undefined ? null : (
          <li className={styles.breadcrumbItem()}>
            <ChevronRight
              aria-hidden="true"
              className={styles.breadcrumbSeparator()}
            />
            {workout === undefined ? (
              <span
                aria-current="page"
                className={styles.breadcrumbLabel()}
                title={plan.name}
              >
                {plan.name}
              </span>
            ) : (
              <Link
                className={styles.breadcrumbLink()}
                onClick={() => {
                  trackUiEvent({
                    control: 'breadcrumb_plan',
                    destination: 'training_plan_detail',
                    eventName: 'ui_navigation_selected',
                    navigationKind: 'breadcrumb',
                    surface,
                  });
                }}
                params={{ trainingPlanId: plan.id }}
                search={{ mockAuth, ...mockSearch }}
                title={plan.name}
                to="/global/training-plan/$trainingPlanId"
              >
                <span className={styles.breadcrumbLabel()}>{plan.name}</span>
              </Link>
            )}
          </li>
        )}
        {workout === undefined ? null : (
          <li className={styles.breadcrumbItem()}>
            <ChevronRight
              aria-hidden="true"
              className={styles.breadcrumbSeparator()}
            />
            <span
              aria-current="page"
              className={styles.breadcrumbLabel()}
              title={workout.name}
            >
              {workout.name}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}

interface TrainingPlanFormProps {
  defaultValues?: CreateTrainingPlanRequest;
  legend: string;
  mode: 'create' | 'edit' | 'inline_edit';
  onCancel?: () => void;
  onSubmit: (value: CreateTrainingPlanRequest) => Promise<void>;
  submitLabel: string;
  submissionError?: string;
  isWritePaused?: boolean;
}

export function TrainingPlanForm({
  defaultValues = { description: '', name: '' },
  legend,
  mode,
  onCancel,
  onSubmit,
  submitLabel,
  submissionError = 'Não foi possível enviar o formulário.',
  isWritePaused = false,
}: Readonly<TrainingPlanFormProps>) {
  const [submitting, setSubmitting] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const { trackFieldCompletion, trackFieldFocus } =
    useTrainingPlanFieldAnalytics(defaultValues);
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      trackUiEvent({
        control: 'submit',
        eventName: 'ui_form_submitted',
        form: 'training_plan',
        mode,
        surface: 'training_plan_form',
      });
      setSubmitting(true);
      setSubmissionFailed(false);
      try {
        await onSubmit({
          description: value.description.trim(),
          name: value.name.trim(),
        });
      } catch (error) {
        setSubmissionFailed(true);
        throw error;
      } finally {
        setSubmitting(false);
      }
    },
  });
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit().catch(() => undefined);
  };

  return (
    <form className={styles.form()} onSubmit={handleSubmit}>
      <Fieldset>
        <Fieldset.Legend>{legend}</Fieldset.Legend>
        <Fieldset.Group>
          <form.Field
            name="name"
            validators={{
              onBlur: ({ value }) => validateTrainingPlanName(value),
              onChange: ({ value }) => validateTrainingPlanName(value),
            }}
          >
            {(field) => (
              <TextField
                isDisabled={submitting || isWritePaused}
                isInvalid={field.state.meta.errors.length > 0}
                isRequired
                name={field.name}
              >
                <Label>Nome</Label>
                <Input
                  maxLength={120}
                  onBlur={(event) => {
                    field.handleBlur();
                    trackFieldCompletion('name', event.target.value);
                  }}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onFocus={() => trackFieldFocus('name')}
                  value={field.state.value}
                />
                <FieldError className={styles.fieldError()}>
                  {field.state.meta.errors[0]}
                </FieldError>
              </TextField>
            )}
          </form.Field>
          <form.Field
            name="description"
            validators={{
              onBlur: ({ value }) => validateTrainingPlanDescription(value),
              onChange: ({ value }) => validateTrainingPlanDescription(value),
            }}
          >
            {(field) => (
              <TextField
                isDisabled={submitting || isWritePaused}
                isInvalid={field.state.meta.errors.length > 0}
                isRequired
                name={field.name}
              >
                <Label>Descrição</Label>
                <TextArea
                  maxLength={1000}
                  onBlur={(event) => {
                    field.handleBlur();
                    trackFieldCompletion('description', event.target.value);
                  }}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onFocus={() => trackFieldFocus('description')}
                  rows={5}
                  value={field.state.value}
                />
                <FieldError className={styles.fieldError()}>
                  {field.state.meta.errors[0]}
                </FieldError>
              </TextField>
            )}
          </form.Field>
        </Fieldset.Group>
      </Fieldset>
      {submissionFailed ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{submissionError}</Alert.Title>
            <Alert.Description>
              Seus dados foram preservados. Corrija-os ou tente novamente.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <div className={styles.actions()}>
            {onCancel === undefined ? null : (
              <Button
                isDisabled={isSubmitting || isWritePaused}
                onPress={onCancel}
                type="button"
                variant="secondary"
              >
                Cancelar
              </Button>
            )}
            <Button
              isDisabled={!canSubmit || isWritePaused}
              isPending={isSubmitting}
              type="submit"
            >
              {submitLabel}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}

interface FormModalProps {
  isWritePaused?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (value: CreateTrainingPlanRequest) => Promise<void>;
  open: boolean;
  plan?: TrainingPlanSummary;
}

export function TrainingPlanFormModal({
  isWritePaused = false,
  onOpenChange,
  onSubmit,
  open,
  plan,
}: Readonly<FormModalProps>) {
  const [submitting, setSubmitting] = useState(false);
  const editing = plan !== undefined;
  const mode = editing ? 'edit' : 'create';
  const close = (reason: 'cancel' | 'close_trigger' | 'escape' | 'submit') => {
    trackUiEvent({
      control: 'plan_form',
      eventName: 'ui_overlay_closed',
      overlay: 'plan_form',
      reason,
      surface: 'training_plan_list',
    });
    onOpenChange(false);
  };

  return (
    <Modal
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !submitting) close('escape');
      }}
    >
      <Modal.Backdrop
        isDismissable={false}
        isKeyboardDismissDisabled={submitting}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>
                {editing ? 'Editar plano de treino' : 'Novo plano de treino'}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TrainingPlanForm
                defaultValues={
                  plan === undefined
                    ? undefined
                    : { description: plan.description, name: plan.name }
                }
                legend="Identificação do plano"
                isWritePaused={isWritePaused || submitting}
                mode={mode}
                onCancel={() => close('cancel')}
                onSubmit={async (input) => {
                  setSubmitting(true);
                  try {
                    await onSubmit(input);
                    close('submit');
                  } finally {
                    setSubmitting(false);
                  }
                }}
                submitLabel={editing ? 'Salvar alterações' : 'Criar plano'}
                submissionError={
                  editing
                    ? 'Não foi possível salvar o plano.'
                    : 'Não foi possível criar o plano.'
                }
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

interface DeleteDialogProps {
  description: string;
  onConfirm: () => Promise<void>;
  onOpenChange: (isOpen: boolean) => void;
  open: boolean;
  surface: Extract<
    AnalyticsSurface,
    'training_plan_detail' | 'training_plan_list'
  >;
  title: string;
  isWritePaused?: boolean;
}

export function DeleteConfirmationDialog({
  description,
  onConfirm,
  onOpenChange,
  open,
  surface,
  title,
  isWritePaused = false,
}: Readonly<DeleteDialogProps>) {
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const close = (reason: 'cancel' | 'close_trigger' | 'confirm') => {
    setError(false);
    trackUiEvent({
      control: 'delete_confirmation',
      eventName: 'ui_overlay_closed',
      overlay: 'delete_confirmation',
      reason,
      surface,
    });
    onOpenChange(false);
  };

  return (
    <AlertDialog
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !pending) close('close_trigger');
      }}
    >
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>{description}</p>
              {error ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Não foi possível excluir.</Alert.Title>
                    <Alert.Description>
                      O item foi restaurado. Você pode tentar novamente ou
                      cancelar.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                isDisabled={pending}
                onPress={() => close('cancel')}
                variant="secondary"
              >
                Cancelar
              </Button>
              <Button
                isDisabled={isWritePaused}
                isPending={pending}
                onPress={() => {
                  setError(false);
                  setPending(true);
                  void onConfirm()
                    .then(() => close('confirm'))
                    .catch(() => setError(true))
                    .finally(() => setPending(false));
                }}
                variant="danger"
              >
                Excluir
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

interface ConflictAlertProps {
  onReload: () => Promise<void>;
}

export function TrainingPlanConflictAlert({
  onReload,
}: Readonly<ConflictAlertProps>) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [reloadError, setReloadError] = useState(false);

  return (
    <>
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Este plano foi alterado em outro lugar.</Alert.Title>
          <Alert.Description>
            Seus rascunhos permanecem visíveis, mas novas gravações estão
            pausadas.
          </Alert.Description>
        </Alert.Content>
        <Button onPress={() => setConfirming(true)}>Recarregar dados</Button>
      </Alert>
      <AlertDialog
        isOpen={confirming}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirming(false);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  Descartar alterações locais?
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  A versão mais recente será carregada. Rascunhos locais serão
                  descartados somente se a leitura for concluída.
                </p>
                {reloadError ? (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Não foi possível recarregar.</Alert.Title>
                      <Alert.Description>
                        Os rascunhos foram preservados e as gravações continuam
                        pausadas.
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  isDisabled={pending}
                  onPress={() => setConfirming(false)}
                  variant="secondary"
                >
                  Manter rascunhos
                </Button>
                <Button
                  isPending={pending}
                  onPress={() => {
                    setPending(true);
                    setReloadError(false);
                    void onReload()
                      .then(() => setConfirming(false))
                      .catch(() => setReloadError(true))
                      .finally(() => setPending(false));
                  }}
                  variant="danger"
                >
                  Descartar e recarregar
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}

interface ActionsMenuProps {
  ariaLabel: string;
  onDelete: () => void;
  onEdit?: () => void;
  surface: Extract<
    AnalyticsSurface,
    'training_plan_detail' | 'training_plan_list'
  >;
}

export function ActionsMenu({
  ariaLabel,
  onDelete,
  onEdit,
  surface,
}: Readonly<ActionsMenuProps>) {
  return (
    <Dropdown
      onOpenChange={(isOpen) => {
        if (isOpen) {
          trackUiEvent({
            control: 'row_actions',
            eventName: 'ui_menu_opened',
            menu: 'row_actions',
            surface,
          });
        }
      }}
    >
      <Dropdown.Trigger
        aria-label={ariaLabel}
        className={styles.actionTrigger()}
      >
        <EllipsisVertical aria-hidden="true" className={styles.icon()} />
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label={ariaLabel}
          onAction={(key) => {
            if (key === 'edit') {
              trackUiEvent({
                action: 'edit',
                control: 'row_actions',
                eventName: 'ui_menu_action_selected',
                menu: 'row_actions',
                surface,
              });
              onEdit?.();
            }
            if (key === 'delete') {
              trackUiEvent({
                action: 'delete',
                control: 'row_actions',
                eventName: 'ui_menu_action_selected',
                menu: 'row_actions',
                surface,
              });
              onDelete();
            }
          }}
        >
          {onEdit === undefined ? null : (
            <Dropdown.Item id="edit" textValue="Editar">
              Editar
            </Dropdown.Item>
          )}
          <Dropdown.Item id="delete" textValue="Excluir">
            Excluir
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

interface TableStateProps {
  description: string;
  kind: 'empty' | 'error';
  onRetry?: () => void;
  title: string;
}

export function TrainingPlanTableState({
  description,
  kind,
  onRetry,
  title,
}: Readonly<TableStateProps>) {
  const Icon = kind === 'empty' ? Inbox : TriangleAlert;

  return (
    <EmptyState className={styles.emptyState()}>
      <div className={styles.emptyContent()}>
        <Icon aria-hidden="true" className={styles.emptyIcon()} />
        <h2>{title}</h2>
        <p className={styles.description()}>{description}</p>
        {onRetry === undefined ? null : (
          <Button onPress={onRetry} variant="secondary">
            Tentar novamente
          </Button>
        )}
      </div>
    </EmptyState>
  );
}
