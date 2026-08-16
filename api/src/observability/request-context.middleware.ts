import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  type NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import {
  CLIENT_INSTANCE_ID_HEADER,
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
    const clientInstanceId = this.resolveClientInstanceId(request.rawHeaders);
    response.setHeader(REQUEST_ID_HEADER, requestId);

    this.storage.run({ clientInstanceId, requestId }, () => {
      this.logger.log('RequestContextMiddleware -> use -> params:', {
        params: {
          incomingRequestIdAccepted:
            requestId === request.get(REQUEST_ID_HEADER),
          clientInstanceIdAccepted: clientInstanceId !== undefined,
        },
      });
      this.logger.log('RequestContextMiddleware -> use -> completed:', {
        data: { requestContextCreated: true },
      });
      next();
    });
  }

  private resolveClientInstanceId(rawHeaders: string[]): string | undefined {
    this.logger.log(
      'RequestContextMiddleware -> resolveClientInstanceId -> params:',
      { params: { headerCount: rawHeaders.length / 2 } },
    );
    const values: string[] = [];
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === CLIENT_INSTANCE_ID_HEADER) {
        const value = rawHeaders[index + 1];
        if (value !== undefined) values.push(value);
      }
    }
    const candidate = values.length === 1 ? values[0] : undefined;
    const result =
      candidate !== undefined &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        candidate,
      )
        ? candidate
        : undefined;
    this.logger.log(
      'RequestContextMiddleware -> resolveClientInstanceId -> return:',
      { data: { accepted: result !== undefined } },
    );
    return result;
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
