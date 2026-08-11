import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, list, put } from '@vercel/blob';

const BLOB_OPERATION_TIMEOUT_MS = 10_000;

export interface StoredBlob {
  key: string;
  url: string;
}

@Injectable()
export class BlobStorageService {
  private readonly logger = new Logger(BlobStorageService.name);
  constructor(private readonly configService: ConfigService) {}

  async upload(pathname: string, content: Buffer): Promise<StoredBlob> {
    this.logger.log('BlobStorageService -> upload -> params:', {
      params: { bytes: content.byteLength, prefix: 'exercise-images' },
    });
    const blob = await put(pathname, content, {
      access: 'public',
      addRandomSuffix: true,
      abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
      contentType: 'image/webp',
      token: this.configService.getOrThrow<string>('BLOB_READ_WRITE_TOKEN'),
    });
    const result = { key: blob.pathname, url: blob.url };
    this.logger.log('BlobStorageService -> upload -> return:', {
      data: { uploaded: true },
    });
    return result;
  }

  async delete(keys: readonly string[]): Promise<void> {
    this.logger.log('BlobStorageService -> delete -> params:', {
      params: { count: keys.length },
    });
    if (keys.length > 0) {
      await del([...keys], {
        abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
        token: this.configService.getOrThrow<string>('BLOB_READ_WRITE_TOKEN'),
      });
    }
    this.logger.log('BlobStorageService -> delete -> completed:', {
      data: { count: keys.length },
    });
  }

  async listExerciseKeys(): Promise<readonly string[]> {
    this.logger.log('BlobStorageService -> listExerciseKeys -> params:', {
      params: {},
    });
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({
        abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
        cursor,
        prefix: 'exercise-images/',
        token: this.configService.getOrThrow<string>('BLOB_READ_WRITE_TOKEN'),
      });
      keys.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor !== undefined);
    this.logger.log('BlobStorageService -> listExerciseKeys -> return:', {
      data: { count: keys.length },
    });
    return keys;
  }
}
