import { describe, expect, it } from 'vitest';

import {
  formatResourceVersion,
  parseResourceVersion,
} from '~/training-plan/domain/resource-version';

describe('resource version', () => {
  it.each([0, 1, 12, Number.MAX_SAFE_INTEGER])(
    'formats and parses the canonical integer %s',
    (version) => {
      const formatted = formatResourceVersion(version);
      expect(formatted).toBe(String(version));
      expect(parseResourceVersion(formatted)).toBe(version);
    },
  );

  it.each([
    '',
    '-1',
    '01',
    '1.0',
    '1e3',
    ' 1',
    '1 ',
    '1, 2',
    String(Number.MAX_SAFE_INTEGER + 1),
  ])('rejects a non-canonical value: %s', (value) => {
    expect(() => parseResourceVersion(value)).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });

  it('rejects an absent value', () => {
    expect(() => parseResourceVersion(undefined)).toThrowError(
      expect.objectContaining({ status: 428 }),
    );
  });
});
