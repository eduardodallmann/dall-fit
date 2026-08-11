import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BlobStorageService } from '~/training-plan/services/blob-storage.service';

const { deleteBlobMock, putBlobMock } = vi.hoisted(() => ({
  deleteBlobMock: vi.fn(),
  putBlobMock: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  del: deleteBlobMock,
  list: vi.fn(),
  put: putBlobMock,
}));

describe('BlobStorageService', () => {
  const config = {
    BLOB_READ_WRITE_TOKEN: 'fake-blob-token',
    BLOB_STORE_ID: 'gvi3tyf5ckqiqlak',
  };
  const getOrThrow = vi.fn((key: keyof typeof config) => config[key]);
  const service = new BlobStorageService({
    getOrThrow,
  } as unknown as ConfigService);

  beforeEach(() => {
    deleteBlobMock.mockReset();
    getOrThrow.mockClear();
    putBlobMock.mockReset();
  });

  it('accepts an upload from the configured public store', async () => {
    putBlobMock.mockResolvedValue({
      pathname: 'exercise-images/thumbnail-1.webp',
      url: 'https://gvi3tyf5ckqiqlak.public.blob.vercel-storage.com/exercise-images/thumbnail-1.webp',
    });

    const result = await service.upload(
      'exercise-images/thumbnail.webp',
      Buffer.from('image'),
    );

    expect(result).toEqual({
      key: 'exercise-images/thumbnail-1.webp',
      url: 'https://gvi3tyf5ckqiqlak.public.blob.vercel-storage.com/exercise-images/thumbnail-1.webp',
    });
    expect(deleteBlobMock).not.toHaveBeenCalled();
  });

  it('rejects and compensates an upload returned by another store', async () => {
    putBlobMock.mockResolvedValue({
      pathname: 'exercise-images/thumbnail-2.webp',
      url: 'https://unexpected.public.blob.vercel-storage.com/exercise-images/thumbnail-2.webp',
    });
    deleteBlobMock.mockResolvedValue(undefined);

    await expect(
      service.upload('exercise-images/thumbnail.webp', Buffer.from('image')),
    ).rejects.toThrow('unexpected public hostname');
    expect(deleteBlobMock).toHaveBeenCalledWith(
      'exercise-images/thumbnail-2.webp',
      expect.objectContaining({ token: 'fake-blob-token' }),
    );
  });
});
