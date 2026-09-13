import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

import type { Exercise, ExerciseImage } from '@dall-fit/types';

import type {
  CloneSnapshotExercise,
  CloneSnapshotImage,
} from '~/training-plan/domain/personal-training-plan.entity';
import type {
  StoredExercise,
  StoredExerciseImage,
  UploadedImageFile,
} from '~/training-plan/domain/training-plan.entity';
import {
  createImageTooLargeException,
  createImageUploadFailedException,
  createImageUrlSigningFailedException,
  createUnsupportedImageTypeException,
} from '~/training-plan/errors/training-plan.errors';
import { BlobStorageService } from '~/training-plan/services/blob-storage.service';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const IMAGE_HYDRATION_CONCURRENCY = 4;
export const SIGNED_IMAGE_URL_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class ExerciseImageService {
  private readonly logger = new Logger(ExerciseImageService.name);
  constructor(private readonly blobStorageService: BlobStorageService) {}

  async processAndUpload(
    file: UploadedImageFile,
  ): Promise<StoredExerciseImage> {
    this.logger.log('ExerciseImageService -> processAndUpload -> params:', {
      params: { bytes: file.size },
    });
    if (file.size > MAX_IMAGE_BYTES) {
      this.logger.warn(
        'ExerciseImageService -> processAndUpload -> imageTooLarge error:',
        { data: { bytes: file.size } },
      );
      throw createImageTooLargeException();
    }
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(file.buffer, {
        animated: true,
        limitInputPixels: MAX_INPUT_PIXELS,
      }).metadata();
      this.logger.log(
        'ExerciseImageService -> processAndUpload -> metadata completed:',
        { data: { pages: metadata.pages ?? 1 } },
      );
    } catch {
      this.logger.warn(
        'ExerciseImageService -> processAndUpload -> unsupportedImage error:',
        { data: { metadataReadable: false } },
      );
      throw createUnsupportedImageTypeException();
    }
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
      (metadata.pages ?? 1) > 1
    ) {
      this.logger.warn(
        'ExerciseImageService -> processAndUpload -> unsupportedImage error:',
        { data: { animated: (metadata.pages ?? 1) > 1 } },
      );
      throw createUnsupportedImageTypeException();
    }
    const [thumbnail, display] = await Promise.all([
      this.render(file.buffer, 160, 160),
      this.render(file.buffer, 1080, 1920),
    ]);
    this.logger.log(
      'ExerciseImageService -> processAndUpload -> variants rendered:',
      { data: { count: 2 } },
    );
    const imageAssetId = randomBytes(12).toString('hex');
    const imagePrefix = `exercise-images/${imageAssetId}`;
    const uploaded: string[] = [];
    try {
      const thumbnailBlob = await this.blobStorageService.upload(
        `${imagePrefix}/thumbnail.webp`,
        thumbnail.buffer,
      );
      uploaded.push(thumbnailBlob.key);
      this.logger.log(
        'ExerciseImageService -> processAndUpload -> thumbnail upload return:',
        { data: { uploaded: true } },
      );
      const displayBlob = await this.blobStorageService.upload(
        `${imagePrefix}/display.webp`,
        display.buffer,
      );
      uploaded.push(displayBlob.key);
      this.logger.log(
        'ExerciseImageService -> processAndUpload -> display upload return:',
        { data: { uploaded: true } },
      );
      const result = {
        thumbnail: {
          ...thumbnailBlob,
          width: thumbnail.width,
          height: thumbnail.height,
        },
        display: {
          ...displayBlob,
          width: display.width,
          height: display.height,
        },
      };
      this.logger.log('ExerciseImageService -> processAndUpload -> return:', {
        data: { uploadedVariants: 2 },
      });
      return result;
    } catch {
      this.logger.warn(
        'ExerciseImageService -> processAndUpload -> uploadFailed error:',
        { data: { uploadedVariants: uploaded.length } },
      );
      await this.deleteKeysSafely(uploaded);
      throw createImageUploadFailedException();
    }
  }

  async createSignedImage(
    image: StoredExerciseImage,
    validUntil = Date.now() + SIGNED_IMAGE_URL_TTL_MS,
  ): Promise<ExerciseImage> {
    this.logger.log('ExerciseImageService -> createSignedImage -> params:', {
      params: { variants: 2 },
    });
    try {
      const [thumbnailUrl, displayUrl] = await Promise.all([
        this.blobStorageService.createSignedReadUrl(
          image.thumbnail.key,
          validUntil,
        ),
        this.blobStorageService.createSignedReadUrl(
          image.display.key,
          validUntil,
        ),
      ]);
      this.logger.log(
        'ExerciseImageService -> createSignedImage -> blobStorageService return:',
        { data: { signedVariants: 2 } },
      );
      const result = {
        thumbnailUrl,
        displayUrl,
        signedUrlExpiresAt: new Date(validUntil).toISOString(),
      };
      this.logger.log('ExerciseImageService -> createSignedImage -> return:', {
        data: { signedVariants: 2 },
      });
      return result;
    } catch {
      this.logger.warn(
        'ExerciseImageService -> createSignedImage -> signingFailed error:',
        { data: { variants: 2 } },
      );
      throw createImageUrlSigningFailedException();
    }
  }

  createOfflineMediaId(image: StoredExerciseImage): string {
    this.logger.log('ExerciseImageService -> createOfflineMediaId -> params:', {
      params: { variants: 2 },
    });
    const result = createHash('sha256')
      .update(`display:${image.display.key}`)
      .digest('hex');
    this.logger.log('ExerciseImageService -> createOfflineMediaId -> return:', {
      data: { mediaIdentified: true },
    });
    return result;
  }

  async toPublicExercise(exercise: StoredExercise): Promise<Exercise> {
    this.logger.log('ExerciseImageService -> toPublicExercise -> params:', {
      params: { exerciseId: exercise.id, type: exercise.type },
    });
    let result: Exercise;
    if (exercise.type !== 'image') {
      this.logger.log(
        'ExerciseImageService -> toPublicExercise -> unsigned branch:',
        { data: { hasImage: false } },
      );
      result = exercise;
    } else if (exercise.image === null) {
      this.logger.log(
        'ExerciseImageService -> toPublicExercise -> emptyImage branch:',
        { data: { hasImage: false } },
      );
      result = { ...exercise, image: null };
    } else {
      this.logger.log(
        'ExerciseImageService -> toPublicExercise -> signed branch:',
        { data: { hasImage: true } },
      );
      const image = await this.createSignedImage(exercise.image);
      this.logger.log(
        'ExerciseImageService -> toPublicExercise -> createSignedImage return:',
        { data: { signed: true } },
      );
      result = { ...exercise, image };
    }
    this.logger.log('ExerciseImageService -> toPublicExercise -> return:', {
      data: { exerciseId: exercise.id, type: exercise.type },
    });
    return result;
  }

  async hydrateExercises(
    exercises: readonly StoredExercise[],
  ): Promise<readonly Exercise[]> {
    this.logger.log('ExerciseImageService -> hydrateExercises -> params:', {
      params: { count: exercises.length },
    });
    const result = new Array<Exercise>(exercises.length);
    let nextIndex = 0;
    const workerCount = Math.min(IMAGE_HYDRATION_CONCURRENCY, exercises.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < exercises.length) {
        const index = nextIndex;
        nextIndex += 1;
        const exercise = exercises[index];
        if (exercise !== undefined)
          result[index] = await this.toPublicExercise(exercise);
      }
    });
    await Promise.all(workers);
    this.logger.log(
      'ExerciseImageService -> hydrateExercises -> workers completed:',
      { data: { count: result.length, workers: workerCount } },
    );
    this.logger.log('ExerciseImageService -> hydrateExercises -> return:', {
      data: { count: result.length },
    });
    return result;
  }

  async captureCloneExercises(
    exercises: readonly StoredExercise[],
  ): Promise<readonly CloneSnapshotExercise[]> {
    this.logger.log(
      'ExerciseImageService -> captureCloneExercises -> params:',
      {
        params: { count: exercises.length },
      },
    );
    const result = new Array<CloneSnapshotExercise>(exercises.length);
    let nextIndex = 0;
    const workerCount = Math.min(IMAGE_HYDRATION_CONCURRENCY, exercises.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < exercises.length) {
        const index = nextIndex;
        nextIndex += 1;
        const exercise = exercises[index];
        if (exercise === undefined) continue;
        if (exercise.type !== 'image') {
          result[index] = exercise;
          continue;
        }
        if (exercise.image === null) {
          result[index] = { ...exercise, image: null };
          continue;
        }
        const image = await this.captureCloneImage(exercise.image);
        result[index] = { ...exercise, image };
      }
    });
    await Promise.all(workers);
    this.logger.log(
      'ExerciseImageService -> captureCloneExercises -> workers completed:',
      { data: { count: result.length, workers: workerCount } },
    );
    this.logger.log(
      'ExerciseImageService -> captureCloneExercises -> return:',
      {
        data: { count: result.length },
      },
    );
    return result;
  }

  async deleteImages(images: readonly StoredExerciseImage[]): Promise<void> {
    this.logger.log('ExerciseImageService -> deleteImages -> params:', {
      params: { count: images.length },
    });
    const keys = images.flatMap((image) => [
      image.thumbnail.key,
      image.display.key,
    ]);
    await this.deleteKeysSafely(keys);
    this.logger.log(
      'ExerciseImageService -> deleteImages -> deleteKeysSafely completed:',
      { data: { count: keys.length } },
    );
    this.logger.log('ExerciseImageService -> deleteImages -> completed:', {
      data: { count: keys.length },
    });
  }

  private async captureCloneImage(
    image: StoredExerciseImage,
  ): Promise<CloneSnapshotImage> {
    this.logger.log('ExerciseImageService -> captureCloneImage -> params:', {
      params: { variants: 2 },
    });
    const [thumbnailMetadata, displayMetadata] = await Promise.all([
      image.thumbnail.etag === undefined
        ? this.blobStorageService.getMetadata(image.thumbnail.key)
        : { etag: image.thumbnail.etag },
      image.display.etag === undefined
        ? this.blobStorageService.getMetadata(image.display.key)
        : { etag: image.display.etag },
    ]);
    const result = {
      display: { ...image.display, etag: displayMetadata.etag },
      thumbnail: { ...image.thumbnail, etag: thumbnailMetadata.etag },
    };
    this.logger.log('ExerciseImageService -> captureCloneImage -> return:', {
      data: { variants: 2 },
    });
    return result;
  }

  async deleteKeysSafely(keys: readonly string[]): Promise<void> {
    this.logger.log('ExerciseImageService -> deleteKeysSafely -> params:', {
      params: { count: keys.length },
    });
    try {
      await this.blobStorageService.delete(keys);
      this.logger.log(
        'ExerciseImageService -> deleteKeysSafely -> blobStorageService completed:',
        { data: { count: keys.length } },
      );
    } catch {
      this.logger.warn(
        'ExerciseImageService -> deleteKeysSafely -> cleanupPending branch:',
        { data: { count: keys.length } },
      );
    }
    this.logger.log('ExerciseImageService -> deleteKeysSafely -> completed:', {
      data: { count: keys.length },
    });
  }

  private async render(
    buffer: Buffer,
    width: number,
    height: number,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    this.logger.log('ExerciseImageService -> render -> params:', {
      params: { height, width },
    });
    const { data, info } = await sharp(buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .autoOrient()
      .resize({ fit: 'inside', height, width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    this.logger.log('ExerciseImageService -> render -> sharp return:', {
      data: { height: info.height, width: info.width },
    });
    const result = { buffer: data, width: info.width, height: info.height };
    this.logger.log('ExerciseImageService -> render -> return:', {
      data: { height: result.height, width: result.width },
    });
    return result;
  }
}
