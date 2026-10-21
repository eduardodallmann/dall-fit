const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/** Recent assets can belong to an upload/copy that has not reached its CAS yet. */
export function reclaimableImageKeys(
  blobs: readonly { pathname: string; uploadedAt: Date }[],
  referenced: ReadonlySet<string>,
  now = Date.now(),
): string[] {
  return blobs
    .filter(
      (blob) =>
        !referenced.has(blob.pathname) &&
        Number.isFinite(blob.uploadedAt.getTime()) &&
        now - blob.uploadedAt.getTime() >= ORPHAN_GRACE_MS,
    )
    .map((blob) => blob.pathname);
}
