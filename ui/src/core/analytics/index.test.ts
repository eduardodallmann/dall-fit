import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  allowOnlineAnalyticsEvent,
  normalizeAnalyticsRoute,
  reportSystemFailure,
  trackTrainingPlanAssistantAction,
  trackUiEvent,
} from '~/core/analytics';

const { trackMock } = vi.hoisted(() => ({
  trackMock:
    vi.fn<
      (
        name: string,
        properties?: Record<
          string,
          boolean | null | number | string | undefined
        >,
      ) => void
    >(),
}));

vi.mock('@vercel/analytics', () => ({
  track: trackMock,
}));

describe('analytics boundary', () => {
  beforeEach(() => {
    trackMock.mockReset();
    window.history.replaceState({}, '', '/');
  });

  it('normalizes dynamic routes without retaining identifiers or query data', () => {
    expect(normalizeAnalyticsRoute('/')).toBe('/');
    expect(normalizeAnalyticsRoute('/dash')).toBe('/dash');
    expect(normalizeAnalyticsRoute('/global/training-plan')).toBe(
      '/global/training-plan',
    );
    expect(
      normalizeAnalyticsRoute(
        '/global/training-plan/sensitive-plan-id/workout/sensitive-workout-id',
      ),
    ).toBe('/global/training-plan/:trainingPlanId/workout/:workoutId');
    expect(
      normalizeAnalyticsRoute('/training/workout/sensitive-workout-id'),
    ).toBe('/training/workout/:workoutId');
    expect(
      normalizeAnalyticsRoute('/training/completion/sensitive-execution-id'),
    ).toBe('/training/completion/:workoutExecutionId');
    expect(normalizeAnalyticsRoute('/unknown/sensitive-value')).toBeUndefined();
  });

  it('emits only the enumerated schema and omits unknown or sensitive input', () => {
    window.history.replaceState(
      {},
      '',
      '/global/training-plan/sensitive-plan-id?mockAuth=admin&email=user@example.com',
    );

    trackUiEvent({
      control: 'submit',
      eventName: 'ui_form_submitted',
      form: 'training_plan',
      mode: 'edit',
      surface: 'training_plan_form',
      email: 'user@example.com',
      trainingPlanId: 'sensitive-plan-id',
    } as Parameters<typeof trackUiEvent>[0]);

    expect(trackMock).toHaveBeenCalledWith('ui_form_submitted', {
      control: 'submit',
      form: 'training_plan',
      mode: 'edit',
      route: '/global/training-plan/:trainingPlanId',
      surface: 'training_plan_form',
    });
    expect(JSON.stringify(trackMock.mock.calls)).not.toContain(
      'user@example.com',
    );
    expect(JSON.stringify(trackMock.mock.calls)).not.toContain(
      'sensitive-plan-id',
    );
    expect(JSON.stringify(trackMock.mock.calls)).not.toContain('mockAuth');
  });

  it('projects legal field metadata without the term, public contact or domain identifiers', () => {
    window.history.replaceState({}, '', '/admin/terms?mockTerms=admin');
    expect(normalizeAnalyticsRoute('/terms')).toBe('/terms');
    trackUiEvent({
      control: 'terms_action',
      surface: 'terms',
      eventName: 'ui_field_completed',
      form: 'terms_editor',
      field: 'bodyHtml',
      state: 'valid',
      value: '<p>private draft</p>',
      operatorEmail: 'operator@example.test',
      termsVersionId: 'private-id',
    } as Parameters<typeof trackUiEvent>[0]);
    expect(trackMock).toHaveBeenCalledWith('ui_field_completed', {
      control: 'terms_action',
      surface: 'terms',
      route: '/admin/terms',
      form: 'terms_editor',
      field: 'bodyHtml',
      state: 'valid',
    });
    expect(JSON.stringify(trackMock.mock.calls)).not.toMatch(
      /private|operator@example|mockTerms/,
    );
  });

  it('discards an identical event repeated in the same interaction cycle', () => {
    const event = {
      control: 'retry' as const,
      eventName: 'ui_retry_requested' as const,
      resource: 'training_plans' as const,
      surface: 'training_plan_list' as const,
    };

    trackUiEvent(event);
    trackUiEvent(event);

    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('maps every catalog event to the official flat custom-event payload', () => {
    const events: Array<Parameters<typeof trackUiEvent>[0]> = [
      {
        control: 'home_link',
        destination: 'dash',
        eventName: 'ui_navigation_selected',
        navigationKind: 'menu',
        surface: 'application_menu',
      },
      {
        action: 'open_inline_edit',
        control: 'edit_plan',
        eventName: 'ui_button_pressed',
        surface: 'training_plan_detail',
      },
      {
        control: 'row_actions',
        eventName: 'ui_menu_opened',
        menu: 'row_actions',
        surface: 'training_plan_list',
      },
      {
        action: 'delete',
        control: 'row_actions',
        eventName: 'ui_menu_action_selected',
        menu: 'row_actions',
        surface: 'training_plan_list',
      },
      {
        control: 'delete_confirmation',
        eventName: 'ui_overlay_opened',
        overlay: 'delete_confirmation',
        surface: 'training_plan_list',
      },
      {
        control: 'delete_confirmation',
        eventName: 'ui_overlay_closed',
        overlay: 'delete_confirmation',
        reason: 'cancel',
        surface: 'training_plan_list',
      },
      {
        control: 'name_field',
        eventName: 'ui_field_focused',
        field: 'name',
        form: 'training_plan',
        surface: 'training_plan_form',
      },
      {
        control: 'description_field',
        eventName: 'ui_field_completed',
        field: 'description',
        form: 'training_plan',
        state: 'invalid',
        surface: 'training_plan_form',
      },
      {
        control: 'submit',
        eventName: 'ui_form_submitted',
        form: 'training_plan',
        mode: 'create',
        surface: 'training_plan_form',
      },
      {
        control: 'pwa_install',
        eventName: 'ui_operation_started',
        operation: 'pwa_install',
        surface: 'pwa_install',
      },
      {
        control: 'pwa_install',
        eventName: 'ui_operation_completed',
        operation: 'pwa_install',
        outcome: 'dismissed',
        surface: 'pwa_install',
      },
      {
        control: 'retry',
        eventName: 'ui_retry_requested',
        resource: 'workout',
        surface: 'workout',
      },
      {
        control: 'pwa_install_instructions',
        disclosure: 'pwa_install_instructions',
        eventName: 'ui_disclosure_toggled',
        state: 'open',
        surface: 'pwa_install',
      },
    ];

    for (const event of events) {
      trackUiEvent(event);
    }

    expect(trackMock.mock.calls.map(([eventName]) => eventName)).toEqual(
      events.map((event) => event.eventName),
    );
    for (const [, properties] of trackMock.mock.calls) {
      if (properties === undefined) {
        throw new Error(
          'The analytics boundary must always provide properties.',
        );
      }
      expect(properties).not.toHaveProperty('mode', undefined);
      expect(Object.values(properties)).not.toContain('');
    }
  });

  it('does not propagate a transport failure to the product interaction', () => {
    trackMock.mockImplementationOnce(() => {
      throw new Error('analytics unavailable');
    });

    expect(() =>
      trackUiEvent({
        control: 'google_login',
        eventName: 'ui_operation_started',
        operation: 'google_login',
        surface: 'home',
      }),
    ).not.toThrow();
  });

  it('reports a system failure with only its enumerated category', () => {
    window.history.replaceState({}, '', '/dash?sensitive=session-value');

    reportSystemFailure('bootstrap');

    expect(trackMock).toHaveBeenCalledWith('ui_system_failure', {
      category: 'bootstrap',
    });
    expect(JSON.stringify(trackMock.mock.calls)).not.toContain('session-value');
  });

  it('discards custom events and diagnostics created while offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    trackUiEvent({
      control: 'retry',
      eventName: 'ui_retry_requested',
      resource: 'training_plans',
      surface: 'training_plan_list',
    });
    reportSystemFailure('bootstrap');
    trackTrainingPlanAssistantAction('assistant_open');

    expect(trackMock).not.toHaveBeenCalled();
  });

  it('allows the SDK to send only events evaluated while online', () => {
    const event = { type: 'pageview' as const, url: '/dash' };
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    expect(allowOnlineAnalyticsEvent(event)).toBeNull();

    online.mockReturnValue(true);
    expect(allowOnlineAnalyticsEvent(event)).toBe(event);
  });
});
