import axios from 'axios';

export type HttpFailureKind =
  'cancelled' | 'http' | 'network' | 'timeout' | 'unknown';

export interface ClassifiedHttpFailure {
  code?: string;
  kind: HttpFailureKind;
  status?: number;
}

export class AmbiguousMutationError extends Error {
  constructor(cause: unknown) {
    super('The mutation result must be read before another write.', { cause });
    this.name = 'AmbiguousMutationError';
  }
}

const retryableStatuses = new Set([408, 500, 502, 503, 504]);

export function getApiErrorCode(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const data: unknown = error.response?.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return undefined;
  const code = (data as Record<string, unknown>).code;
  return typeof code === 'string' ? code : undefined;
}

export function classifyHttpFailure(error: unknown): ClassifiedHttpFailure {
  if (error instanceof DOMException && error.name === 'AbortError')
    return { kind: 'cancelled' };
  if (axios.isCancel(error)) return { kind: 'cancelled' };
  if (!axios.isAxiosError(error)) return { kind: 'unknown' };
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
    return { kind: 'timeout' };
  if (error.response === undefined) return { kind: 'network' };
  return {
    code: getApiErrorCode(error),
    kind: 'http',
    status: error.response.status,
  };
}

export function isExpectedCancellation(error: unknown): boolean {
  return classifyHttpFailure(error).kind === 'cancelled';
}

export function isAmbiguousMutationFailure(error: unknown): boolean {
  if (error instanceof AmbiguousMutationError) return true;
  const failure = classifyHttpFailure(error);
  return (
    failure.kind === 'network' ||
    failure.kind === 'timeout' ||
    (failure.status === 503 &&
      (failure.code === 'EXERCISE_COPY_RESULT_UNCERTAIN' ||
        failure.code === 'EXERCISE_IMAGE_RESULT_UNCERTAIN' ||
        failure.code === 'WORKOUT_DUPLICATION_RESULT_UNCERTAIN'))
  );
}

export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= 1) return false;
  const failure = classifyHttpFailure(error);
  if (failure.kind === 'network' || failure.kind === 'timeout') return true;
  return failure.kind === 'http' && retryableStatuses.has(failure.status ?? 0);
}

export function queryRetryDelay(): number {
  return 1_000;
}
