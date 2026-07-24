import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { SessionCookieResult } from '~/auth/domain/auth.types';

interface SessionPayload {
  sub: string;
}

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);
  private readonly ttlSeconds: number;

  constructor(
    configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.ttlSeconds = configService.getOrThrow<number>(
      'AUTH_SESSION_TTL_SECONDS',
    );
  }

  async createSession(personId: string): Promise<SessionCookieResult> {
    this.logger.log('AuthSessionService -> createSession -> params:', {
      params: { personId },
    });

    const token = await this.jwtService.signAsync(
      {},
      {
        algorithm: 'HS256',
        expiresIn: this.ttlSeconds,
        subject: personId,
      },
    );

    this.logger.log(
      'AuthSessionService -> createSession -> jwtService return:',
      { data: { tokenCreated: token.length > 0 } },
    );

    const result = {
      maxAgeMs: this.ttlSeconds * 1000,
      token,
    };

    this.logger.log('AuthSessionService -> createSession -> return:', {
      data: { maxAgeMs: result.maxAgeMs, tokenCreated: true },
    });

    return result;
  }

  async verifySession(token: string): Promise<string> {
    this.logger.log('AuthSessionService -> verifySession -> params:', {
      params: { tokenPresent: token.length > 0 },
    });

    const payload = await this.jwtService.verifyAsync<SessionPayload>(token, {
      algorithms: ['HS256'],
    });
    this.logger.log(
      'AuthSessionService -> verifySession -> jwtService return:',
      { data: { subjectPresent: typeof payload.sub === 'string' } },
    );

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('Session subject is missing.');
    }

    const result = payload.sub;
    this.logger.log('AuthSessionService -> verifySession -> return:', {
      data: { personId: result },
    });

    return result;
  }
}
