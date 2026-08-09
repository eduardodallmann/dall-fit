import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidSessionError } from '~/auth/errors/invalid-session.error';
import { AuthSessionService } from '~/auth/services/auth-session.service';
import type {
  SessionStoreService,
  StoredSession,
} from '~/redis/session-store.service';

describe('AuthSessionService', () => {
  const values: Record<string, unknown> = {
    AUTH_SESSION_ACTIVE_KEY_ID: 'active-v1',
    AUTH_SESSION_AUDIENCE: 'dall-fit-ui',
    AUTH_SESSION_ISSUER: 'dall-fit-api',
    AUTH_SESSION_SECRET: 'a'.repeat(32),
    AUTH_SESSION_TTL_SECONDS: 600,
  };
  const configService = {
    get: vi.fn((key: string) => values[key]),
    getOrThrow: vi.fn((key: string) => values[key]),
  };
  const jwtService = {
    signAsync: vi.fn(),
    verifyAsync: vi.fn(),
  };
  const sessionStoreService = {
    create: vi.fn(),
    delete: vi.fn(),
    find: vi.fn(),
  };
  let service: AuthSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthSessionService(
      configService as unknown as ConfigService,
      jwtService as unknown as JwtService,
      sessionStoreService as unknown as SessionStoreService,
    );
  });

  it('creates a keyed JWT only after preparing a revocable Redis session', async () => {
    jwtService.signAsync.mockResolvedValue('signed-session');

    const result = await service.createSession('person-001');

    expect(result).toEqual({ maxAgeMs: 600_000, token: 'signed-session' });
    expect(jwtService.signAsync).toHaveBeenCalledOnce();
    const signCall = jwtService.signAsync.mock.calls[0] as unknown as [
      { exp: number; iat: number },
      Record<string, unknown>,
    ];
    expect(signCall[0].exp - signCall[0].iat).toBe(600);
    expect(signCall[1]).toMatchObject({
      algorithm: 'HS256',
      audience: 'dall-fit-ui',
      issuer: 'dall-fit-api',
      keyid: 'active-v1',
      secret: 'a'.repeat(32),
      subject: 'person-001',
    });
    expect(sessionStoreService.create).toHaveBeenCalledOnce();
    const createCall = sessionStoreService.create.mock.calls[0] as unknown as [
      string,
      StoredSession,
    ];
    expect(createCall[0]).toEqual(expect.any(String));
    expect(typeof createCall[1].csrfToken).toBe('string');
    expect(createCall[1].personId).toBe('person-001');
    expect(createCall[1].expiresAt).toBe(signCall[0].exp);
  });

  it('returns the verified active Redis session', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    jwtService.verifyAsync.mockResolvedValue({
      exp: expiresAt,
      iat: expiresAt - 300,
      jti: 'session-001',
      sub: 'person-001',
    });
    sessionStoreService.find.mockResolvedValue({
      csrfToken: 'csrf-token',
      expiresAt,
      personId: 'person-001',
    });

    await expect(
      service.verifySession(createToken('active-v1')),
    ).resolves.toEqual({
      csrfToken: 'csrf-token',
      expiresAt,
      jti: 'session-001',
      personId: 'person-001',
    });
  });

  it('rejects a token with an unknown key id', async () => {
    await expect(
      service.verifySession(createToken('unknown')),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });
});

function createToken(keyId: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', kid: keyId }),
  ).toString('base64url');
  const result = `${header}.payload.signature`;

  return result;
}
