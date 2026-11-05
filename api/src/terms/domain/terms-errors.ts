import { HttpException, type Logger } from '@nestjs/common';

export function termsError(
  status: number,
  code: string,
  details: Record<string, unknown> = {},
): HttpException {
  const result = new HttpException(
    { code, message: 'The terms operation could not be completed.', details },
    status,
  );
  return result;
}

export function termsRejected(
  logger: Logger,
  owner: string,
  method: string,
  status: number,
  code: string,
  details: Record<string, unknown> = {},
): HttpException {
  logger.warn(`${owner} -> ${method} -> rejected branch:`, {
    data: { code, status },
  });
  return termsError(status, code, details);
}
