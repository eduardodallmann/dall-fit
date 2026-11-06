import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TermsAccess, TermsReference } from '@dall-fit/types';

import {
  activateSession,
  endSession,
  getActiveSessionGeneration,
} from '~/auth/session-lifecycle';

import {
  applyTermsAccess,
  configureNativeTerms,
  getTermsPolicy,
  isTermsTransportBlocked,
  parseTermsReference,
  requireTerms,
} from './policy';

const reference: TermsReference = {
  id: '109000000000000000000001',
  publicationNumber: 1,
  contentHash: 'a'.repeat(64),
};
function accepted(current = reference): TermsAccess {
  return {
    state: 'accepted',
    current,
    acceptance: {
      id: 'receipt',
      termsVersionId: current.id,
      publicationNumber: current.publicationNumber,
      contentHash: current.contentHash,
      acceptedAt: '2026-08-01T12:00:00Z',
      channel: 'native',
      accepted: true,
      isAdult: true,
    },
  };
}
describe('terms policy', () => {
  beforeEach(async () => {
    await activateSession('person-a', 'authenticated');
  });
  afterEach(async () => {
    configureNativeTerms(null);
    await endSession('logout');
  });
  it('blocks business immediately and preserves bootstrap, legal reading and logout', async () => {
    await applyTermsAccess(accepted());
    requireTerms({
      ...reference,
      id: '109000000000000000000002',
      publicationNumber: 2,
    });
    expect(isTermsTransportBlocked('/training')).toBe(true);
    expect(isTermsTransportBlocked('/auth/logout')).toBe(false);
    expect(isTermsTransportBlocked('/terms/acceptances')).toBe(false);
    expect(getTermsPolicy().hasAccepted).toBe(true);
    await applyTermsAccess(accepted());
    expect(getTermsPolicy().access?.current?.publicationNumber).toBe(2);
    expect(getTermsPolicy().blocked).toBe(true);
  });
  it('keeps administrative HTTP boundaries available without unlocking personal business', async () => {
    await applyTermsAccess({
      state: 'not-configured',
      current: null,
      acceptance: null,
    });
    for (const url of [
      '/admin/terms',
      '/admin/dashboard?timezone=UTC',
      '/global/training-plans',
      '/global/training-plans/plan/workouts',
    ]) {
      expect(isTermsTransportBlocked(url)).toBe(false);
    }
    requireTerms(reference);
    expect(isTermsTransportBlocked('/admin/terms')).toBe(false);
    expect(isTermsTransportBlocked('/global/training-plans')).toBe(false);
    expect(isTermsTransportBlocked('/training-plans')).toBe(true);
    expect(isTermsTransportBlocked('/dashboard')).toBe(true);
  });
  it('ties durable native proof to the account and rejects a late generation', async () => {
    const write = vi.fn((access: TermsAccess) => Promise.resolve(access));
    configureNativeTerms({
      read: vi.fn(),
      write,
      require: vi.fn(),
      resume: vi.fn(),
    });
    const generation = getActiveSessionGeneration();
    await applyTermsAccess(accepted(), generation);
    expect(write).toHaveBeenCalledWith(accepted(), 'person-a');
    await endSession('identity_changed');
    await activateSession('person-b', 'authenticated');
    await expect(applyTermsAccess(accepted(), generation)).rejects.toThrow(
      'Session ended.',
    );
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('permits only local training transport while using an offline proof', async () => {
    await applyTermsAccess(accepted(), undefined, true);
    expect(getTermsPolicy().blocked).toBe(false);
    expect(getTermsPolicy().localOnly).toBe(true);
    expect(isTermsTransportBlocked('/training-plans')).toBe(true);
  });
  it('rejects malformed policy details instead of inferring acceptance', () => {
    expect(
      parseTermsReference({ ...reference, publicationNumber: -1 }),
    ).toBeUndefined();
    expect(
      parseTermsReference({ ...reference, contentHash: 'wrong' }),
    ).toBeUndefined();
    requireTerms();
    expect(getTermsPolicy().blocked).toBe(true);
  });
});
