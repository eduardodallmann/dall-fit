import { HttpException, HttpStatus } from '@nestjs/common';

import {
  OfflineTrainingLeaseTakeoverRequiredError,
  OfflineTrainingLeaseUnavailableError,
} from '~/training/errors/offline-training-lease.errors';

export function activeTrainingPlanNotFoundException(): HttpException {
  const result = new HttpException(
    {
      code: 'ACTIVE_TRAINING_PLAN_NOT_FOUND',
      details: {},
      message: 'No active training plan was found.',
    },
    HttpStatus.NOT_FOUND,
  );
  return result;
}

export function mapOfflineTrainingLeaseHttpError(error: unknown): never {
  if (error instanceof OfflineTrainingLeaseTakeoverRequiredError) {
    throw new HttpException(
      {
        code: 'OFFLINE_LEASE_TAKEOVER_REQUIRED',
        details: {},
        message: 'Another installation owns the offline training lease.',
      },
      HttpStatus.CONFLICT,
    );
  }
  if (error instanceof OfflineTrainingLeaseUnavailableError) {
    throw new HttpException(
      {
        code: 'OFFLINE_LEASE_UNAVAILABLE',
        details: {},
        message: 'Offline training authorization is temporarily unavailable.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
  throw error;
}
