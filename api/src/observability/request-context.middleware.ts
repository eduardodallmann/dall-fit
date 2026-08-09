import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  type NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import {
  REQUEST_CONTEXT_STORAGE,
  type RequestContextStorage,
} from '~/observability/request-context';

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestContextMiddleware.name);

  constructor(
    @Inject(REQUEST_CONTEXT_STORAGE)
    private readonly storage: RequestContextStorage,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = this.resolveRequestId(request.rawHeaders);
    response.setHeader(REQUEST_ID_HEADER, requestId);

    this.storage.run({ requestId }, () => {
      this.logger.log('RequestContextMiddleware -> use -> params:', {
        params: {
          incomingRequestIdAccepted:
            requestId === request.get(REQUEST_ID_HEADER),
        },
      });
      this.logger.log('RequestContextMiddleware -> use -> completed:', {
        data: { requestContextCreated: true },
      });
      next();
    });
  }

  private resolveRequestId(rawHeaders: string[]): string {
    const values: string[] = [];

    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === REQUEST_ID_HEADER) {
        const value = rawHeaders[index + 1];
        if (value !== undefined) {
          values.push(value);
        }
      }
    }

    const incomingRequestId = values.length === 1 ? values[0] : undefined;
    const result =
      incomingRequestId !== undefined &&
      REQUEST_ID_PATTERN.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();

    return result;
  }
}
