import { createNativeSession, revokeNativeSession } from '~/auth/auth-service';
import { NativeSessionCoordinator } from '~/auth/native-session';
import { GoogleSignInAdapter } from '~/core/platform/native/google-sign-in-adapter';
import { NativeLocalDataAdapter } from '~/core/platform/native/local-data-adapter';
import { SecureCredentialAdapter } from '~/core/platform/native/secure-credential-adapter';

export async function createNativeSessionCoordinator(): Promise<NativeSessionCoordinator> {
  const clientId = import.meta.env.VITE_GOOGLE_SERVER_CLIENT_ID?.trim() ?? '';

  const coordinator = new NativeSessionCoordinator(
    new GoogleSignInAdapter(clientId),
    new SecureCredentialAdapter(),
    new NativeLocalDataAdapter(),
    {
      createSession: createNativeSession,
      revokeSession: revokeNativeSession,
    },
  );
  await coordinator.initialize();
  return coordinator;
}
