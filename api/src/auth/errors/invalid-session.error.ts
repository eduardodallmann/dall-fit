export class InvalidSessionError extends Error {
  constructor() {
    super('Session is invalid.');
    this.name = InvalidSessionError.name;
  }
}
