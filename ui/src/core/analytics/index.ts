import { track } from '@vercel/analytics';

export type AnalyticsSurface =
  | 'application_menu'
  | 'authenticated_shell'
  | 'home'
  | 'pwa_install'
  | 'pwa_update'
  | 'training_plan_detail'
  | 'training_plan_form'
  | 'training_plan_list'
  | 'workout';

export type AnalyticsControl =
  | 'add_exercise'
  | 'breadcrumb_home'
  | 'breadcrumb_plan'
  | 'breadcrumb_training_plans'
  | 'cancel'
  | 'delete_confirmation'
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
  | 'reorder_handle'
  | 'row_actions'
  | 'submit'
  | 'theme_toggle'
  | 'training_plans_link'
  | 'video_preview'
  | 'workout_link'
  | 'workout_name';

type CommonEvent = {
  control: AnalyticsControl;
  surface: AnalyticsSurface;
};

type UiAnalyticsEvent =
  | (CommonEvent & {
      destination:
        'dash' | 'training_plan_detail' | 'training_plan_list' | 'workout';
      eventName: 'ui_navigation_selected';
      navigationKind: 'breadcrumb' | 'menu' | 'pagination' | 'row_link';
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
      resource: 'training_plan' | 'training_plans' | 'workout';
    })
  | (CommonEvent & {
      disclosure: 'pwa_install_instructions';
      eventName: 'ui_disclosure_toggled';
      state: 'closed' | 'open';
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
      return compactProperties({ ...common, operation: event.operation });
    case 'ui_operation_completed':
      return compactProperties({
        ...common,
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
  }
}

export function trackUiEvent(event: UiAnalyticsEvent): void {
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
