import { describe, expect, it } from 'vitest';

import { getPersonInitials } from '~/core/components/application-menu/get-person-initials';

describe('getPersonInitials', () => {
  it.each([
    { expected: 'TF', name: 'Taylor Morgan Fit' },
    { expected: 'T', name: 'Taylor' },
    { expected: 'TF', name: '  taylor   fit  ' },
  ])('returns $expected for $name', ({ expected, name }) => {
    expect(getPersonInitials(name)).toBe(expected);
  });
});
