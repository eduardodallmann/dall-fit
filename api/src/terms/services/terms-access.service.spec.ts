import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TermsReference } from '@dall-fit/types';

import type { TermsRepository } from '~/terms/repositories/terms.repository';

import { TermsAccessService } from './terms-access.service';

const reference: TermsReference = {
  id: '109000000000000000000001',
  contentHash: 'a'.repeat(64),
  publicationNumber: 1,
};
const receipt = {
  id: '109000000000000000000002',
  termsVersionId: reference.id,
  contentHash: reference.contentHash,
  publicationNumber: 1,
  acceptedAt: '2026-08-01T12:00:00.000Z',
  channel: 'web' as const,
  accepted: true as const,
  isAdult: true as const,
};
describe('TermsAccessService', () => {
  const repository = {
    currentReference: vi.fn<TermsRepository['currentReference']>(),
    find: vi.fn<TermsRepository['find']>(),
    receipt: vi.fn<TermsRepository['receipt']>(),
    record: vi.fn<TermsRepository['record']>(),
    list: vi.fn<TermsRepository['list']>(),
    create: vi.fn<TermsRepository['create']>(),
    update: vi.fn<TermsRepository['update']>(),
    publish: vi.fn<TermsRepository['publish']>(),
    remove: vi.fn<TermsRepository['remove']>(),
    receipts: vi.fn<TermsRepository['receipts']>(),
  } satisfies TermsRepository;
  const service = new TermsAccessService(repository);
  beforeEach(() => {
    vi.resetAllMocks();
    repository.currentReference.mockResolvedValue(reference);
    repository.receipt.mockResolvedValue(null);
  });
  it('requires the current receipt without changing authentication', async () => {
    await expect(service.require('person')).rejects.toMatchObject({
      response: { code: 'TERMS_ACCEPTANCE_REQUIRED', details: reference },
      status: 403,
    });
    expect(repository.record).not.toHaveBeenCalled();
  });
  it('allows only initial administration while no publication exists', async () => {
    repository.currentReference.mockResolvedValue(null);
    await expect(service.require('admin', true)).resolves.toBeUndefined();
    await expect(service.require('person')).rejects.toMatchObject({
      response: { code: 'TERMS_NOT_CONFIGURED' },
    });
  });
  it('fails closed on database unavailability and invalid receipt integrity', async () => {
    repository.currentReference.mockRejectedValueOnce(
      new Error('private database error'),
    );
    await expect(service.access('person')).rejects.toMatchObject({
      response: { code: 'TERMS_UNAVAILABLE' },
      status: 503,
    });
    repository.receipt.mockResolvedValue({
      ...receipt,
      contentHash: 'b'.repeat(64),
    });
    expect((await service.access('person')).state).toBe('required');
  });
  it('does not transfer an acceptance to a concurrently published document', async () => {
    repository.find.mockResolvedValue({
      ...reference,
      state: 'published',
    } as never);
    repository.currentReference
      .mockResolvedValueOnce(reference)
      .mockResolvedValue({
        ...reference,
        id: '109000000000000000000003',
        publicationNumber: 2,
      });
    repository.record.mockResolvedValue({ acceptance: receipt, created: true });
    const result = await service.accept('person', 'native', {
      termsVersionId: reference.id,
      contentHash: reference.contentHash,
      accepted: true,
      isAdult: true,
    });
    expect(result.result.access.state).toBe('required');
    expect(result.result.acceptance.termsVersionId).toBe(reference.id);
    expect(repository.record).toHaveBeenCalledWith(
      'person',
      expect.objectContaining({
        channel: 'native',
        accepted: true,
        isAdult: true,
      }),
    );
  });
  it('rejects stale text or hash without recording agreement', async () => {
    repository.find.mockResolvedValue({
      ...reference,
      state: 'published',
    } as never);
    await expect(
      service.accept('person', 'web', {
        termsVersionId: reference.id,
        contentHash: 'b'.repeat(64),
        accepted: true,
        isAdult: true,
      }),
    ).rejects.toMatchObject({ response: { code: 'TERMS_VERSION_CHANGED' } });
    expect(repository.record).not.toHaveBeenCalled();
  });
});
