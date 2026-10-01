import { Injectable, Logger } from '@nestjs/common';

import type {
  OfflineTrainingServerVersionV1,
  OfflineTrainingSnapshotV1,
  PutOfflineTrainingSnapshotV1Request,
} from '@dall-fit/types';

import { RedisClientService } from '~/redis/redis-client.service';
import { RedisKeyService } from '~/redis/redis-key.service';
import { RedisUnavailableError } from '~/redis/redis.errors';
import {
  OFFLINE_TRAINING_SNAPSHOT_TTL_MS,
  type OfflineTrainingSnapshotIngestInput,
  type OfflineTrainingSnapshotIngestResult,
  type OfflineTrainingTerminalCleanupInput,
} from '~/training/domain/offline-training-snapshot.types';
import {
  OfflineTrainingLeaseExpiredError,
  OfflineTrainingLeaseRevokedError,
} from '~/training/errors/offline-training-lease.errors';
import {
  OfflineTrainingSnapshotResolutionExpiredError,
  OfflineTrainingSnapshotUnavailableError,
  OfflineTrainingSnapshotVersionConflictError,
} from '~/training/errors/offline-training-snapshot.errors';
import { TrainingClockService } from '~/training/services/training-clock.service';

const INGEST_SCRIPT = `
local leaseRaw = redis.call('GET', KEYS[1])
if not leaseRaw then return {'lease-expired', '', '', '', '', '', '', '', ''} end
local lease = cjson.decode(leaseRaw)
if lease.personId ~= ARGV[1] or lease.installationId ~= ARGV[3] or lease.leaseId ~= ARGV[4] then
  return {'lease-revoked', '', '', '', '', '', '', '', ''}
end

local currentExecutionId = redis.call('HGET', KEYS[2], 'executionId')
local currentHash = currentExecutionId and redis.call('HGET', KEYS[2], 'contentHash') or nil
local resolutionChoice = ARGV[14]
local resolutionToken = ARGV[15]

local function currentResult(state)
  return {
    state,
    redis.call('HGET', KEYS[2], 'acceptedAtMs'),
    redis.call('HGET', KEYS[2], 'orderedAtMs'),
    redis.call('HGET', KEYS[2], 'expiresAtMs'),
    currentExecutionId,
    redis.call('HGET', KEYS[2], 'revision'),
    redis.call('HGET', KEYS[2], 'clientUpdatedAt'),
    currentHash,
    redis.call('HGET', KEYS[2], 'snapshot')
  }
end

if resolutionChoice ~= '' then
  if not currentExecutionId or currentHash ~= resolutionToken then
    if currentExecutionId then return currentResult('conflict') end
    return {'resolution-expired', '', '', '', '', '', '', '', ''}
  end
  if resolutionChoice == 'server' then return currentResult('resolved-server') end
end

if currentExecutionId and resolutionChoice ~= 'local' then
  if currentExecutionId ~= ARGV[5] then return currentResult('conflict') end
  local currentRevision = tonumber(redis.call('HGET', KEYS[2], 'revision'))
  local incomingRevision = tonumber(ARGV[6])
  if incomingRevision < currentRevision then return currentResult('conflict') end
  if incomingRevision == currentRevision then
    if currentHash ~= ARGV[7] then return currentResult('conflict') end
    return currentResult('duplicate')
  end
end

local nowMs = tonumber(ARGV[10])
local expiresAtMs = tonumber(ARGV[11])
local clientUpdatedAtMs = tonumber(ARGV[9])
local orderedAtMs = clientUpdatedAtMs
if currentExecutionId then
  local previousClientUpdatedAtMs = tonumber(redis.call('HGET', KEYS[2], 'clientUpdatedAtMs'))
  local previousOrderedAtMs = tonumber(redis.call('HGET', KEYS[2], 'orderedAtMs'))
  if clientUpdatedAtMs <= previousClientUpdatedAtMs or clientUpdatedAtMs <= previousOrderedAtMs then
    orderedAtMs = math.max(nowMs, previousOrderedAtMs + 1)
  end
end

lease.expiresAt = ARGV[12]
redis.call('SET', KEYS[1], cjson.encode(lease), 'PXAT', ARGV[11])
redis.call('HSET', KEYS[2],
  'payloadVersion', '1',
  'executionId', ARGV[5],
  'revision', ARGV[6],
  'contentHash', ARGV[7],
  'clientUpdatedAt', ARGV[8],
  'clientUpdatedAtMs', ARGV[9],
  'acceptedAtMs', ARGV[10],
  'orderedAtMs', tostring(orderedAtMs),
  'expiresAtMs', ARGV[11],
  'snapshot', ARGV[13]
)
redis.call('PEXPIREAT', KEYS[2], ARGV[11])
local acceptedState = resolutionChoice == 'local' and 'resolved-local' or 'accepted'
return {acceptedState, ARGV[10], tostring(orderedAtMs), ARGV[11], ARGV[5], ARGV[6], ARGV[8], ARGV[7], ARGV[13]}
`;

