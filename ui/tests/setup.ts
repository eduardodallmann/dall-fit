import '@testing-library/jest-dom/vitest';

import { toast } from '@heroui/react';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { authReturnTo } from '~/auth/auth-return-to';
import { resetSessionLifecycleForTests } from '~/auth/session-lifecycle';
import { apiClient } from '~/core/http/api-client';
import { resetTermsPolicy } from '~/core/terms/policy';
import { resetAuthScenarioStates } from '~/mocks/handlers/auth';
import { resetDashboardScenarioStates } from '~/mocks/handlers/dashboard';
import { resetTermsScenarioStates } from '~/mocks/handlers/terms';
import { resetTrainingScenarioStates } from '~/mocks/handlers/training';
import { resetTrainingPlanAssistantScenarioStates } from '~/mocks/handlers/training-plan-assistant';
import { resetTrainingPlanScenarioStates } from '~/mocks/handlers/training-plans';
import { mockServer } from '~/mocks/server';

beforeAll(() => {
  apiClient.defaults.adapter = 'fetch';
  mockServer.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  cleanup();
  toast.clear();
  mockServer.resetHandlers();
  resetAuthScenarioStates();
  resetTermsScenarioStates();
  resetDashboardScenarioStates();
  resetSessionLifecycleForTests();
  resetTermsPolicy();
  authReturnTo.clear();
  resetTrainingPlanScenarioStates();
  resetTrainingPlanAssistantScenarioStates();
  resetTrainingScenarioStates();
  vi.restoreAllMocks();
});

afterAll(() => {
  mockServer.close();
});

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
  writable: true,
});

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
  writable: true,
});

class MockResizeObserver implements ResizeObserver {
  disconnect(): void {}

  observe(): void {}

  unobserve(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: MockResizeObserver,
  writable: true,
});
