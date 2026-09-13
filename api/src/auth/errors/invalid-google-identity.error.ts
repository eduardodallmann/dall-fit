export class InvalidGoogleIdentityError extends Error {
  constructor() {
    super('Google identity is invalid.');
    this.name = InvalidGoogleIdentityError.name;
  }
}
