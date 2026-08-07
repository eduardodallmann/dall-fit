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
import { trainingPlanStyles } from '~/routes/training-plan/styles';
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
  workout?: { id: string; name: string };
}

export function TrainingPlanBreadcrumbs({
  mockAuth,
  mockTrainingPlans,
  plan,
  workout,
}: Readonly<BreadcrumbProps>) {
  return (
    <nav aria-label="Navegação estrutural">
      <ol aria-label="Navegação estrutural" className={styles.breadcrumbs()}>
        <li className={styles.breadcrumbItem()}>
          <Link
            className={styles.breadcrumbLink()}
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
  onCancel?: () => void;
  onSubmit: (value: CreateTrainingPlanRequest) => Promise<void>;
  submitLabel: string;
}

export function TrainingPlanForm({
  defaultValues = { description: '', name: '' },
  legend,
  onCancel,
  onSubmit,
  submitLabel,
}: Readonly<TrainingPlanFormProps>) {
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
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
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
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
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
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

  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
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
                onCancel={() => onOpenChange(false)}
                onSubmit={async (input) => {
                  onOpenChange(false);
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
  title: string;
}

export function DeleteConfirmationDialog({
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: Readonly<DeleteDialogProps>) {
  return (
    <AlertDialog isOpen={open} onOpenChange={onOpenChange}>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{description}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button onPress={() => onOpenChange(false)} variant="secondary">
                Cancelar
              </Button>
              <Button
                onPress={() => {
                  onOpenChange(false);
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
}

export function ActionsMenu({
  ariaLabel,
  onDelete,
  onEdit,
}: Readonly<ActionsMenuProps>) {
  return (
    <Dropdown>
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
            if (key === 'edit') onEdit?.();
            if (key === 'delete') onDelete();
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
