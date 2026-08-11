import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { YoutubeReferenceService } from '~/training-plan/services/youtube-reference.service';

describe('YoutubeReferenceService', () => {
  const service = new YoutubeReferenceService({
    getOrThrow: () => 500,
  } as unknown as ConfigService);

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['ZA8gs8XP2bs', 'ZA8gs8XP2bs'],
    ['https://youtu.be/ZA8gs8XP2bs', 'ZA8gs8XP2bs'],
    ['https://www.youtube.com/watch?v=ZA8gs8XP2bs', 'ZA8gs8XP2bs'],
    ['https://youtube.com/shorts/ZA8gs8XP2bs', 'ZA8gs8XP2bs'],
  ])('normalizes %s', (reference, expected) => {
    expect(service.normalize(reference)).toBe(expected);
  });

  it.each([
    'http://youtu.be/ZA8gs8XP2bs',
    'https://evil.test/watch?v=ZA8gs8XP2bs',
    'https://youtube.com/embed/ZA8gs8XP2bs',
    'invalid',
  ])('rejects unsafe references before network: %s', (reference) => {
    expect(() => service.normalize(reference)).toThrow();
  });

  it('validates against only the fixed thumbnail host', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      service.normalizeAndValidate('https://youtu.be/ZA8gs8XP2bs'),
    ).resolves.toBe('ZA8gs8XP2bs');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://img.youtube.com/vi/ZA8gs8XP2bs/default.jpg',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
  });

  it('distinguishes a missing thumbnail from integration unavailability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })),
    );
    await expect(
      service.normalizeAndValidate('ZA8gs8XP2bs'),
    ).rejects.toMatchObject({ status: 400 });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new Error('network unavailable')),
    );
    await expect(
      service.normalizeAndValidate('ZA8gs8XP2bs'),
    ).rejects.toMatchObject({ status: 503 });
  });
});
