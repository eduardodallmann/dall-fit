import { track, type BeforeSendEvent } from '@vercel/analytics';

import { isBrowserOnline } from '~/core/connectivity';

export type AnalyticsSurface =
  | 'application_menu'
  | 'authenticated_shell'
  | 'dashboard'
  | 'home'
  | 'pwa_install'
  | 'pwa_update'
  | 'training'
  | 'training_completion'
  | 'training_plan_detail'
  | 'training_plan_form'
  | 'training_plan_list'
  | 'training_workout'
  | 'workout';

export type AnalyticsControl =
  | 'add_exercise'
  | 'breadcrumb_home'
  | 'breadcrumb_plan'
  | 'breadcrumb_training_plans'
  | 'cancel'
  | 'delete_confirmation'
  | 'dashboard_action'
  | 'description_field'
  | 'delete_exercise'
  | 'edit_plan'
  | 'google_login'
  | 'exercise_field'
  | 'image_remove'
  | 'image_replace'
  | 'image_preview'
  | 'image_upload'
  | 'home_link'
  | 'mobile_menu'
  | 'logout'
  | 'name_field'
  | 'new_plan'
  | 'new_workout'
  | 'pagination_next'
  | 'pagination_page'
  | 'pagination_previous'
  | 'plan_form'
  | 'plan_link'
  | 'pwa_install'
  | 'pwa_install_instructions'
  | 'pwa_update'
  | 'pwa_update_dismiss'
  | 'retry'
  | 'recent_workout'
  | 'reorder_handle'
  | 'row_actions'
  | 'submit'
  | 'theme_toggle'
  | 'training_plans_link'
  | 'training_link'
  | 'training_action'
  | 'video_preview'
  | 'workout_link'
  | 'workout_name';

type CommonEvent = {
  control: AnalyticsControl;
  surface: AnalyticsSurface;
};

export type TrainingAnalyticsAction =
  | 'abandon'
  | 'complete_exercise'
  | 'complete_series'
  | 'complete_workout'
  | 'expand_exercise'
  | 'media_open'
  | 'resolve_timer'
  | 'restart_exercise'
  | 'retry'
  | 'save_load'
  | 'select_workout'
  | 'share'
  | 'start_timer'
  | 'start_workout';

