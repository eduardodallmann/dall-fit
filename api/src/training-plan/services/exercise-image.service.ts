import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

import type {
  StoredExerciseImage,
  UploadedImageFile,
} from '~/training-plan/domain/training-plan.entity';
import {
  createImageTooLargeException,
  createImageUploadFailedException,
  createUnsupportedImageTypeException,
} from '~/training-plan/errors/training-plan.errors';
import { BlobStorageService } from '~/training-plan/services/blob-storage.service';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;

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
    if (file.size > MAX_IMAGE_BYTES) throw createImageTooLargeException();
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(file.buffer, {
        animated: true,
        limitInputPixels: MAX_INPUT_PIXELS,
      }).metadata();
    } catch {
      throw createUnsupportedImageTypeException();
    }
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
      (metadata.pages ?? 1) > 1
    )
      throw createUnsupportedImageTypeException();
    const [thumbnail, display] = await Promise.all([
      this.render(file.buffer, 160, 160),
      this.render(file.buffer, 1080, 1920),
    ]);
    const uploaded: string[] = [];
    try {
      const thumbnailBlob = await this.blobStorageService.upload(
        'exercise-images/thumbnail.webp',
        thumbnail.buffer,
      );
      uploaded.push(thumbnailBlob.key);
      const displayBlob = await this.blobStorageService.upload(
        'exercise-images/display.webp',
        display.buffer,
      );
      uploaded.push(displayBlob.key);
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
      await this.deleteKeysSafely(uploaded);
      throw createImageUploadFailedException();
    }
  }

  async deleteImages(images: readonly StoredExerciseImage[]): Promise<void> {
    const keys = images.flatMap((image) => [
      image.thumbnail.key,
      image.display.key,
    ]);
    await this.deleteKeysSafely(keys);
    this.logger.log('ExerciseImageService -> deleteImages -> completed:', {
      data: { count: keys.length },
    });
  }

  async deleteKeysSafely(keys: readonly string[]): Promise<void> {
    this.logger.log('ExerciseImageService -> deleteKeysSafely -> params:', {
      params: { count: keys.length },
    });
    try {
      await this.blobStorageService.delete(keys);
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
    const { data, info } = await sharp(buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .autoOrient()
      .resize({ fit: 'inside', height, width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const result = { buffer: data, width: info.width, height: info.height };
    return result;
  }
}
