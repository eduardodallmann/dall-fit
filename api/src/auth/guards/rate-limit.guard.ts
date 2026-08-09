import { createHash } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import {
  RATE_LIMIT_METADATA,
  type RateLimitPolicy,
} from '~/auth/decorators/rate-limited';
import type { AuthenticatedRequest } from '~/auth/domain/auth.types';
import { RateLimitService } from '~/redis/rate-limit.service';
import { RedisUnavailableError } from '~/redis/redis.errors';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy>(
      RATE_LIMIT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (policy === undefined) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request & AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    if (request.method === 'OPTIONS') {
      return true;
    }
    const limit = this.configService.getOrThrow<number>(policy.limitConfigKey);
    const windowMs = this.configService.getOrThrow<number>(
      policy.windowConfigKey,
    );
    const identifier = this.resolveIdentifier(request, policy);
    this.logger.log('RateLimitGuard -> canActivate -> params:', {
      params: {
        bucket: policy.bucket,
        limit,
        path: request.originalUrl,
        windowMs,
      },
    });
    let rateResult;
    try {
      rateResult = await this.rateLimitService.consume(
        policy.bucket,
        createHash('sha256').update(identifier).digest('hex'),
        limit,
        windowMs,
      );
    } catch (error: unknown) {
      if (error instanceof RedisUnavailableError) {
        throw new ServiceUnavailableException({
          code: 'RATE_LIMIT_UNAVAILABLE',
          details: {},
          message: 'Request protection is temporarily unavailable.',
        });
      }
      throw error;
    }
    this.logger.log(
      'RateLimitGuard -> canActivate -> rateLimitService return:',
      { data: { allowed: rateResult.allowed, bucket: policy.bucket } },
    );

    if (!rateResult.allowed) {
      response.setHeader('Retry-After', String(rateResult.retryAfterSeconds));
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          details: {},
          message: 'Request rate limit exceeded.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const result = true;
    this.logger.log('RateLimitGuard -> canActivate -> return:', {
      data: { allowed: result, bucket: policy.bucket },
    });

    return result;
  }

  private resolveIdentifier(
    request: Request & AuthenticatedRequest,
    policy: RateLimitPolicy,
  ): string {
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    if (policy.subject === 'person-ip') {
      if (request.currentPerson === undefined) {
        throw new Error('Person rate limit requires an authenticated person.');
      }
      return `${request.currentPerson.id}:${ip}`;
    }
    if (policy.subject === 'session-ip') {
      if (request.currentSession === undefined) {
        throw new Error(
          'Session rate limit requires an authenticated session.',
        );
      }
      return `${request.currentSession.jti}:${ip}`;
    }
    if (policy.subject === 'optional-session-ip') {
      return `${request.currentSession?.jti ?? 'anonymous'}:${ip}`;
    }

    return ip;
  }
}
