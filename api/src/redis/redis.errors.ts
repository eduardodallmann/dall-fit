export class RedisUnavailableError extends Error {
  constructor() {
    super('Redis operation is unavailable.');
    this.name = RedisUnavailableError.name;
  }
}
