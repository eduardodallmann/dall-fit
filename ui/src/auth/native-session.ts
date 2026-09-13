import type { CreateNativeSessionResponse, Person } from '@dall-fit/types';

import { endSession } from '~/auth/session-lifecycle';

export const NATIVE_SESSION_ENVELOPE_VERSION = 1;

export interface NativeSessionEnvelope {
  accessToken: string;
  expiresAt: string;
  personId: string;
  version: typeof NATIVE_SESSION_ENVELOPE_VERSION;
}

export interface NativeGoogleSignInPort {
  signIn(): Promise<{ idToken: string }>;
  signOut(): Promise<void>;
}

export interface NativeCredentialPort {
  clearAccount(): Promise<void>;
  clearEnvelope(): Promise<void>;
  getAccountPersonId(): Promise<string | undefined>;
  getInstallationId(): Promise<string>;
  readEnvelope(): Promise<NativeSessionEnvelope | undefined>;
  writeAccountPersonId(personId: string): Promise<void>;
  writeEnvelope(envelope: NativeSessionEnvelope): Promise<void>;
}

export interface NativeLocalDataPort {
  clearAccountDataAtomically(): Promise<void>;
  hasPendingChanges(): Promise<boolean>;
}

export interface NativeSessionApiPort {
  createSession(identityToken: string): Promise<CreateNativeSessionResponse>;
  revokeSession(accessToken: string): Promise<void>;
}

export type NativeLoginResult =
  { status: 'cancelled' } | { person: Person; status: 'authenticated' };

export class NativeSignInCancelledError extends Error {
  constructor() {
    super('Native sign-in was cancelled.');
    this.name = 'NativeSignInCancelledError';
  }
}

export class NativeSessionCoordinator {
  private readonly api: NativeSessionApiPort;
  private readonly credentials: NativeCredentialPort;
  private envelope: NativeSessionEnvelope | undefined;
  private readonly google: NativeGoogleSignInPort;
  private initialized = false;
  private readonly localData: NativeLocalDataPort;
  private loginPromise: Promise<NativeLoginResult> | undefined;
  private logoutPromise: Promise<void> | undefined;
  private readonly now: () => number;

  constructor(
    google: NativeGoogleSignInPort,
    credentials: NativeCredentialPort,
    localData: NativeLocalDataPort,
    api: NativeSessionApiPort,
    now: () => number = Date.now,
  ) {
    this.google = google;
    this.credentials = credentials;
    this.localData = localData;
    this.api = api;
    this.now = now;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.credentials.getInstallationId();
    const envelope = await this.credentials.readEnvelope();
    if (envelope === undefined) return;
    const accountPersonId = await this.credentials.getAccountPersonId();
    if (accountPersonId !== envelope.personId) {
      await this.credentials.clearEnvelope();
      return;
    }
    if (this.isExpired(envelope)) {
      await this.credentials.clearEnvelope();
      return;
    }
    this.envelope = envelope;
  }

  async getAccessToken(): Promise<string | undefined> {
    await this.initialize();
    if (this.envelope === undefined) return undefined;
    if (!this.isExpired(this.envelope)) return this.envelope.accessToken;
    await this.expireSession();
    return undefined;
  }

  login(): Promise<NativeLoginResult> {
    if (this.loginPromise !== undefined) return this.loginPromise;
    this.loginPromise = this.performLogin().finally(() => {
      this.loginPromise = undefined;
    });
    return this.loginPromise;
  }

  async hasPendingChanges(): Promise<boolean> {
    const result = await this.localData.hasPendingChanges();

    return result;
  }

  logout(): Promise<void> {
    if (this.logoutPromise !== undefined) return this.logoutPromise;
    this.logoutPromise = this.performLogout().finally(() => {
      this.logoutPromise = undefined;
    });
    return this.logoutPromise;
  }

