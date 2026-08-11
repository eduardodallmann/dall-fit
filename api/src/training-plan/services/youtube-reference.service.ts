import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  createInvalidYoutubeReferenceException,
  createYoutubeUnavailableException,
} from '~/training-plan/errors/training-plan.errors';

const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;
const allowedHosts = new Set(['youtu.be', 'www.youtube.com', 'youtube.com']);

@Injectable()
export class YoutubeReferenceService {
  private readonly logger = new Logger(YoutubeReferenceService.name);
  constructor(private readonly configService: ConfigService) {}

  async normalizeAndValidate(reference: string): Promise<string> {
    this.logger.log(
      'YoutubeReferenceService -> normalizeAndValidate -> params:',
      { params: { referencePresent: reference.length > 0 } },
    );
    const youtubeId = this.normalize(reference);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.configService.getOrThrow<number>('YOUTUBE_VALIDATION_TIMEOUT_MS'),
    );
    try {
      const response = await fetch(
        `https://img.youtube.com/vi/${youtubeId}/default.jpg`,
        { method: 'GET', redirect: 'error', signal: controller.signal },
      );
      this.logger.log(
        'YoutubeReferenceService -> normalizeAndValidate -> thumbnail return:',
        { data: { successful: response.ok, status: response.status } },
      );
      if (!response.ok) throw createInvalidYoutubeReferenceException();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(
        'YoutubeReferenceService -> normalizeAndValidate -> unavailable error:',
        { data: { code: 'YOUTUBE_VALIDATION_UNAVAILABLE' } },
      );
      throw createYoutubeUnavailableException();
    } finally {
      clearTimeout(timeout);
    }
    this.logger.log(
      'YoutubeReferenceService -> normalizeAndValidate -> return:',
      { data: { valid: true } },
    );
    return youtubeId;
  }

  normalize(reference: string): string {
    const trimmed = reference.trim();
    if (youtubeIdPattern.test(trimmed)) return trimmed;
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw createInvalidYoutubeReferenceException();
    }
    if (
      url.protocol !== 'https:' ||
      !allowedHosts.has(url.hostname) ||
      url.username !== '' ||
      url.password !== ''
    )
      throw createInvalidYoutubeReferenceException();
    let candidate: string | null = null;
    if (
      url.hostname === 'youtu.be' &&
      /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)
    )
      candidate = url.pathname.split('/')[1] ?? null;
    if (
      (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') &&
      url.pathname === '/watch'
    )
      candidate = url.searchParams.get('v');
    const shorts = /^\/shorts\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
    if (
      (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') &&
      shorts !== null
    )
      candidate = shorts[1] ?? null;
    if (candidate === null || !youtubeIdPattern.test(candidate))
      throw createInvalidYoutubeReferenceException();
    return candidate;
  }
}
