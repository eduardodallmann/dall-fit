import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type { PutOfflineTrainingSnapshotV1Request } from '@dall-fit/types';

function sortCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortCanonicalValue(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortCanonicalValue(item)]),
    );
  }
  return value;
}

@Injectable()
export class OfflineTrainingSnapshotContentService {
  private readonly logger = new Logger(
    OfflineTrainingSnapshotContentService.name,
  );

  prepare(request: PutOfflineTrainingSnapshotV1Request): {
    contentHash: string;
    serializedSnapshot: string;
  } {
    this.logger.log(
      'OfflineTrainingSnapshotContentService -> prepare -> params:',
      { params: { payloadVersion: request.payloadVersion } },
    );
    const canonical = JSON.stringify(sortCanonicalValue(request));
    const serializedSnapshot = JSON.stringify(request.snapshot);
    const contentHash = createHash('sha256').update(canonical).digest('hex');
    const result = { contentHash, serializedSnapshot };
    this.logger.log(
      'OfflineTrainingSnapshotContentService -> prepare -> return:',
      { data: { prepared: true } },
    );
    return result;
  }
}
