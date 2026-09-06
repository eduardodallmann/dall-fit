import { useState, type FormEvent, type KeyboardEvent } from 'react';

import {
  Alert,
  Button,
  FieldError,
  Input,
  Label,
  TextArea,
  TextField,
} from '@heroui/react';
import { useForm } from '@tanstack/react-form';
import { Check, X } from 'lucide-react';

import type { CreateTrainingPlanRequest } from '@dall-fit/types';

import { trackUiEvent } from '~/core/analytics';
import { ReloadBlocker } from '~/core/reload-safety/reload-blocker';
import { trainingPlanStyles } from '~/routes/training-plan/styles';
import { useTrainingPlanFieldAnalytics } from '~/routes/training-plan/training-plan-analytics';
import {
  validateTrainingPlanDescription,
  validateTrainingPlanName,
} from '~/routes/training-plan/training-plan-validation';

const styles = trainingPlanStyles();

interface InlineFormProps {
  defaultValues: CreateTrainingPlanRequest;
  onCancel: () => void;
  onSubmit: (value: CreateTrainingPlanRequest) => Promise<void>;
  isWritePaused?: boolean;
}

export function TrainingPlanInlineForm({
  defaultValues,
  onCancel,
  onSubmit,
  isWritePaused = false,
}: Readonly<InlineFormProps>) {
  const [submissionError, setSubmissionError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { trackFieldCompletion, trackFieldFocus } =
    useTrainingPlanFieldAnalytics(defaultValues);
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setSubmissionError(false);
      trackUiEvent({
        control: 'submit',
        eventName: 'ui_form_submitted',
        form: 'training_plan',
        mode: 'inline_edit',
        surface: 'training_plan_form',
      });
      try {
        setSubmitting(true);
        await onSubmit({
          description: value.description.trim(),
          name: value.name.trim(),
        });
      } catch (error) {
        setSubmissionError(true);
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
  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!event.ctrlKey || event.key !== 'Enter') return;
    event.preventDefault();
    void form.handleSubmit().catch(() => undefined);
  };

  return (
    <form className={styles.inlineEditor()} onSubmit={handleSubmit}>
      <form.Subscribe selector={(state) => state.isDefaultValue}>
        {(isDefaultValue) => <ReloadBlocker active={!isDefaultValue} />}
      </form.Subscribe>
      <form.Field
        name="name"
        validators={{
          onBlur: ({ value }) => validateTrainingPlanName(value),
          onChange: ({ value }) => validateTrainingPlanName(value),
        }}
      >
        {(field) => (
          <div className={styles.inlineTitleRow()}>
            <TextField
              className={styles.inlineTitleField()}
              isDisabled={submitting || isWritePaused}
              isInvalid={field.state.meta.errors.length > 0}
              isRequired
              name={field.name}
            >
              <Label className={styles.srOnly()}>Nome</Label>
              <Input
                autoFocus
                maxLength={120}
                onBlur={(event) => {
                  field.handleBlur();
                  trackFieldCompletion('name', event.target.value);
                }}
                onChange={(event) => field.handleChange(event.target.value)}
                onFocus={() => trackFieldFocus('name')}
                onKeyDown={handleTitleKeyDown}
                value={field.state.value}
              />
              <FieldError className={styles.fieldError()}>
                {field.state.meta.errors[0]}
              </FieldError>
            </TextField>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <div className={styles.inlineActions()}>
                  <Button
                    aria-label="Cancelar edição"
                    isDisabled={isSubmitting || isWritePaused}
                    isIconOnly
                    onPress={() => {
                      trackUiEvent({
                        action: 'cancel_inline_edit',
                        control: 'cancel',
                        eventName: 'ui_button_pressed',
                        surface: 'training_plan_detail',
                      });
                      onCancel();
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" className={styles.icon()} />
                  </Button>
                  <Button
                    aria-label="Salvar alterações"
                    isDisabled={!canSubmit || isWritePaused}
                    isIconOnly
                    isPending={isSubmitting}
                    size="sm"
                    type="submit"
                  >
                    <Check aria-hidden="true" className={styles.icon()} />
                  </Button>
                </div>
              )}
            </form.Subscribe>
          </div>
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
            className={styles.inlineDescriptionField()}
            isDisabled={submitting || isWritePaused}
            isInvalid={field.state.meta.errors.length > 0}
            isRequired
            name={field.name}
          >
            <Label className={styles.srOnly()}>Descrição</Label>
            <TextArea
              maxLength={1000}
              onBlur={(event) => {
                field.handleBlur();
                trackFieldCompletion('description', event.target.value);
              }}
              onChange={(event) => field.handleChange(event.target.value)}
              onFocus={() => trackFieldFocus('description')}
              rows={3}
              value={field.state.value}
            />
            <FieldError className={styles.fieldError()}>
              {field.state.meta.errors[0]}
            </FieldError>
          </TextField>
        )}
      </form.Field>
      {submissionError ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível salvar o plano.</Alert.Title>
            <Alert.Description>
              O rascunho foi preservado. Tente novamente ou cancele a edição.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </form>
  );
}
