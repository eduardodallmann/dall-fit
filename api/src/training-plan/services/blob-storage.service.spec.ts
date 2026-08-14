import {
  BlobAccessError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
} from '@vercel/blob';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BlobStorageOperationError,
  BlobStorageService,
  type BlobFailureCategory,
} from '~/training-plan/services/blob-storage.service';

const {
  deleteBlobMock,
  issueSignedTokenMock,
  listBlobMock,
  presignUrlMock,
  putBlobMock,
} = vi.hoisted(() => ({
  deleteBlobMock: vi.fn(),
  issueSignedTokenMock: vi.fn(),
  listBlobMock: vi.fn(),
  presignUrlMock: vi.fn(),
  putBlobMock: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  BlobAccessError: class extends Error {},
  BlobRequestAbortedError: class extends Error {},
  BlobServiceNotAvailable: class extends Error {},
  BlobServiceRateLimited: class extends Error {},
  BlobStoreNotFoundError: class extends Error {},
  BlobStoreSuspendedError: class extends Error {},
  BlobUnknownError: class extends Error {},
  del: deleteBlobMock,
  issueSignedToken: issueSignedTokenMock,
  list: listBlobMock,
  presignUrl: presignUrlMock,
  put: putBlobMock,
}));

describe('BlobStorageService', () => {
  const service = new BlobStorageService();

  beforeEach(() => {
    deleteBlobMock.mockReset();
    issueSignedTokenMock.mockReset();
    listBlobMock.mockReset();
    presignUrlMock.mockReset();
    putBlobMock.mockReset();
  });

  it('uploads privately through OIDC without passing a permanent token', async () => {
    putBlobMock.mockResolvedValue({
      pathname: 'exercise-images/thumbnail-1.webp',
    });

    const result = await service.upload(
      'exercise-images/thumbnail.webp',
      Buffer.from('image'),
    );

    expect(result).toEqual({ key: 'exercise-images/thumbnail-1.webp' });
    expect(putBlobMock).toHaveBeenCalledWith(
      'exercise-images/thumbnail.webp',
      expect.any(Buffer),
      expect.objectContaining({
        access: 'private',
        addRandomSuffix: true,
        contentType: 'image/webp',
      }),
    );
    expect(putBlobMock.mock.calls[0]?.[2]).not.toHaveProperty('token');
  });

  it('signs an exact pathname for get with the same expiration', async () => {
    const validUntil = Date.now() + 60_000;
    issueSignedTokenMock.mockResolvedValue('delegation-token');
    presignUrlMock.mockResolvedValue({
      presignedUrl: 'https://private.blob.test/image.webp?signed=true',
    });

    const result = await service.createSignedReadUrl(
      'exercise-images/image.webp',
      validUntil,
    );

    expect(issueSignedTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: ['get'],
        pathname: 'exercise-images/image.webp',
        validUntil,
      }),
    );
    expect(presignUrlMock).toHaveBeenCalledWith('delegation-token', {
      access: 'private',
      operation: 'get',
      pathname: 'exercise-images/image.webp',
      useCache: true,
      validUntil,
    });
    expect(result).toContain('signed=true');
  });

  it('deletes and lists through OIDC without passing a token', async () => {
    deleteBlobMock.mockResolvedValue(undefined);
    listBlobMock.mockResolvedValue({
      blobs: [{ pathname: 'exercise-images/image.webp' }],
      hasMore: false,
    });

    await service.delete(['exercise-images/image.webp']);
    const keys = await service.listExerciseKeys();

    expect(deleteBlobMock.mock.calls[0]?.[1]).not.toHaveProperty('token');
    expect(listBlobMock.mock.calls[0]?.[0]).not.toHaveProperty('token');
    expect(keys).toEqual(['exercise-images/image.webp']);
  });

  it.each<{
    category: BlobFailureCategory;
    errorType: { prototype: object };
  }>([
    { category: 'access_denied', errorType: BlobAccessError },
    { category: 'aborted', errorType: BlobRequestAbortedError },
    { category: 'rate_limited', errorType: BlobServiceRateLimited },
    { category: 'service_unavailable', errorType: BlobServiceNotAvailable },
    { category: 'store_not_found', errorType: BlobStoreNotFoundError },
    { category: 'store_suspended', errorType: BlobStoreSuspendedError },
    { category: 'unknown', errorType: BlobUnknownError },
  ])(
    'classifies SDK failures as $category',
    async ({ category, errorType }) => {
      putBlobMock.mockRejectedValue(Object.create(errorType.prototype));

      const error = await service
        .upload('exercise-images/image.webp', Buffer.from('image'))
        .catch((failure: unknown) => failure);

      expect(error).toBeInstanceOf(BlobStorageOperationError);
      if (!(error instanceof BlobStorageOperationError))
        throw new Error('Expected BlobStorageOperationError.');
      expect(error.category).toBe(category);
      expect(error.operation).toBe('upload');
    },
  );
});
