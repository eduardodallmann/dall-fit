import { useRef } from 'react';

import type { TermsFields } from '@dall-fit/types';

import { trackUiEvent } from '~/core/analytics';

export type TermsAction =
  | 'accept'
  | 'copy'
  | 'retry'
  | 'create'
  | 'save'
  | 'preview'
  | 'publish'
  | 'delete'
  | 'read'
  | 'page'
  | 'declare'
  | 'cancel';
export function trackTerms(action: TermsAction): void {
  trackUiEvent({
    control: 'terms_action',
    surface: 'terms',
    eventName: 'ui_terms_action',
    action,
  });
}
export async function runTermsOperation<T>(
  operation:
    | 'terms_accept'
    | 'terms_copy'
    | 'terms_create'
    | 'terms_save'
    | 'terms_preview'
    | 'terms_publish'
    | 'terms_delete'
    | 'terms_retry',
  run: () => Promise<T>,
): Promise<T> {
  trackUiEvent({
    control: 'terms_action',
    surface: 'terms',
    eventName: 'ui_operation_started',
    operation,
  });
  try {
    const result = await run();
    trackUiEvent({
      control: 'terms_action',
      surface: 'terms',
      eventName: 'ui_operation_completed',
      operation,
      outcome: 'success',
    });
    return result;
  } catch (error: unknown) {
    trackUiEvent({
      control: 'terms_action',
      surface: 'terms',
      eventName: 'ui_operation_completed',
      operation,
      outcome: 'error',
    });
    throw error;
  }
}

export function useTermsFieldAnalytics() {
  const focused = useRef(new Set<keyof TermsFields>());
  const completed = useRef(new Map<keyof TermsFields, string>());
  return {
    focus: (field: keyof TermsFields) => {
      if (focused.current.has(field)) return;
      focused.current.add(field);
      trackUiEvent({
        control: 'terms_action',
        surface: 'terms',
        eventName: 'ui_field_focused',
        field,
        form: 'terms_editor',
      });
    },
    complete: (field: keyof TermsFields, value: string, valid: boolean) => {
      if (completed.current.get(field) === value) return;
      completed.current.set(field, value);
      let state: 'empty' | 'invalid' | 'valid' = valid ? 'valid' : 'invalid';
      if (value.trim() === '') state = 'empty';
      trackUiEvent({
        control: 'terms_action',
        surface: 'terms',
        eventName: 'ui_field_completed',
        field,
        form: 'terms_editor',
        state,
      });
    },
  };
}
