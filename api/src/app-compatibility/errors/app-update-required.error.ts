import type { AppUpdateRequiredDetails } from '@dall-fit/types';

export class AppUpdateRequiredError extends Error {
  constructor(readonly details: AppUpdateRequiredDetails) {
    super('The Android application must be updated before continuing.');
    this.name = 'AppUpdateRequiredError';
  }
}