  async expireSession(): Promise<void> {
    const hadEnvelope = this.envelope !== undefined;
    this.envelope = undefined;
    await this.credentials.clearEnvelope().catch(() => undefined);
    if (hadEnvelope) await endSession('expired');
  }

  private async performLogin(): Promise<NativeLoginResult> {
    let identityToken: string | undefined;
    let createdSession: CreateNativeSessionResponse['data'] | undefined;
    try {
      const signInResult = await this.google.signIn();
      identityToken = signInResult.idToken;
      const response = await this.api.createSession(identityToken);
      createdSession = response.data;
      if (!isNativeSessionResponseData(createdSession))
        throw new Error('Invalid native session response.');

      const previousEnvelope = this.envelope;
      const previousPersonId = await this.credentials.getAccountPersonId();
      let previousAccountCleared = false;
      if (
        previousPersonId === undefined ||
        previousPersonId !== createdSession.person.id
      ) {
        if (previousPersonId !== undefined)
          await endSession('identity_changed');
        await this.localData.clearAccountDataAtomically();
        await this.credentials.clearAccount();
        this.envelope = undefined;
        previousAccountCleared = true;
      }

      const envelope: NativeSessionEnvelope = {
        accessToken: createdSession.accessToken,
        expiresAt: createdSession.expiresAt,
        personId: createdSession.person.id,
        version: NATIVE_SESSION_ENVELOPE_VERSION,
      };
      try {
        await this.credentials.writeEnvelope(envelope);
        await this.credentials.writeAccountPersonId(createdSession.person.id);
      } catch (error: unknown) {
        if (previousEnvelope === undefined || previousAccountCleared) {
          await this.credentials.clearEnvelope().catch(() => undefined);
        } else {
          await this.credentials
            .writeEnvelope(previousEnvelope)
            .catch(() => undefined);
        }
        throw error;
      }
      this.envelope = envelope;

      if (
        previousEnvelope !== undefined &&
        previousEnvelope.accessToken !== envelope.accessToken
      )
        await this.api
          .revokeSession(previousEnvelope.accessToken)
          .catch(() => undefined);

      return { person: createdSession.person, status: 'authenticated' };
    } catch (error: unknown) {
      if (createdSession !== undefined)
        await this.api
          .revokeSession(createdSession.accessToken)
          .catch(() => undefined);
      if (error instanceof NativeSignInCancelledError)
        return { status: 'cancelled' };
      throw error;
    } finally {
      identityToken = undefined;
    }
  }

  private async performLogout(): Promise<void> {
    const accessToken = this.envelope?.accessToken;
    this.envelope = undefined;
    await endSession('logout');
    const localResults = await Promise.allSettled([
      this.localData.clearAccountDataAtomically(),
      this.credentials.clearAccount(),
    ]);
    const remoteTasks: Promise<unknown>[] = [this.google.signOut()];
    if (accessToken !== undefined)
      remoteTasks.push(this.api.revokeSession(accessToken));
    await Promise.allSettled(remoteTasks);
    const failedLocalOperation = localResults.find(
      (result) => result.status === 'rejected',
    );
    if (failedLocalOperation?.status === 'rejected')
      throw failedLocalOperation.reason instanceof Error
        ? failedLocalOperation.reason
        : new Error('Native local logout failed.');
  }

  private isExpired(envelope: NativeSessionEnvelope): boolean {
    const expiresAt = Date.parse(envelope.expiresAt);
    return !Number.isFinite(expiresAt) || expiresAt <= this.now();
  }
}

function isNativeSessionResponseData(
  value: CreateNativeSessionResponse['data'],
): boolean {
  return (
    value.tokenType === 'Bearer' &&
    typeof value.accessToken === 'string' &&
    value.accessToken.length > 0 &&
    typeof value.expiresAt === 'string' &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    typeof value.person === 'object' &&
    value.person !== null &&
    typeof value.person.id === 'string' &&
    value.person.id.length > 0
  );
}
