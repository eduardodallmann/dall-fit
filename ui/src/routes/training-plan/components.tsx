import type { FormEvent } from 'react';

import {
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
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';
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
              search={{ mockAuth, mockTrainingPlans }}
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
                search={{ mockAuth, mockTrainingPlans }}
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
}

export function TrainingPlanForm({
  defaultValues = { description: '', name: '' },
  legend,
  mode,
  onCancel,
  onSubmit,
  submitLabel,
}: Readonly<TrainingPlanFormProps>) {
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
      await onSubmit({
        description: value.description.trim(),
        name: value.name.trim(),
      });
    },
  });
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
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
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <div className={styles.actions()}>
            {onCancel === undefined ? null : (
              <Button
                isDisabled={isSubmitting}
                onPress={onCancel}
                type="button"
                variant="secondary"
              >
                Cancelar
              </Button>
            )}
            <Button
              isDisabled={!canSubmit}
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
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (value: CreateTrainingPlanRequest) => Promise<void>;
  open: boolean;
  plan?: TrainingPlanSummary;
}

export function TrainingPlanFormModal({
  onOpenChange,
  onSubmit,
  open,
  plan,
}: Readonly<FormModalProps>) {
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
        if (!isOpen) close('escape');
      }}
    >
      <Modal.Backdrop isDismissable={false}>
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
                mode={mode}
                onCancel={() => close('cancel')}
                onSubmit={async (input) => {
                  close('submit');
                  await onSubmit(input);
                }}
                submitLabel={editing ? 'Salvar alterações' : 'Criar plano'}
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
}

export function DeleteConfirmationDialog({
  description,
  onConfirm,
  onOpenChange,
  open,
  surface,
  title,
}: Readonly<DeleteDialogProps>) {
  const close = (reason: 'cancel' | 'close_trigger' | 'confirm') => {
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
        if (!isOpen) close('close_trigger');
      }}
    >
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{description}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button onPress={() => close('cancel')} variant="secondary">
                Cancelar
              </Button>
              <Button
                onPress={() => {
                  close('confirm');
                  void onConfirm();
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
