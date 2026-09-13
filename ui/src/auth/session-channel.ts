export type SessionChannel = 'native' | 'web';

interface NativeSessionTransport {
  getAccessToken: () => Promise<string | undefined>;
  handleUnauthorized: () => Promise<void>;
}

let channel: SessionChannel = 'web';
let nativeTransport: NativeSessionTransport | undefined;

export function configureSessionChannel(
  nextChannel: SessionChannel,
  transport?: NativeSessionTransport,
): void {
  channel = nextChannel;
  nativeTransport = nextChannel === 'native' ? transport : undefined;
}

export function getSessionChannel(): SessionChannel {
  return channel;
}

export async function getNativeAccessToken(): Promise<string | undefined> {
  const result = await nativeTransport?.getAccessToken();

  return result;
}

export async function handleNativeUnauthorized(): Promise<void> {
  await nativeTransport?.handleUnauthorized();
}

export function resetSessionChannelForTests(): void {
  channel = 'web';
  nativeTransport = undefined;
}
