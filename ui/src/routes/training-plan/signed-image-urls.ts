import type { Exercise } from '@dall-fit/types';

export const SIGNED_IMAGE_URL_REFRESH_BUFFER_MS = 2 * 60 * 1000;

export function getSignedImageRefreshDelay(
  exercises: readonly Exercise[],
  now = Date.now(),
): number | undefined {
  const expirations = exercises.flatMap((exercise) =>
    exercise.type === 'image' && exercise.image !== null
      ? [Date.parse(exercise.image.signedUrlExpiresAt)]
      : [],
  );
  const validExpirations = expirations.filter(Number.isFinite);
  if (validExpirations.length === 0) return undefined;
  const earliestExpiration = Math.min(...validExpirations);
  const result = Math.max(
    0,
    earliestExpiration - SIGNED_IMAGE_URL_REFRESH_BUFFER_MS - now,
  );
  return result;
}

export function isSignedImageNearExpiration(
  signedUrlExpiresAt: string,
  now = Date.now(),
): boolean {
  const expiration = Date.parse(signedUrlExpiresAt);
  const result =
    Number.isFinite(expiration) &&
    expiration - now <= SIGNED_IMAGE_URL_REFRESH_BUFFER_MS;
  return result;
}