type UiAnalyticsEvent =
  | (CommonEvent & {
      destination:
        | 'dash'
        | 'training_completion'
        | 'training_plans'
        | 'training_resume'
        | 'training_start'
        | 'training'
        | 'training_plan_detail'
        | 'training_plan_list'
        | 'workout';
      eventName: 'ui_navigation_selected';
      navigationKind:
        'breadcrumb' | 'dashboard_action' | 'menu' | 'pagination' | 'row_link';
    })
  | (CommonEvent & {
      action:
        | 'cancel_inline_edit'
        | 'dismiss_update'
        | 'open_create_plan'
        | 'open_inline_edit';
      eventName: 'ui_button_pressed';
    })
  | (CommonEvent & {
      eventName: 'ui_menu_opened';
      menu: 'application' | 'row_actions';
    })
  | (CommonEvent & {
      action: 'delete' | 'edit';
      eventName: 'ui_menu_action_selected';
      menu: 'row_actions';
    })
  | (CommonEvent & {
      eventName: 'ui_overlay_opened';
      mode?: 'create' | 'edit';
      overlay:
        | 'application_menu'
        | 'delete_confirmation'
        | 'exercise_image_preview'
        | 'exercise_video_preview'
        | 'plan_form';
    })
  | (CommonEvent & {
      eventName: 'ui_overlay_closed';
      overlay:
        | 'application_menu'
        | 'delete_confirmation'
        | 'exercise_image_preview'
        | 'exercise_video_preview'
        | 'plan_form';
      reason:
        | 'backdrop'
        | 'breakpoint'
        | 'cancel'
        | 'close_trigger'
        | 'confirm'
        | 'escape'
        | 'navigation'
        | 'submit';
    })
  | (CommonEvent & {
      eventName: 'ui_field_focused';
      field: 'description' | 'name';
      form: 'training_plan';
    })
  | (CommonEvent & {
      eventName: 'ui_field_completed';
      field: 'description' | 'name';
      form: 'training_plan';
      state: 'empty' | 'invalid' | 'valid';
    })
  | (CommonEvent & {
      eventName: 'ui_form_submitted';
      form: 'training_plan';
      mode: 'create' | 'edit' | 'inline_edit';
    })
  | (CommonEvent & {
      channel?: 'native' | 'web';
      eventName: 'ui_operation_started';
      operation:
        | 'google_login'
        | 'exercise_create'
        | 'exercise_delete'
        | 'exercise_image_remove'
        | 'exercise_image_replace'
        | 'exercise_image_upload'
        | 'exercise_reorder'
        | 'exercise_update'
        | 'logout'
        | 'pwa_install'
        | 'pwa_update'
        | 'theme_update'
        | 'training_plan_create'
        | 'training_plan_delete'
        | 'training_plan_update'
        | 'workout_create'
        | 'workout_delete'
        | 'workout_update';
    })
  | (CommonEvent & {
      channel?: 'native' | 'web';
      eventName: 'ui_operation_completed';
      operation:
        | 'google_login'
        | 'exercise_create'
        | 'exercise_delete'
        | 'exercise_image_remove'
        | 'exercise_image_replace'
        | 'exercise_image_upload'
        | 'exercise_reorder'
        | 'exercise_update'
        | 'logout'
        | 'pwa_install'
        | 'pwa_update'
        | 'theme_update'
        | 'training_plan_create'
        | 'training_plan_delete'
        | 'training_plan_update'
        | 'workout_create'
        | 'workout_delete'
        | 'workout_update';
      outcome: 'dismissed' | 'error' | 'success' | 'unavailable';
    })
  | (CommonEvent & {
      eventName: 'ui_retry_requested';
      resource:
        | 'admin_dashboard'
        | 'dashboard'
        | 'training_plan'
        | 'training_plans'
        | 'workout';
    })
  | (CommonEvent & {
      disclosure: 'pwa_install_instructions';
      eventName: 'ui_disclosure_toggled';
      state: 'closed' | 'open';
    })
  | (CommonEvent & {
      action: TrainingAnalyticsAction;
      eventName: 'ui_training_action';
      outcome?: 'cancelled' | 'error' | 'success';
    });

type AnalyticsProperties = Record<
  string,
  boolean | null | number | string | undefined
>;

const pendingEventFingerprints = new Set<string>();

export type SystemFailureCategory =
  'bootstrap' | 'pwa_registration' | 'pwa_update' | 'render';

export function normalizeAnalyticsRoute(pathname: string): string | undefined {
  if (pathname === '/' || pathname === '/dash') {
    return pathname;
  }

  const segments = pathname.split('/').filter(Boolean);
  const trainingRoute = normalizeTrainingAnalyticsRoute(segments);
  if (trainingRoute.matched) return trainingRoute.route;
  const isTrainingPlanRoute =
    segments[0] === 'global' && segments[1] === 'training-plan';

  if (!isTrainingPlanRoute) {
    return undefined;
  }

  if (segments.length === 2) {
    return '/global/training-plan';
  }

  if (segments.length === 3) {
    return '/global/training-plan/:trainingPlanId';
  }

  if (segments.length === 5 && segments[3] === 'workout') {
    return '/global/training-plan/:trainingPlanId/workout/:workoutId';
  }

  return undefined;
}

function normalizeTrainingAnalyticsRoute(segments: readonly string[]): {
  matched: boolean;
  route?: string;
} {
  if (segments[0] !== 'training') return { matched: false };
  if (segments.length === 1) return { matched: true, route: '/training' };
  if (segments.length === 3 && segments[1] === 'workout')
    return { matched: true, route: '/training/workout/:workoutId' };
  if (segments.length === 3 && segments[1] === 'completion')
    return {
      matched: true,
      route: '/training/completion/:workoutExecutionId',
    };
  return { matched: true };
}

function getCurrentRoute(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return normalizeAnalyticsRoute(window.location.pathname);
}

function compactProperties(
  properties: AnalyticsProperties,
): AnalyticsProperties {
  const result = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  );

  return result;
}

