import { createHash } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

interface RateWindow {
  count: number;
  expiresAt: number;
}

@Injectable()
export class AndroidAppCompatibilityRateLimitGuard implements CanActivate {
  private static readonly MAX_IDENTIFIERS = 10_000;

  private readonly logger = new Logger(
    AndroidAppCompatibilityRateLimitGuard.name,
  );
  private readonly windows = new Map<string, RateWindow>();

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    if (request.method === 'OPTIONS') return true;
    const response = http.getResponse<Response>();
    const limit = this.configService.getOrThrow<number>(
      'RATE_LIMIT_APP_COMPATIBILITY_LIMIT',
    );
    const windowMs = this.configService.getOrThrow<number>(
      'RATE_LIMIT_APP_COMPATIBILITY_WINDOW_MS',
    );
    const now = Date.now();
    this.prune(now);
    const identifier = createHash('sha256')
      .update(request.ip ?? request.socket.remoteAddress ?? 'unknown')
      .digest('hex');
    const current = this.windows.get(identifier);
    const rateWindow =
      current === undefined || current.expiresAt <= now
        ? { count: 0, expiresAt: now + windowMs }
        : current;
    rateWindow.count += 1;
    this.windows.set(identifier, rateWindow);
    const allowed = rateWindow.count <= limit;
    this.logger.log(
      'AndroidAppCompatibilityRateLimitGuard -> canActivate -> classified:',
      { data: { allowed, limit, windowMs } },
    );
    if (!allowed) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((rateWindow.expiresAt - now) / 1_000))),
      );
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          details: {},
          message: 'Request rate limit exceeded.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private prune(now: number): void {
    for (const [identifier, rateWindow] of this.windows) {
      if (rateWindow.expiresAt <= now) this.windows.delete(identifier);
    }
    if (
      this.windows.size < AndroidAppCompatibilityRateLimitGuard.MAX_IDENTIFIERS
    )
      return;
    const oldest = this.windows.keys().next().value;
    if (oldest !== undefined) this.windows.delete(oldest);
  }
}
