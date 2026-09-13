import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type {
  SessionChannel,
  SessionCookieResult,
  VerifiedSession,
} from '~/auth/domain/auth.types';
import { InvalidSessionError } from '~/auth/errors/invalid-session.error';
import { SessionStoreService } from '~/redis/session-store.service';

interface SessionPayload {
  aud?: string | string[];
  exp?: number;
  iat?: number;
  iss?: string;
  jti?: string;
  sub?: string;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);
  private readonly activeKeyId: string;
  private readonly activeSecret: string;
  private readonly audiences: Readonly<Record<SessionChannel, string>>;
  private readonly issuer: string;
  private readonly previousKeyId?: string;
  private readonly previousSecret?: string;
  private readonly previousValidUntil?: Date;
  private readonly ttlSeconds: number;

  constructor(
    configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly sessionStoreService: SessionStoreService,
  ) {
    this.ttlSeconds = configService.getOrThrow<number>(
      'AUTH_SESSION_TTL_SECONDS',
    );
    this.activeKeyId = configService.getOrThrow<string>(
      'AUTH_SESSION_ACTIVE_KEY_ID',
    );
    this.activeSecret = configService.getOrThrow<string>('AUTH_SESSION_SECRET');
    this.audiences = {
      native: configService.getOrThrow<string>('AUTH_NATIVE_SESSION_AUDIENCE'),
      web: configService.getOrThrow<string>('AUTH_SESSION_AUDIENCE'),
    };
    this.issuer = configService.getOrThrow<string>('AUTH_SESSION_ISSUER');
    this.previousKeyId = configService.get<string>(
      'AUTH_SESSION_PREVIOUS_KEY_ID',
    );
    this.previousSecret = configService.get<string>(
      'AUTH_SESSION_PREVIOUS_SECRET',
    );
    this.previousValidUntil = configService.get<Date>(
      'AUTH_SESSION_PREVIOUS_VALID_UNTIL',
    );
  }

  async createSession(
    personId: string,
    channel: SessionChannel,
  ): Promise<SessionCookieResult> {
    this.logger.log('AuthSessionService -> createSession -> params:', {
      params: { channel, personId },
    });
    const jti = randomUUID();
    const csrfToken = randomBytes(32).toString('base64url');
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + this.ttlSeconds;
    const token = await this.jwtService.signAsync(
      { exp: expiresAt, iat: issuedAt },
      {
        algorithm: 'HS256',
        audience: this.audiences[channel],
        issuer: this.issuer,
        jwtid: jti,
        keyid: this.activeKeyId,
        secret: this.activeSecret,
        subject: personId,
      },
    );
    this.logger.log(
      'AuthSessionService -> createSession -> jwtService return:',
      { data: { tokenCreated: token.length > 0 } },
    );

    await this.sessionStoreService.create(jti, {
      channel,
      csrfToken,
      expiresAt,
      personId,
    });
    this.logger.log(
      'AuthSessionService -> createSession -> sessionStoreService completed:',
      { data: { personId } },
    );

    const result = {
      expiresAt,
      maxAgeMs: this.ttlSeconds * 1000,
      token,
    };
    this.logger.log('AuthSessionService -> createSession -> return:', {
      data: { maxAgeMs: result.maxAgeMs, tokenCreated: true },
    });

    return result;
  }

  async verifySession(
    token: string,
    expectedChannel: SessionChannel,
  ): Promise<VerifiedSession> {
    this.logger.log('AuthSessionService -> verifySession -> params:', {
      params: { expectedChannel, tokenPresent: token.length > 0 },
    });

    let payload: SessionPayload;
    try {
      const header = parseJwtHeader(token);
      const secret = this.resolveSecret(header);
      payload = await this.jwtService.verifyAsync<SessionPayload>(token, {
        algorithms: ['HS256'],
        audience: this.audiences[expectedChannel],
        issuer: this.issuer,
        secret,
      });
    } catch (error: unknown) {
      if (error instanceof InvalidSessionError) {
        throw error;
      }
      throw new InvalidSessionError();
    }

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      typeof payload.jti !== 'string' ||
      payload.jti.length === 0 ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      throw new InvalidSessionError();
    }
    this.logger.log(
      'AuthSessionService -> verifySession -> jwtService return:',
      {
        data: { claimsValidated: true, personId: payload.sub },
      },
    );

    const storedSession = await this.sessionStoreService.find(payload.jti);
    this.logger.log(
      'AuthSessionService -> verifySession -> sessionStoreService return:',
      { data: { found: storedSession !== null } },
    );
    if (
      storedSession === null ||
      storedSession.channel !== expectedChannel ||
      storedSession.personId !== payload.sub ||
      storedSession.expiresAt !== payload.exp ||
      storedSession.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      throw new InvalidSessionError();
    }

    const result = {
      channel: storedSession.channel,
      csrfToken: storedSession.csrfToken,
      expiresAt: storedSession.expiresAt,
      jti: payload.jti,
      personId: storedSession.personId,
    };
    this.logger.log('AuthSessionService -> verifySession -> return:', {
      data: { personId: result.personId, sessionActive: true },
    });

    return result;
  }

  async revokeSession(jti: string): Promise<void> {
    this.logger.log('AuthSessionService -> revokeSession -> params:', {
      params: { sessionIdentifierPresent: jti.length > 0 },
    });
    await this.sessionStoreService.delete(jti);
    this.logger.log('AuthSessionService -> revokeSession -> completed:', {
      data: { revoked: true },
    });
  }

  private resolveSecret(header: JwtHeader): string {
    this.logger.log('AuthSessionService -> resolveSecret -> params:', {
      params: {
        algorithm: header.alg,
        keyIdPresent: typeof header.kid === 'string',
      },
    });
    if (header.alg !== 'HS256' || typeof header.kid !== 'string') {
      throw new InvalidSessionError();
    }

    if (header.kid === this.activeKeyId) {
      const result = this.activeSecret;
      this.logger.log(
        'AuthSessionService -> resolveSecret -> activeKey branch:',
        {
          data: { keyAccepted: true },
        },
      );
      return result;
    }

    if (
      header.kid === this.previousKeyId &&
      this.previousSecret !== undefined &&
      this.previousValidUntil !== undefined &&
      this.previousValidUntil.getTime() >= Date.now()
    ) {
      const result = this.previousSecret;
      this.logger.log(
        'AuthSessionService -> resolveSecret -> previousKey branch:',
        {
          data: { keyAccepted: true },
        },
      );
      return result;
    }

    throw new InvalidSessionError();
  }
}

function parseJwtHeader(token: string): JwtHeader {
  const encodedHeader = token.split('.')[0];
  if (encodedHeader === undefined || encodedHeader.length === 0) {
    throw new InvalidSessionError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8'),
    );
  } catch {
    throw new InvalidSessionError();
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvalidSessionError();
  }

  const result: JwtHeader = {
    ...('alg' in parsed && typeof parsed.alg === 'string'
      ? { alg: parsed.alg }
      : {}),
    ...('kid' in parsed && typeof parsed.kid === 'string'
      ? { kid: parsed.kid }
      : {}),
  };

  return result;
}