function buildProperties(event: UiAnalyticsEvent): AnalyticsProperties {
  const common = {
    control: event.control,
    route: getCurrentRoute(),
    surface: event.surface,
  };

  switch (event.eventName) {
    case 'ui_navigation_selected':
      return compactProperties({
        ...common,
        destination: event.destination,
        navigation_kind: event.navigationKind,
      });
    case 'ui_button_pressed':
      return compactProperties({ ...common, action: event.action });
    case 'ui_menu_opened':
      return compactProperties({ ...common, menu: event.menu });
    case 'ui_menu_action_selected':
      return compactProperties({
        ...common,
        action: event.action,
        menu: event.menu,
      });
    case 'ui_overlay_opened':
      return compactProperties({
        ...common,
        mode: event.mode,
        overlay: event.overlay,
      });
    case 'ui_overlay_closed':
      return compactProperties({
        ...common,
        overlay: event.overlay,
        reason: event.reason,
      });
    case 'ui_field_focused':
      return compactProperties({
        ...common,
        field: event.field,
        form: event.form,
      });
    case 'ui_field_completed':
      return compactProperties({
        ...common,
        field: event.field,
        form: event.form,
        state: event.state,
      });
    case 'ui_form_submitted':
      return compactProperties({
        ...common,
        form: event.form,
        mode: event.mode,
      });
    case 'ui_operation_started':
      return compactProperties({
        ...common,
        channel: event.channel,
        operation: event.operation,
      });
    case 'ui_operation_completed':
      return compactProperties({
        ...common,
        channel: event.channel,
        operation: event.operation,
        outcome: event.outcome,
      });
    case 'ui_retry_requested':
      return compactProperties({ ...common, resource: event.resource });
    case 'ui_disclosure_toggled':
      return compactProperties({
        ...common,
        disclosure: event.disclosure,
        state: event.state,
      });
    case 'ui_training_action':
      return compactProperties({
        ...common,
        action: event.action,
        outcome: event.outcome,
      });
  }
}

export function trackTrainingAction(
  surface: 'training' | 'training_completion' | 'training_workout',
  action: TrainingAnalyticsAction,
  outcome?: 'cancelled' | 'error' | 'success',
): void {
  trackUiEvent({
    action,
    control: 'training_action',
    eventName: 'ui_training_action',
    outcome,
    surface,
  });
}

export function trackUiEvent(event: UiAnalyticsEvent): void {
  if (!isBrowserOnline()) return;
  const properties = buildProperties(event);
  const fingerprint = JSON.stringify([event.eventName, properties]);

  if (pendingEventFingerprints.has(fingerprint)) {
    return;
  }

  pendingEventFingerprints.add(fingerprint);
  queueMicrotask(() => pendingEventFingerprints.delete(fingerprint));

  try {
    track(event.eventName, properties);
  } catch {
    // Analytics is optional and must never block a product interaction.
  }
}

export function reportSystemFailure(category: SystemFailureCategory): void {
  if (!isBrowserOnline()) return;
  const fingerprint = JSON.stringify(['ui_system_failure', category]);
  if (pendingEventFingerprints.has(fingerprint)) return;
  pendingEventFingerprints.add(fingerprint);
  queueMicrotask(() => pendingEventFingerprints.delete(fingerprint));
  try {
    track('ui_system_failure', { category });
  } catch {
    // Operational diagnostics are optional and never block recovery.
  }
}

export type TrainingPlanAssistantAnalyticsAction =
  | 'assistant_abandon'
  | 'assistant_adjust'
  | 'assistant_confirm'
  | 'assistant_message'
  | 'assistant_open'
  | 'assistant_preview'
  | 'assistant_retry';

export function trackTrainingPlanAssistantAction(
  action: TrainingPlanAssistantAnalyticsAction,
  outcome?: 'blocked' | 'cancelled' | 'error' | 'success',
): void {
  if (!isBrowserOnline()) return;
  try {
    track('training_plan_assistant', {
      action,
      ...(outcome === undefined ? {} : { outcome }),
    });
  } catch {
    // Analytics is optional and never receives conversation content.
  }
}

export function allowOnlineAnalyticsEvent(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  return isBrowserOnline() ? event : null;
}
