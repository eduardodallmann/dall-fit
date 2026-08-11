import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import type { BlobStorageService } from '~/training-plan/services/blob-storage.service';
import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';

describe('ExerciseImageService', () => {
  async function imageBuffer(): Promise<Buffer> {
    const result = await sharp({
      create: { width: 320, height: 640, channels: 3, background: '#336699' },
    })
      .jpeg()
      .toBuffer();
    return result;
  }

  it('creates two WebP variants without enlarging and persists no original', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({
        key: 'exercise-images/thumb.webp',
        url: 'https://blob.test/thumb.webp',
      })
      .mockResolvedValueOnce({
        key: 'exercise-images/display.webp',
        url: 'https://blob.test/display.webp',
      });
    const blob = { upload, delete: vi.fn() } as unknown as BlobStorageService;
    const service = new ExerciseImageService(blob);
    const buffer = await imageBuffer();
    const result = await service.processAndUpload({
      buffer,
      mimetype: 'image/jpeg',
      originalname: 'input.jpg',
      size: buffer.length,
    });

    expect(upload).toHaveBeenCalledTimes(2);
    expect(result.thumbnail).toMatchObject({ width: 80, height: 160 });
    expect(result.display).toMatchObject({ width: 320, height: 640 });
  });

  it('compensates a partial upload and rejects animated/unsupported input', async () => {
    const deleteKeys = vi.fn().mockResolvedValue(undefined);
    const blob = {
      upload: vi
        .fn()
        .mockResolvedValueOnce({
          key: 'exercise-images/partial.webp',
          url: 'https://blob.test/partial.webp',
        })
        .mockRejectedValueOnce(new Error('failed')),
      delete: deleteKeys,
    } as unknown as BlobStorageService;
    const service = new ExerciseImageService(blob);
    const buffer = await imageBuffer();
    await expect(
      service.processAndUpload({
        buffer,
        mimetype: 'image/jpeg',
        originalname: 'input.jpg',
        size: buffer.length,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(deleteKeys).toHaveBeenCalledWith(['exercise-images/partial.webp']);
    await expect(
      service.processAndUpload({
        buffer: Buffer.from('not an image'),
        mimetype: 'text/plain',
        originalname: 'bad.txt',
        size: 12,
      }),
    ).rejects.toMatchObject({ status: 415 });
  });
});
