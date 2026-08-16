import { AsyncLocalStorage } from 'node:async_hooks';

import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { GlobalExceptionFilter } from '~/observability/global-exception.filter';
import {
  REQUEST_CONTEXT_STORAGE,
  type RequestContext,
} from '~/observability/request-context';
import { RequestContextLogger } from '~/observability/request-context.logger';
import { RequestContextMiddleware } from '~/observability/request-context.middleware';

@Global()
@Module({
  providers: [
    {
      provide: REQUEST_CONTEXT_STORAGE,
      useFactory: () => new AsyncLocalStorage<RequestContext>(),
    },
    RequestContextLogger,
    RequestContextMiddleware,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
  exports: [
    REQUEST_CONTEXT_STORAGE,
    RequestContextLogger,
    RequestContextMiddleware,
  ],
})
export class ObservabilityModule {}
