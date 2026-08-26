import { Injectable, Logger } from '@nestjs/common';

import { RedisClientService } from '~/redis/redis-client.service';
import { RedisKeyService } from '~/redis/redis-key.service';
import type { WorkoutSessionSnapshot } from '~/training/domain/training.types';
import {
  createWorkoutSessionAlreadyActiveException,
  createWorkoutSessionNotFoundException,
  createWorkoutSessionTooLargeException,
  createWorkoutSessionVersionConflictException,
} from '~/training/errors/training.errors';

const MAX_SESSION_BYTES = 1024 * 1024;
const EXPIRY_RECEIPT_TTL_MS = 60 * 60 * 1000;
const COMPLETION_RECEIPT_TTL_SECONDS = 10 * 60;

const CREATE_SCRIPT = `
local created = redis.call('SET', KEYS[1], ARGV[1], 'PXAT', ARGV[2], 'NX')
if not created then return 0 end
redis.call('SET', KEYS[2], ARGV[3], 'PXAT', ARGV[4])
redis.call('DEL', KEYS[3])
return 1
`;

const CAS_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
local current = cjson.decode(raw)
if current.id ~= ARGV[1] then return -1 end
if tonumber(current.version) ~= tonumber(ARGV[2]) then return -2 end
redis.call('SET', KEYS[1], ARGV[3], 'PXAT', ARGV[4])
return 1
`;

const DELETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local current = cjson.decode(raw)
if current.id ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1], KEYS[2])
`;

@Injectable()
export class WorkoutSessionStore {
  private readonly logger = new Logger(WorkoutSessionStore.name);

  constructor(
    private readonly redis: RedisClientService,
    private readonly keys: RedisKeyService,
  ) {}

  async create(snapshot: WorkoutSessionSnapshot): Promise<void> {
    this.logger.log('WorkoutSessionStore -> create -> params:', {
      params: { personId: snapshot.personId, sessionId: snapshot.id },
    });
    const serialized = this.serialize(snapshot);
    const key = this.keys.create('workout-session', snapshot.personId);
    const expiryKey = this.keys.create(
      'workout-session-expiry',
      snapshot.personId,
    );
    const completionReceiptKey = this.keys.create(
      'workout-completion-receipt',
      snapshot.personId,
    );
    const expiresAt = new Date(snapshot.expiresAt).getTime();
    const created = await this.redis.execute((client) =>
      client.eval(
        CREATE_SCRIPT,
        3,
        key,
        expiryKey,
        completionReceiptKey,
        serialized,
        String(expiresAt),
        snapshot.id,
        String(expiresAt + EXPIRY_RECEIPT_TTL_MS),
      ),
    );
    this.logger.log('WorkoutSessionStore -> create -> redis return:', {
      data: { created: created === 1, sessionId: snapshot.id },
    });
    if (created !== 1) throw createWorkoutSessionAlreadyActiveException();
    this.logger.log('WorkoutSessionStore -> create -> completed:', {
      data: { sessionId: snapshot.id },
    });
  }

  async get(personId: string): Promise<WorkoutSessionSnapshot | null> {
    this.logger.log('WorkoutSessionStore -> get -> params:', {
      params: { personId },
    });
    const key = this.keys.create('workout-session', personId);
    const serialized = await this.redis.execute((client) => client.get(key));
    this.logger.log('WorkoutSessionStore -> get -> redis return:', {
      data: { found: serialized !== null },
    });
    const result =
      serialized === null ? null : this.parse(serialized, personId);
    this.logger.log('WorkoutSessionStore -> get -> return:', {
      data: { found: result !== null, personId },
    });
    return result;
  }

  async wasRecentlyExpired(personId: string): Promise<boolean> {
    this.logger.log('WorkoutSessionStore -> wasRecentlyExpired -> params:', {
      params: { personId },
    });
    const key = this.keys.create('workout-session-expiry', personId);
    const receipt = await this.redis.execute((client) => client.get(key));
    const result = receipt !== null;
    this.logger.log('WorkoutSessionStore -> wasRecentlyExpired -> return:', {
      data: { expired: result, personId },
    });
    return result;
  }

