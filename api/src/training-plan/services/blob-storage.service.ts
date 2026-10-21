import { Injectable, Logger } from '@nestjs/common';
import {
  BlobAccessError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
  copy,
  del,
  head,
  issueSignedToken,
  list,
  presignUrl,
  put,
} from '@vercel/blob';

const BLOB_OPERATION_TIMEOUT_MS = 10_000;

export type BlobFailureCategory =
  | 'aborted'
  | 'access_denied'
  | 'rate_limited'
  | 'service_unavailable'
  | 'store_not_found'
  | 'store_suspended'
  | 'unknown';

export type BlobOperation =
  'copy' | 'delete' | 'head' | 'list' | 'sign' | 'upload';

export class BlobStorageOperationError extends Error {
  constructor(
    readonly operation: BlobOperation,
    readonly category: BlobFailureCategory,
  ) {
    super(`Blob ${operation} failed with category ${category}.`);
    this.name = BlobStorageOperationError.name;
  }
}

export interface StoredBlob {
  etag: string;
  key: string;
}

export interface StoredBlobMetadata {
  etag: string;
}

@Injectable()
export class BlobStorageService {
  private readonly logger = new Logger(BlobStorageService.name);

  async copyVariant(
    source: string,
    destination: string,
    signal: AbortSignal,
    etag?: string,
  ): Promise<StoredBlob> {
    this.logger.log('BlobStorageService -> copyVariant -> params:', {
      params: { variants: 1 },
    });
    try {
      const abortSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
      ]);
      const metadata =
        etag === undefined ? await head(source, { abortSignal }) : { etag };
      this.logger.log('BlobStorageService -> copyVariant -> metadata return:', {
        data: { present: true },
      });
      const copied = await copy(source, destination, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'image/webp',
        cacheControlMaxAge: 31_536_000,
        ifMatch: metadata.etag,
        abortSignal,
      });
      this.logger.log('BlobStorageService -> copyVariant -> copy return:', {
        data: { copied: true },
      });
      const result = { key: copied.pathname, etag: copied.etag };
      this.logger.log('BlobStorageService -> copyVariant -> return:', {
        data: { copied: true },
      });
      return result;
    } catch (error: unknown) {
      const failure = this.toOperationError('copy', error);
      throw failure;
    }
  }

  async upload(pathname: string, content: Buffer): Promise<StoredBlob> {
    this.logger.log('BlobStorageService -> upload -> params:', {
      params: { bytes: content.byteLength, prefix: 'exercise-images' },
    });
    try {
      const blob = await put(pathname, content, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
        contentType: 'image/webp',
      });
      this.logger.log('BlobStorageService -> upload -> put return:', {
        data: { uploaded: true },
      });
      const result = { etag: blob.etag, key: blob.pathname };
      this.logger.log('BlobStorageService -> upload -> return:', {
        data: { uploaded: true },
      });
      return result;
    } catch (error: unknown) {
      const failure = this.toOperationError('upload', error);
      throw failure;
    }
  }

  async getMetadata(pathname: string): Promise<StoredBlobMetadata> {
    this.logger.log('BlobStorageService -> getMetadata -> params:', {
      params: { pathnamePresent: pathname.length > 0 },
    });
    try {
      const metadata = await head(pathname, {
        abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
      });
      this.logger.log('BlobStorageService -> getMetadata -> head return:', {
        data: { found: true },
      });
      const result = { etag: metadata.etag };
      this.logger.log('BlobStorageService -> getMetadata -> return:', {
        data: { etagPresent: result.etag.length > 0 },
      });
      return result;
    } catch (error: unknown) {
      const failure = this.toOperationError('head', error);
      throw failure;
    }
  }

  async createSignedReadUrl(
    pathname: string,
    validUntil: number,
    signal?: AbortSignal,
  ): Promise<string> {
    this.logger.log('BlobStorageService -> createSignedReadUrl -> params:', {
      params: { operation: 'get', pathnamePresent: pathname.length > 0 },
    });
    try {
      const signedToken = await issueSignedToken({
        abortSignal:
          signal === undefined
            ? AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS)
            : AbortSignal.any([
                signal,
                AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
              ]),
        operations: ['get'],
        pathname,
        validUntil,
      });
      this.logger.log(
        'BlobStorageService -> createSignedReadUrl -> issueSignedToken return:',
        { data: { issued: true } },
      );
      const signed = await presignUrl(signedToken, {
        access: 'private',
        operation: 'get',
        pathname,
        useCache: true,
        validUntil,
      });
      this.logger.log(
        'BlobStorageService -> createSignedReadUrl -> presignUrl return:',
        { data: { signed: true } },
      );
      const result = signed.presignedUrl;
      this.logger.log('BlobStorageService -> createSignedReadUrl -> return:', {
        data: { signed: true },
      });
      return result;
    } catch (error: unknown) {
      const failure = this.toOperationError('sign', error);
      throw failure;
    }
  }

  async delete(keys: readonly string[]): Promise<void> {
    this.logger.log('BlobStorageService -> delete -> params:', {
      params: { count: keys.length },
    });
    if (keys.length === 0) {
      this.logger.log('BlobStorageService -> delete -> empty branch:', {
        data: { count: 0 },
      });
      this.logger.log('BlobStorageService -> delete -> completed:', {
        data: { count: 0 },
      });
      return;
    }
    try {
      await del([...keys], {
        abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
      });
      this.logger.log('BlobStorageService -> delete -> del completed:', {
        data: { count: keys.length },
      });
      this.logger.log('BlobStorageService -> delete -> completed:', {
        data: { count: keys.length },
      });
    } catch (error: unknown) {
      const failure = this.toOperationError('delete', error);
      throw failure;
    }
  }

  async listExerciseKeys(): Promise<readonly string[]> {
    this.logger.log('BlobStorageService -> listExerciseKeys -> params:', {
      params: {},
    });
    const keys: string[] = [];
    let cursor: string | undefined;
    try {
      do {
        const page = await list({
          abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
          cursor,
          prefix: 'exercise-images/',
        });
        keys.push(...page.blobs.map((blob) => blob.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor !== undefined);
      this.logger.log(
        'BlobStorageService -> listExerciseKeys -> list completed:',
        { data: { count: keys.length } },
      );
      const result = keys;
      this.logger.log('BlobStorageService -> listExerciseKeys -> return:', {
        data: { count: result.length },
      });
      return result;
    } catch (error: unknown) {
      const failure = this.toOperationError('list', error);
      throw failure;
    }
  }

  private toOperationError(
    operation: BlobOperation,
    error: unknown,
  ): BlobStorageOperationError {
    const category = classifyBlobFailure(error);
    this.logger.error('BlobStorageService -> toOperationError -> sdk error:', {
      data: { category, operation },
    });
    const result = new BlobStorageOperationError(operation, category);
    this.logger.log('BlobStorageService -> toOperationError -> return:', {
      data: { category, operation },
    });
    return result;
  }
}

function classifyBlobFailure(error: unknown): BlobFailureCategory {
  let result: BlobFailureCategory;
  if (
    error instanceof BlobRequestAbortedError ||
    (error instanceof DOMException && error.name === 'TimeoutError')
  ) {
    result = 'aborted';
  } else if (error instanceof BlobAccessError) {
    result = 'access_denied';
  } else if (error instanceof BlobStoreNotFoundError) {
    result = 'store_not_found';
  } else if (error instanceof BlobStoreSuspendedError) {
    result = 'store_suspended';
  } else if (error instanceof BlobServiceRateLimited) {
    result = 'rate_limited';
  } else if (error instanceof BlobServiceNotAvailable) {
    result = 'service_unavailable';
  } else if (error instanceof BlobUnknownError) {
    result = 'unknown';
  } else {
    result = 'unknown';
  }
  return result;
}
