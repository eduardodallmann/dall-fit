import type { Logger } from '@nestjs/common';

export function termsLog(
  logger: Logger,
  owner: string,
  method: string,
  step: string,
  data: Record<string, unknown> = {},
): void {
  logger.log(`${owner} -> ${method} -> ${step}:`, { data });
}
