import { SecureStorage } from '@aparajita/capacitor-secure-storage';

import {
  NATIVE_SESSION_ENVELOPE_VERSION,
  type NativeCredentialPort,
  type NativeSessionEnvelope,
} from '~/auth/native-session';

const STORAGE_PREFIX = 'dall-fit-native_';
const ENVELOPE_KEY = 'session-envelope';
const INSTALLATION_ID_KEY = 'installation-id';
const PERSON_ID_KEY = 'person-id';
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SecureStorageLike {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
  setKeyPrefix(prefix: string): Promise<void>;
}

export class SecureCredentialAdapter implements NativeCredentialPort {
  private readonly createUuid: () => string;
  private initialization: Promise<void> | undefined;
  private readonly storage: SecureStorageLike;

  constructor(
    storage: SecureStorageLike = SecureStorage,
    createUuid: () => string = () => crypto.randomUUID(),
  ) {
    this.storage = storage;
    this.createUuid = createUuid;
  }

  async clearAccount(): Promise<void> {
    await this.initialize();
    await Promise.all([
      this.storage.removeItem(ENVELOPE_KEY),
      this.storage.removeItem(PERSON_ID_KEY),
    ]);
  }

  async clearEnvelope(): Promise<void> {
    await this.initialize();
    await this.storage.removeItem(ENVELOPE_KEY);
  }

  async getAccountPersonId(): Promise<string | undefined> {
    await this.initialize();
    const value = await this.storage.getItem(PERSON_ID_KEY);
    const result = value === null || value.length === 0 ? undefined : value;

    return result;
  }

  async getInstallationId(): Promise<string> {
    await this.initialize();
    const stored = await this.storage
      .getItem(INSTALLATION_ID_KEY)
      .catch(() => null);
    if (stored !== null && UUID_V4_PATTERN.test(stored)) return stored;
    const result = this.createUuid();
    if (!UUID_V4_PATTERN.test(result))
      throw new Error(
        'The installation identifier source did not return UUID v4.',
      );
    await this.storage.setItem(INSTALLATION_ID_KEY, result);
    return result;
  }

  async readEnvelope(): Promise<NativeSessionEnvelope | undefined> {
    await this.initialize();
    try {
      const serialized = await this.storage.getItem(ENVELOPE_KEY);
      if (serialized === null) return undefined;
      const parsed: unknown = JSON.parse(serialized);
      if (!isNativeSessionEnvelope(parsed))
        throw new Error('Invalid envelope.');
      return parsed;
    } catch {
      await this.storage.removeItem(ENVELOPE_KEY).catch(() => undefined);
      return undefined;
    }
  }

  async writeAccountPersonId(personId: string): Promise<void> {
    await this.initialize();
    await this.storage.setItem(PERSON_ID_KEY, personId);
  }

  async writeEnvelope(envelope: NativeSessionEnvelope): Promise<void> {
    await this.initialize();
    await this.storage.setItem(ENVELOPE_KEY, JSON.stringify(envelope));
  }

  private initialize(): Promise<void> {
    this.initialization ??= this.storage.setKeyPrefix(STORAGE_PREFIX);
    return this.initialization;
  }
}

function isNativeSessionEnvelope(
  value: unknown,
): value is NativeSessionEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 4 &&
    'version' in value &&
    value.version === NATIVE_SESSION_ENVELOPE_VERSION &&
    'accessToken' in value &&
    typeof value.accessToken === 'string' &&
    value.accessToken.length > 0 &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'string' &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    'personId' in value &&
    typeof value.personId === 'string' &&
    value.personId.length > 0
  );
}
