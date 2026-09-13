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

  it('derives a stable opaque offline id only from the display asset', () => {
    const service = new ExerciseImageService({} as BlobStorageService);
    const image = {
      display: {
        key: 'exercise-images/private/display.webp',
        width: 320,
        height: 640,
      },
      thumbnail: {
        key: 'exercise-images/private/thumbnail.webp',
        width: 160,
        height: 160,
      },
    };
    const first = service.createOfflineMediaId(image);
    const second = service.createOfflineMediaId({
      ...image,
      thumbnail: { ...image.thumbnail, key: 'another-thumbnail' },
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).not.toContain('exercise-images');
  });

  it('creates two WebP variants without enlarging and persists no original', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({
        etag: 'thumb-etag',
        key: 'exercise-images/thumb.webp',
      })
      .mockResolvedValueOnce({
        etag: 'display-etag',
        key: 'exercise-images/display.webp',
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
    const thumbnailPath = upload.mock.calls[0]?.[0] as string;
    const displayPath = upload.mock.calls[1]?.[0] as string;
    expect(thumbnailPath).toMatch(
      /^exercise-images\/[a-f0-9]{24}\/thumbnail\.webp$/u,
    );
    expect(displayPath).toBe(
      thumbnailPath.replace('/thumbnail.webp', '/display.webp'),
    );
    expect(result.thumbnail).toMatchObject({ width: 80, height: 160 });
    expect(result.display).toMatchObject({ width: 320, height: 640 });
  });

  it('captures persisted ETags and resolves metadata for legacy variants', async () => {
    const getMetadata = vi
      .fn()
      .mockResolvedValueOnce({ etag: 'legacy-thumbnail-etag' });
    const service = new ExerciseImageService({
      getMetadata,
    } as unknown as BlobStorageService);

    const [exercise] = await service.captureCloneExercises([
      {
        bodyArea: 'other',
        id: 'image-1',
        image: {
          display: {
            etag: 'persisted-display-etag',
            height: 640,
            key: 'exercise-images/display.webp',
            width: 320,
          },
          thumbnail: {
            height: 160,
            key: 'exercise-images/thumbnail.webp',
            width: 160,
          },
        },
        name: 'Imagem',
        repetitions: 12,
        restSeconds: 60,
        sets: 3,
        type: 'image',
      },
    ]);

    expect(getMetadata).toHaveBeenCalledOnce();
    expect(getMetadata).toHaveBeenCalledWith('exercise-images/thumbnail.webp');
    expect(exercise).toMatchObject({
      image: {
        display: { etag: 'persisted-display-etag' },
        thumbnail: { etag: 'legacy-thumbnail-etag' },
      },
    });
  });

  it('compensates a partial upload and rejects animated/unsupported input', async () => {
    const deleteKeys = vi.fn().mockResolvedValue(undefined);
    const blob = {
      upload: vi
        .fn()
        .mockResolvedValueOnce({
          key: 'exercise-images/partial.webp',
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

  it('signs both exact variants with one expiration', async () => {
    const createSignedReadUrl = vi
      .fn()
      .mockResolvedValueOnce('https://private.blob.test/thumb?signed=true')
      .mockResolvedValueOnce('https://private.blob.test/display?signed=true');
    const blob = {
      createSignedReadUrl,
    } as unknown as BlobStorageService;
    const service = new ExerciseImageService(blob);
    const validUntil = Date.now() + 60_000;

    const result = await service.createSignedImage(
      {
        thumbnail: {
          key: 'exercise-images/thumb.webp',
          width: 160,
          height: 160,
        },
        display: {
          key: 'exercise-images/display.webp',
          width: 320,
          height: 640,
        },
      },
      validUntil,
    );

    expect(createSignedReadUrl).toHaveBeenNthCalledWith(
      1,
      'exercise-images/thumb.webp',
      validUntil,
    );
    expect(createSignedReadUrl).toHaveBeenNthCalledWith(
      2,
      'exercise-images/display.webp',
      validUntil,
    );
    expect(result.signedUrlExpiresAt).toBe(new Date(validUntil).toISOString());
  });

  it('returns a stable 503 when signing fails', async () => {
    const blob = {
      createSignedReadUrl: vi.fn().mockRejectedValue(new Error('failed')),
    } as unknown as BlobStorageService;
    const service = new ExerciseImageService(blob);

    const promise = service.createSignedImage({
      thumbnail: {
        key: 'exercise-images/thumb.webp',
        width: 160,
        height: 160,
      },
      display: {
        key: 'exercise-images/display.webp',
        width: 320,
        height: 640,
      },
    });

    await expect(promise).rejects.toHaveProperty('status', 503);
    await expect(promise).rejects.toHaveProperty(
      'response.code',
      'IMAGE_URL_SIGNING_FAILED',
    );
  });

  it('limits array hydration to eight concurrent signing operations', async () => {
    let active = 0;
    let maximumActive = 0;
    const createSignedReadUrl = vi.fn(
      (pathname: string) =>
        new Promise<string>((resolve) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          setTimeout(() => {
            active -= 1;
            resolve(`https://private.blob.test/${pathname}?signed=fake`);
          }, 1);
        }),
    );
    const service = new ExerciseImageService({
      createSignedReadUrl,
    } as unknown as BlobStorageService);
    const exercises = Array.from({ length: 10 }, (_, index) => ({
      bodyArea: 'other' as const,
      id: `image-${index}`,
      image: {
        display: {
          height: 640,
          key: `exercise-images/display-${index}.webp`,
          width: 320,
        },
        thumbnail: {
          height: 160,
          key: `exercise-images/thumbnail-${index}.webp`,
          width: 160,
        },
      },
      name: `Imagem ${index}`,
      repetitions: 12,
      restSeconds: 60,
      sets: 3,
      type: 'image' as const,
    }));

    const result = await service.hydrateExercises(exercises);

    expect(result).toHaveLength(10);
    expect(createSignedReadUrl).toHaveBeenCalledTimes(20);
    expect(maximumActive).toBe(8);
  });
});