  async saveCompletionReceipt(
    personId: string,
    executionId: string,
  ): Promise<void> {
    this.logger.log('WorkoutSessionStore -> saveCompletionReceipt -> params:', {
      params: { executionId, personId },
    });
    const key = this.keys.create('workout-completion-receipt', personId);
    await this.redis.execute((client) =>
      client.set(key, executionId, 'EX', COMPLETION_RECEIPT_TTL_SECONDS),
    );
    this.logger.log(
      'WorkoutSessionStore -> saveCompletionReceipt -> completed:',
      { data: { executionId, personId } },
    );
  }

  async getCompletionReceipt(personId: string): Promise<string | null> {
    this.logger.log('WorkoutSessionStore -> getCompletionReceipt -> params:', {
      params: { personId },
    });
    const key = this.keys.create('workout-completion-receipt', personId);
    const result = await this.redis.execute((client) => client.get(key));
    this.logger.log('WorkoutSessionStore -> getCompletionReceipt -> return:', {
      data: { found: result !== null, personId },
    });
    return result;
  }

  async update(
    personId: string,
    sessionId: string,
    expectedVersion: number,
    mutate: (current: WorkoutSessionSnapshot) => WorkoutSessionSnapshot,
  ): Promise<WorkoutSessionSnapshot> {
    this.logger.log('WorkoutSessionStore -> update -> params:', {
      params: { expectedVersion, personId, sessionId },
    });
    const current = await this.get(personId);
    if (current === null || current.id !== sessionId)
      throw createWorkoutSessionNotFoundException();
    if (current.version !== expectedVersion)
      throw createWorkoutSessionVersionConflictException();
    const next = { ...mutate(current), version: current.version + 1 };
    const serialized = this.serialize(next);
    const key = this.keys.create('workout-session', personId);
    const cas = await this.redis.execute((client) =>
      client.eval(
        CAS_SCRIPT,
        1,
        key,
        sessionId,
        String(expectedVersion),
        serialized,
        String(new Date(next.expiresAt).getTime()),
      ),
    );
    this.logger.log('WorkoutSessionStore -> update -> redis return:', {
      data: { outcome: cas, sessionId },
    });
    if (cas === -1) throw createWorkoutSessionNotFoundException();
    if (cas !== 1) throw createWorkoutSessionVersionConflictException();
    const result = next;
    this.logger.log('WorkoutSessionStore -> update -> return:', {
      data: { sessionId, version: result.version },
    });
    return result;
  }

  async delete(personId: string, sessionId: string): Promise<boolean> {
    this.logger.log('WorkoutSessionStore -> delete -> params:', {
      params: { personId, sessionId },
    });
    const key = this.keys.create('workout-session', personId);
    const expiryKey = this.keys.create('workout-session-expiry', personId);
    const deleted = await this.redis.execute((client) =>
      client.eval(DELETE_SCRIPT, 2, key, expiryKey, sessionId),
    );
    const result = deleted === 1;
    this.logger.log('WorkoutSessionStore -> delete -> return:', {
      data: { deleted: result, sessionId },
    });
    return result;
  }

  private parse(serialized: string, personId: string): WorkoutSessionSnapshot {
    const value: unknown = JSON.parse(serialized);
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      (value as { personId?: unknown }).personId !== personId
    ) {
      throw new Error('Invalid workout session payload.');
    }
    const result = value as WorkoutSessionSnapshot;
    return result;
  }

  private serialize(snapshot: WorkoutSessionSnapshot): string {
    const result = JSON.stringify(snapshot);
    if (Buffer.byteLength(result, 'utf8') > MAX_SESSION_BYTES)
      throw createWorkoutSessionTooLargeException();
    return result;
  }
}
