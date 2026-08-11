import {
  createPreconditionRequiredException,
  createValidationException,
} from '~/training-plan/errors/training-plan.errors';

export const RESOURCE_VERSION_HEADER = 'X-Resource-Version';

const resourceVersionPattern = /^(0|[1-9]\d*)$/;

export function formatResourceVersion(version: number): string {
  const result = String(version);
  return result;
}

export function parseResourceVersion(value: string | undefined): number {
  if (value === undefined) throw createPreconditionRequiredException();
  if (!resourceVersionPattern.test(value)) throw createValidationException();
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw createValidationException();
  return result;
}
