import { HttpException, HttpStatus } from '@nestjs/common';

export function createDashboardTimezoneInvalidException(): HttpException {
  const result = new HttpException(
    {
      code: 'DASHBOARD_TIMEZONE_INVALID',
      details: {},
      message: 'The supplied dashboard timezone is invalid.',
    },
    HttpStatus.BAD_REQUEST,
  );
  return result;
}
