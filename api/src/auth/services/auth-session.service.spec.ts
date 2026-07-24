import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionService } from '~/auth/services/auth-session.service';

describe('AuthSessionService', () => {
  const configService = {
    getOrThrow: vi.fn().mockReturnValue(600),
  };
  const jwtService = {
    signAsync: vi.fn(),
    verifyAsync: vi.fn(),
  };
  let service: AuthSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    configService.getOrThrow.mockReturnValue(600);
    service = new AuthSessionService(
      configService as unknown as ConfigService,
      jwtService as unknown as JwtService,
    );
  });

  it('creates an expiring session containing only the person subject', async () => {
    jwtService.signAsync.mockResolvedValue('signed-session');

    const result = await service.createSession('person-001');

    expect(result).toEqual({
      maxAgeMs: 600_000,
      token: 'signed-session',
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {},
      {
        algorithm: 'HS256',
        expiresIn: 600,
        subject: 'person-001',
      },
    );
  });

  it('returns the verified person subject', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'person-001' });

    await expect(service.verifySession('signed-session')).resolves.toBe(
      'person-001',
    );
  });

  it('rejects a token without a subject', async () => {
    jwtService.verifyAsync.mockResolvedValue({});

    await expect(service.verifySession('signed-session')).rejects.toThrow(
      'Session subject is missing.',
    );
  });
});
