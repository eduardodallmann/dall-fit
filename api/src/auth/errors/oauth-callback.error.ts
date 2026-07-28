export class OAuthCallbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = OAuthCallbackError.name;
  }
}
