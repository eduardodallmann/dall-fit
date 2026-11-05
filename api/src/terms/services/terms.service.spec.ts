import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TermsDocument } from '@dall-fit/types';

import type { RealtimePublisherService } from '~/realtime/realtime-publisher.service';
import type { TermsRepository } from '~/terms/repositories/terms.repository';
import { TermsAccessService } from '~/terms/services/terms-access.service';
import { TermsContentService } from '~/terms/services/terms-content.service';
import { TermsService } from '~/terms/services/terms.service';

const fields = {
  title: 'Termos de teste',
  bodyHtml: '<p>Respeite seus limites.</p>',
  operatorName: 'Responsável Exemplo',
  operatorEmail: 'responsavel@example.test',
  changeSummary: 'Condições de teste.',
};
describe('TermsService publication boundaries', () => {
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
  const publisher = { publish: vi.fn<RealtimePublisherService['publish']>() };
  const content = new TermsContentService();
  const service = new TermsService(
    repository,
    content,
    new TermsAccessService(repository),
    publisher as unknown as RealtimePublisherService,
  );
  const draft: TermsDocument = {
    ...content.prepare(fields),
    id: '109000000000000000000001',
    state: 'draft',
    version: 0,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
  };
  const published: TermsDocument = {
    ...draft,
    state: 'published',
    publicationNumber: 1,
    publishedAt: draft.createdAt,
    version: 1,
  };
  beforeEach(() => {
    vi.resetAllMocks();
    repository.find.mockResolvedValue(draft);
    repository.currentReference.mockResolvedValue(null);
    repository.publish.mockResolvedValue(published);
    publisher.publish.mockResolvedValue();
  });
  it('requires the saved preview and exact observed current publication before any write', async () => {
    await expect(
      service.publish(draft.id, 0, 'admin', {
        previewContentHash: '0'.repeat(64),
        expectedCurrentTermsId: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'TERMS_PREVIEW_CHANGED' } });
    await expect(
      service.publish(draft.id, 0, 'admin', {
        previewContentHash: draft.contentHash,
        expectedCurrentTermsId: published.id,
      }),
    ).rejects.toMatchObject({
      response: { code: 'TERMS_PUBLICATION_CONFLICT' },
    });
    expect(repository.publish).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });
  it('maps a concurrent publication number collision without sending an event', async () => {
    repository.publish.mockRejectedValue({ code: 11000 });
    await expect(
      service.publish(draft.id, 0, 'admin', {
        previewContentHash: draft.contentHash,
        expectedCurrentTermsId: null,
      }),
    ).rejects.toMatchObject({
      response: { code: 'TERMS_PUBLICATION_CONFLICT' },
    });
    expect(publisher.publish).not.toHaveBeenCalled();
  });
  it('returns an immutable publication on replay without publishing twice', async () => {
    repository.find.mockResolvedValue(published);
    expect(
      await service.publish(draft.id, 0, 'admin', {
        previewContentHash: draft.contentHash,
        expectedCurrentTermsId: null,
      }),
    ).toEqual(published);
    expect(repository.publish).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
    await expect(service.update(draft.id, 1, fields)).rejects.toMatchObject({
      response: { code: 'TERMS_VERSION_IMMUTABLE' },
    });
    await expect(service.remove(draft.id, 1)).rejects.toMatchObject({
      response: { code: 'TERMS_VERSION_IMMUTABLE' },
    });
  });
  it('does not overwrite a concurrent draft edit or delete', async () => {
    repository.update.mockResolvedValue(null);
    repository.remove.mockResolvedValue(false);
    await expect(service.update(draft.id, 0, fields)).rejects.toMatchObject({
      response: { code: 'TERMS_DRAFT_VERSION_CONFLICT' },
    });
    await expect(service.remove(draft.id, 0)).rejects.toMatchObject({
      response: { code: 'TERMS_DRAFT_VERSION_CONFLICT' },
    });
  });
  it('accepts only a published source when copying a version', async () => {
    await expect(
      service.create('admin', { sourceVersionId: draft.id }),
    ).rejects.toMatchObject({ response: { code: 'TERMS_VERSION_NOT_FOUND' } });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('notifies only after a successful publication commit', async () => {
    const result = await service.publish(draft.id, 0, 'admin', {
      previewContentHash: draft.contentHash,
      expectedCurrentTermsId: null,
    });
    expect(result).toEqual(published);
    expect(publisher.publish).toHaveBeenCalledWith({
      resource: 'terms',
      resourceId: draft.id,
      state: 'present',
      version: 1,
    });
  });
});
