import type { PersonEntity } from '~/person/domain/person.entity';

export interface ExternalIdentity {
  googleSubject: string;
  name: string;
  email: string;
  photoUrl: string | null;
}

export interface AuthenticatedRequest {
  cookies?: Readonly<Record<string, string | undefined>>;
  currentPerson?: PersonEntity;
  currentSession?: VerifiedSession;
  ip?: string;
  method?: string;
  originalUrl?: string;
}

export interface SessionCookieResult {
  expiresAt: number;
  maxAgeMs: number;
  token: string;
}

export type SessionChannel = 'native' | 'web';

export interface VerifiedSession {
  channel: SessionChannel;
  csrfToken: string;
  expiresAt: number;
  jti: string;
  personId: string;
}

export interface CompleteLoginResult {
  redirectUrl: string;
  session: SessionCookieResult | null;
  succeeded: boolean;
}
