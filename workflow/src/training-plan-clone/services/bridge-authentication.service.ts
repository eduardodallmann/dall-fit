import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { WorkflowLogger } from '../../core/logger';
import type { StartCloneRunInput } from '../domain';

const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const SIGNATURE_PREFIX = 'sha256=';

export class BridgeAuthenticationService {
  private readonly logger = new WorkflowLogger(
    BridgeAuthenticationService.name,
  );

  authenticate(input: {
    body: string;
    method: string;
    pathname: string;
    signature: string | undefined;
    timestamp: string | undefined;
    version: string | undefined;
    now: Date;
  }): StartCloneRunInput {
    this.logger.info('authenticate', 'params', {
      bodyBytes: Buffer.byteLength(input.body),
      signaturePresent: input.signature !== undefined,
      timestampPresent: input.timestamp !== undefined,
      versionPresent: input.version !== undefined,
    });
    if (input.version !== '1') throw new BridgeAuthenticationError('version');
    if (
      input.timestamp === undefined ||
      !/^\d{13}$/u.test(input.timestamp) ||
      Math.abs(input.now.getTime() - Number(input.timestamp)) >
        ALLOWED_CLOCK_SKEW_MS
    )
      throw new BridgeAuthenticationError('timestamp');
    if (
      input.signature === undefined ||
      !input.signature.startsWith(SIGNATURE_PREFIX)
    )
      throw new BridgeAuthenticationError('signature');
    const bodyHash = createHash('sha256').update(input.body).digest('hex');
    const canonical = [
      input.method,
      input.pathname,
      input.timestamp,
      bodyHash,
    ].join('\n');
    const expected = createHmac('sha256', this.secret())
      .update(canonical)
      .digest('hex');
    const received = input.signature.slice(SIGNATURE_PREFIX.length);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    )
      throw new BridgeAuthenticationError('signature');
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.body);
    } catch {
      throw new BridgeAuthenticationError('body');
    }
    if (!this.isStartInput(parsed)) throw new BridgeAuthenticationError('body');
    this.logger.info('authenticate', 'return', {
      cloneJobId: parsed.cloneJobId,
      generation: parsed.generation,
    });
    return parsed;
  }

  private isStartInput(value: unknown): value is StartCloneRunInput {
    if (typeof value !== 'object' || value === null) return false;
    const keys = Object.keys(value);
    return (
      keys.length === 2 &&
      keys.includes('cloneJobId') &&
      keys.includes('generation') &&
      'cloneJobId' in value &&
      typeof value.cloneJobId === 'string' &&
      /^[a-f\d]{24}$/iu.test(value.cloneJobId) &&
      'generation' in value &&
      Number.isSafeInteger(value.generation) &&
      Number(value.generation) > 0
    );
  }

  private secret(): string {
    const result = process.env.WORKFLOW_HMAC_SECRET;
    if (result === undefined || result.length < 32)
      throw new Error('WORKFLOW_HMAC_SECRET is required.');
    return result;
  }
}

export type BridgeAuthenticationErrorCode =
  'body' | 'signature' | 'timestamp' | 'version';

export class BridgeAuthenticationError extends Error {
  constructor(readonly code: BridgeAuthenticationErrorCode) {
    super(code);
    this.name = 'BridgeAuthenticationError';
  }
}
