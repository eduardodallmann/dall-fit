import { ErrorCode, GoogleSignIn } from '@capawesome/capacitor-google-sign-in';

import {
  NativeSignInCancelledError,
  type NativeGoogleSignInPort,
} from '~/auth/native-session';

interface PluginError {
  code?: unknown;
}

interface GoogleSignInPluginLike {
  initialize(options: { clientId: string }): Promise<void>;
  signIn(): Promise<{ idToken: string }>;
  signOut(): Promise<void>;
}

export class GoogleSignInAdapter implements NativeGoogleSignInPort {
  private readonly clientId: string;
  private initialization: Promise<void> | undefined;
  private readonly plugin: GoogleSignInPluginLike;

  constructor(clientId: string, plugin: GoogleSignInPluginLike = GoogleSignIn) {
    this.clientId = clientId;
    this.plugin = plugin;
  }

  async signIn(): Promise<{ idToken: string }> {
    await this.initialize();
    try {
      const response = await this.plugin.signIn();
      const result = { idToken: response.idToken };

      return result;
    } catch (error: unknown) {
      if ((error as PluginError)?.code === ErrorCode.SignInCanceled)
        throw new NativeSignInCancelledError();
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await this.initialize();
    await this.plugin.signOut();
  }

  private initialize(): Promise<void> {
    this.initialization ??= this.plugin.initialize({
      clientId: this.clientId,
    });
    return this.initialization;
  }
}
