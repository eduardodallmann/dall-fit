import type { FormEvent } from 'react';

import {
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

import { trainingPlanStyles } from '~/routes/training-plan/styles';
import {
  validateTrainingPlanDescription,
  validateTrainingPlanName,
} from '~/routes/training-plan/training-plan-validation';

const styles = trainingPlanStyles();

interface InlineFormProps {
  defaultValues: CreateTrainingPlanRequest;
  onCancel: () => void;
  onSubmit: (value: CreateTrainingPlanRequest) => Promise<void>;
}

export function TrainingPlanInlineForm({
  defaultValues,
  onCancel,
  onSubmit,
}: Readonly<InlineFormProps>) {
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
    <form className={styles.inlineEditor()} onSubmit={handleSubmit}>
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
              isInvalid={field.state.meta.errors.length > 0}
              isRequired
              name={field.name}
            >
              <Label className={styles.srOnly()}>Nome</Label>
              <Input
                autoFocus
                maxLength={120}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
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
                    isDisabled={isSubmitting}
                    isIconOnly
                    onPress={onCancel}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" className={styles.icon()} />
                  </Button>
                  <Button
                    aria-label="Salvar alterações"
                    isDisabled={!canSubmit}
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
            isInvalid={field.state.meta.errors.length > 0}
            isRequired
            name={field.name}
          >
            <Label className={styles.srOnly()}>Descrição</Label>
            <TextArea
              maxLength={1000}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              rows={3}
              value={field.state.value}
            />
            <FieldError className={styles.fieldError()}>
              {field.state.meta.errors[0]}
            </FieldError>
          </TextField>
        )}
      </form.Field>
    </form>
  );
}
