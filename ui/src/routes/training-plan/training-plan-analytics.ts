import { useRef } from 'react';

import { trackUiEvent } from '~/core/analytics';
import {
  validateTrainingPlanDescription,
  validateTrainingPlanName,
} from '~/routes/training-plan/training-plan-validation';

type TrainingPlanField = 'description' | 'name';

function getFieldState(
  field: TrainingPlanField,
  value: string,
): 'empty' | 'invalid' | 'valid' {
  if (value.trim().length === 0) {
    return 'empty';
  }

  const validator =
    field === 'name'
      ? validateTrainingPlanName
      : validateTrainingPlanDescription;
  const result = validator(value) === undefined ? 'valid' : 'invalid';

  return result;
}

export function useTrainingPlanFieldAnalytics(
  initialValues: Readonly<Record<TrainingPlanField, string>>,
) {
  const focusedFieldsRef = useRef(new Set<TrainingPlanField>());
  const lastCompletedValuesRef = useRef({ ...initialValues });

  const trackFieldFocus = (field: TrainingPlanField) => {
    if (focusedFieldsRef.current.has(field)) {
      return;
    }

    focusedFieldsRef.current.add(field);
    trackUiEvent({
      control: field === 'name' ? 'name_field' : 'description_field',
      eventName: 'ui_field_focused',
      field,
      form: 'training_plan',
      surface: 'training_plan_form',
    });
  };
  const trackFieldCompletion = (field: TrainingPlanField, value: string) => {
    if (lastCompletedValuesRef.current[field] === value) {
      return;
    }

    lastCompletedValuesRef.current[field] = value;
    trackUiEvent({
      control: field === 'name' ? 'name_field' : 'description_field',
      eventName: 'ui_field_completed',
      field,
      form: 'training_plan',
      state: getFieldState(field, value),
      surface: 'training_plan_form',
    });
  };
  const result = { trackFieldCompletion, trackFieldFocus };

  return result;
}