const CLEANUP_SCRIPT = `
local currentExecutionId = redis.call('HGET', KEYS[1], 'executionId')
if not currentExecutionId then return 0 end
if currentExecutionId ~= ARGV[1] then return 0 end
if redis.call('HGET', KEYS[1], 'revision') ~= ARGV[2] then return 0 end
if redis.call('HGET', KEYS[1], 'contentHash') ~= ARGV[3] then return 0 end
return redis.call('DEL', KEYS[1])
`;

type ScriptState =
  | 'accepted'
  | 'conflict'
  | 'duplicate'
  | 'lease-expired'
  | 'lease-revoked'
  | 'resolution-expired'
  | 'resolved-local'
  | 'resolved-server';

type ScriptResult = [
  ScriptState,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

@Injectable()
export class OfflineTrainingSnapshotService {
  private readonly logger = new Logger(OfflineTrainingSnapshotService.name);

  constructor(
    private readonly redis: RedisClientService,
    private readonly keys: RedisKeyService,
    private readonly clock: TrainingClockService,
  ) {}

  async ingest(
    input: OfflineTrainingSnapshotIngestInput,
  ): Promise<OfflineTrainingSnapshotIngestResult> {
    this.logger.log('OfflineTrainingSnapshotService -> ingest -> params:', {
      params: {
        payloadVersion: input.request.payloadVersion,
        resolution: input.request.resolution?.choice ?? 'none',
        snapshotState: input.request.snapshot.state,
      },
    });
    const nowMs = this.clock.now().getTime();
    const expiresAtMs = nowMs + OFFLINE_TRAINING_SNAPSHOT_TTL_MS;
    const leaseKey = this.keys.create('offline-training-lease', input.personId);
    const snapshotKey = this.keys.create(
      'offline-training-snapshot',
      input.personId,
    );
    try {
      const raw = await this.redis.execute((client) =>
        client.eval(
          INGEST_SCRIPT,
          2,
          leaseKey,
          snapshotKey,
          input.personId,
          input.request.snapshot.plan.planId,
          input.request.installationId,
          input.request.leaseId,
          input.request.executionId,
          String(input.request.revision),
          input.contentHash,
          input.request.clientUpdatedAt,
          String(Date.parse(input.request.clientUpdatedAt)),
          String(nowMs),
          String(expiresAtMs),
          new Date(expiresAtMs).toISOString(),
          input.serializedSnapshot,
          input.request.resolution?.choice ?? '',
          input.request.resolution?.conflictToken ?? '',
        ),
      );
      const script = this.parseScriptResult(raw);
      this.logger.log(
        'OfflineTrainingSnapshotService -> ingest -> redis return:',
        { data: { state: script[0] } },
      );
      const result = this.toIngestResult(input.request, script);
      this.logger.log('OfflineTrainingSnapshotService -> ingest -> return:', {
        data: { state: result.result.state },
      });
      return result;
    } catch (error: unknown) {
      this.rethrowKnownOrUnavailable(error);
    }
  }

  async cleanupTerminal(
    input: OfflineTrainingTerminalCleanupInput,
  ): Promise<void> {
    this.logger.log(
      'OfflineTrainingSnapshotService -> cleanupTerminal -> params:',
      { params: { scoped: true } },
    );
    const snapshotKey = this.keys.create(
      'offline-training-snapshot',
      input.personId,
    );
    try {
      const raw = await this.redis.execute((client) =>
        client.eval(
          CLEANUP_SCRIPT,
          1,
          snapshotKey,
          input.executionId,
          String(input.revision),
          input.contentHash,
        ),
      );
      this.logger.log(
        'OfflineTrainingSnapshotService -> cleanupTerminal -> redis return:',
        { data: { removed: raw === 1 } },
      );
      this.logger.log(
        'OfflineTrainingSnapshotService -> cleanupTerminal -> completed:',
        { data: { completed: true } },
      );
    } catch (error: unknown) {
      this.rethrowKnownOrUnavailable(error);
    }
  }

  private parseScriptResult(raw: unknown): ScriptResult {
    this.logger.log(
      'OfflineTrainingSnapshotService -> parseScriptResult -> params:',
      { params: { arrayResponse: Array.isArray(raw) } },
    );
    if (
      !Array.isArray(raw) ||
      raw.length !== 9 ||
      !raw.every((item) => typeof item === 'string')
    ) {
      throw new Error('Invalid offline snapshot script response.');
    }
    const states: readonly ScriptState[] = [
      'accepted',
      'conflict',
      'duplicate',
      'lease-expired',
      'lease-revoked',
      'resolution-expired',
      'resolved-local',
      'resolved-server',
    ];
    if (!states.includes(raw[0] as ScriptState)) {
      throw new Error('Invalid offline snapshot script state.');
    }
    const result = raw as ScriptResult;
    this.logger.log(
      'OfflineTrainingSnapshotService -> parseScriptResult -> return:',
      { data: { state: result[0] } },
    );
    return result;
  }

  private toIngestResult(
    request: PutOfflineTrainingSnapshotV1Request,
    script: ScriptResult,
  ): OfflineTrainingSnapshotIngestResult {
    this.logger.log(
      'OfflineTrainingSnapshotService -> toIngestResult -> params:',
      { params: { state: script[0] } },
    );
    const [
      state,
      acceptedAtMs,
      orderedAtMs,
      persistedExpiresAtMs,
      executionId,
      revision,
      clientUpdatedAt,
      contentHash,
      serializedSnapshot,
    ] = script;
    if (state === 'lease-expired') throw new OfflineTrainingLeaseExpiredError();
    if (state === 'lease-revoked') throw new OfflineTrainingLeaseRevokedError();
    if (state === 'resolution-expired') {
      throw new OfflineTrainingSnapshotResolutionExpiredError();
    }
    if (state === 'conflict') {
      const serverVersion = this.serverVersion(
        acceptedAtMs,
        clientUpdatedAt,
        executionId,
        persistedExpiresAtMs,
        orderedAtMs,
        revision,
        serializedSnapshot,
      );
      throw new OfflineTrainingSnapshotVersionConflictError(
        serverVersion,
        contentHash,
      );
    }
    const effectiveRequest =
      state === 'resolved-server'
        ? {
            clientUpdatedAt,
            executionId,
            installationId: request.installationId,
            leaseId: request.leaseId,
            payloadVersion: 1 as const,
            revision: Number(revision),
            snapshot: this.parseSnapshot(serializedSnapshot),
          }
        : request;
    const publicState = state;
    const result: OfflineTrainingSnapshotIngestResult = {
      contentHash,
      effectiveRequest,
      result: {
        acceptedAt: new Date(Number(acceptedAtMs)).toISOString(),
        executionId,
        expiresAt: new Date(Number(persistedExpiresAtMs)).toISOString(),
        orderedAt: new Date(Number(orderedAtMs)).toISOString(),
        revision: Number(revision),
        snapshotState: effectiveRequest.snapshot.state,
        state: publicState,
      },
    };
    this.logger.log(
      'OfflineTrainingSnapshotService -> toIngestResult -> return:',
      { data: { state: result.result.state } },
    );
    return result;
  }

  private serverVersion(
    acceptedAtMs: string,
    clientUpdatedAt: string,
    executionId: string,
    expiresAtMs: string,
    orderedAtMs: string,
    revision: string,
    serializedSnapshot: string,
  ): OfflineTrainingServerVersionV1 {
    this.logger.log(
      'OfflineTrainingSnapshotService -> serverVersion -> params:',
      { params: { present: serializedSnapshot.length > 0 } },
    );
    const result: OfflineTrainingServerVersionV1 = {
      acceptedAt: new Date(Number(acceptedAtMs)).toISOString(),
      clientUpdatedAt,
      executionId,
      expiresAt: new Date(Number(expiresAtMs)).toISOString(),
      orderedAt: new Date(Number(orderedAtMs)).toISOString(),
      revision: Number(revision),
      snapshot: this.parseSnapshot(serializedSnapshot),
    };
    this.logger.log(
      'OfflineTrainingSnapshotService -> serverVersion -> return:',
      { data: { snapshotState: result.snapshot.state } },
    );
    return result;
  }

  private parseSnapshot(serialized: string): OfflineTrainingSnapshotV1 {
    this.logger.log(
      'OfflineTrainingSnapshotService -> parseSnapshot -> params:',
      { params: { present: serialized.length > 0 } },
    );
    const result = JSON.parse(serialized) as OfflineTrainingSnapshotV1;
    this.logger.log(
      'OfflineTrainingSnapshotService -> parseSnapshot -> return:',
      { data: { snapshotState: result.state } },
    );
    return result;
  }

  private rethrowKnownOrUnavailable(error: unknown): never {
    this.logger.log(
      'OfflineTrainingSnapshotService -> rethrowKnownOrUnavailable -> params:',
      { params: { errorKnown: error instanceof Error } },
    );
    if (
      error instanceof OfflineTrainingLeaseExpiredError ||
      error instanceof OfflineTrainingLeaseRevokedError ||
      error instanceof OfflineTrainingSnapshotResolutionExpiredError ||
      error instanceof OfflineTrainingSnapshotVersionConflictError
    ) {
      this.logger.warn(
        'OfflineTrainingSnapshotService -> ingest -> domain error:',
        { data: { errorName: error.name } },
      );
      throw error;
    }
    this.logger.error(
      'OfflineTrainingSnapshotService -> ingest -> unavailable error:',
      {
        data: {
          errorName:
            error instanceof RedisUnavailableError
              ? RedisUnavailableError.name
              : 'InvalidRedisResponse',
        },
      },
    );
    throw new OfflineTrainingSnapshotUnavailableError();
  }
}
