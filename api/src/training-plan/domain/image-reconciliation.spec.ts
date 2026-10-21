import { describe, expect, it } from 'vitest';

import { reclaimableImageKeys } from './image-reconciliation';

describe('image reconciliation grace period', () => {
  it('protects in-flight copies and referenced assets while reclaiming old orphans', () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    const blobs = [
      { pathname: 'in-flight', uploadedAt: new Date(now - 45_000) },
      { pathname: 'materialized', uploadedAt: new Date(now - 2 * 86_400_000) },
      { pathname: 'orphan', uploadedAt: new Date(now - 86_400_000) },
    ];
    expect(reclaimableImageKeys(blobs, new Set(['materialized']), now)).toEqual(
      ['orphan'],
    );
  });
});
