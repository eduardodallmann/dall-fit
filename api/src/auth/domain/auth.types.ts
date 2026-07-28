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
  originalUrl?: string;
}

export interface SessionCookieResult {
  maxAgeMs: number;
  token: string;
}

export interface CompleteLoginResult {
  redirectUrl: string;
  session: SessionCookieResult | null;
  succeeded: boolean;
}
