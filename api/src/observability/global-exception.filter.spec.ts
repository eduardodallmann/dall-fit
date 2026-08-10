import { AsyncLocalStorage } from 'node:async_hooks';

import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GlobalExceptionFilter } from '~/observability/global-exception.filter';
import type { RequestContext } from '~/observability/request-context';
import { RedisUnavailableError } from '~/redis/redis.errors';

describe('GlobalExceptionFilter', () => {
  const reply = vi.fn();
  const setHeader = vi.fn();
  const httpAdapterHost = {
    httpAdapter: { reply, setHeader },
  } as unknown as HttpAdapterHost;
  const response = {};
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        originalUrl: '/failure?secret=hidden',
      }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  const storage = new AsyncLocalStorage<RequestContext>();
  const filter = new GlobalExceptionFilter(httpAdapterHost, storage);

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('preserves a valid structured HTTP error and injects requestId', () => {
    const exception = new BadRequestException({
      code: 'VALIDATION_ERROR',
      details: { field: 'theme' },
      ignored: 'not-public',
      message: 'Request validation failed.',
    });

    storage.run({ requestId: 'request-structured' }, () => {
      filter.catch(exception, host);
    });

    expect(reply).toHaveBeenCalledWith(
      response,
      {
        code: 'VALIDATION_ERROR',
        details: { field: 'theme' },
        message: 'Request validation failed.',
        requestId: 'request-structured',
      },
      400,
    );
  });

  it.each([
    [
      new NotFoundException(),
      404,
      'RESOURCE_NOT_FOUND',
      'The requested resource was not found.',
    ],
    [
      new ServiceUnavailableException(),
      503,
      'SERVICE_UNAVAILABLE',
      'The service is temporarily unavailable.',
    ],
    [
      new ForbiddenException(),
      403,
      'HTTP_ERROR',
      'The request could not be completed.',
    ],
  ])(
    'normalizes an unstructured HTTP exception',
    (exception, status, code, message) => {
      storage.run({ requestId: 'request-http' }, () => {
        filter.catch(exception, host);
      });

      expect(reply).toHaveBeenCalledWith(
        response,
        { code, details: {}, message, requestId: 'request-http' },
        status,
      );
    },
  );

  it('normalizes and logs an unexpected error once without query params', () => {
    const loggerSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const exception = new Error('database secret');

    storage.run({ requestId: 'request-unexpected' }, () => {
      filter.catch(exception, host);
    });

    expect(loggerSpy).toHaveBeenCalledOnce();
    expect(loggerSpy.mock.calls[0]?.[0]).toBe(
      'GlobalExceptionFilter -> catch -> unexpectedError:',
    );
    const loggedMetadata: unknown = loggerSpy.mock.calls[0]?.[1];
    expect(loggedMetadata).toMatchObject({
      data: { method: 'GET', path: '/failure' },
    });
    expect(reply).toHaveBeenCalledWith(
      response,
      {
        code: 'INTERNAL_SERVER_ERROR',
        details: {},
        message: 'An unexpected error occurred.',
        requestId: 'request-unexpected',
      },
      500,
    );
  });

  it('does not duplicate the Redis technical error log', () => {
    const loggerSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    filter.catch(new RedisUnavailableError(), host);

    expect(loggerSpy).not.toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith(
      response,
      'x-request-id',
      expect.any(String),
    );
  });
});
