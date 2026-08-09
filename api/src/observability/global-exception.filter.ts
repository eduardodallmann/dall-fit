import { randomUUID } from 'node:crypto';

import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import type { ApiError } from '@dall-fit/types';

import {
  REQUEST_CONTEXT_STORAGE,
  type RequestContextStorage,
} from '~/observability/request-context';
import { RedisUnavailableError } from '~/redis/redis.errors';

interface StructuredHttpError {
  code: string;
  details: Record<string, unknown>;
  message: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @Inject(REQUEST_CONTEXT_STORAGE)
    private readonly storage: RequestContextStorage,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<unknown>();
    const response = context.getResponse<unknown>();
    const requestId = this.storage.getStore()?.requestId ?? randomUUID();
    const status = this.resolveStatus(exception);
    const body = this.resolveBody(exception, status, requestId);

    httpAdapter.setHeader(response, 'x-request-id', requestId);

    if (
      !(exception instanceof HttpException) &&
      !(exception instanceof RedisUnavailableError)
    ) {
      this.logger.error('GlobalExceptionFilter -> catch -> unexpectedError:', {
        data: {
          errorName:
            exception instanceof Error ? exception.name : 'UnknownError',
          method: this.readRequestValue(request, 'method'),
          path: this.resolvePath(request),
        },
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    httpAdapter.reply(response, body, status);
  }

  private resolveStatus(exception: unknown): HttpStatus {
    const result =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    return result;
  }

  private resolveBody(
    exception: unknown,
    status: HttpStatus,
    requestId: string,
  ): ApiError {
    if (exception instanceof HttpException) {
      const structuredError = this.readStructuredError(exception.getResponse());
      if (structuredError !== undefined) {
        const result = { ...structuredError, requestId };
        return result;
      }
    }

    const fallback = this.resolveFallback(status);
    const result = { ...fallback, details: {}, requestId };

    return result;
  }

  private readStructuredError(
    value: string | object,
  ): StructuredHttpError | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.code !== 'string' ||
      candidate.code.length === 0 ||
      typeof candidate.message !== 'string' ||
      candidate.message.length === 0 ||
      !this.isSimpleObject(candidate.details)
    ) {
      return undefined;
    }

    const result = {
      code: candidate.code,
      details: candidate.details,
      message: candidate.message,
    };

    return result;
  }

  private isSimpleObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const prototype: unknown = Object.getPrototypeOf(value);
    const result = prototype === Object.prototype || prototype === null;

    return result;
  }

  private resolveFallback(
    status: HttpStatus,
  ): Omit<ApiError, 'details' | 'requestId'> {
    if (status === HttpStatus.NOT_FOUND) {
      return {
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
      };
    }

    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      return {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is temporarily unavailable.',
      };
    }

    if (status !== HttpStatus.INTERNAL_SERVER_ERROR) {
      return {
        code: 'HTTP_ERROR',
        message: 'The request could not be completed.',
      };
    }

    return {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    };
  }

  private resolvePath(request: unknown): string {
    const rawPath =
      this.readRequestValue(request, 'originalUrl') ??
      this.readRequestValue(request, 'url') ??
      '/';
    const result = rawPath.split('?')[0]?.slice(0, 2048) || '/';

    return result;
  }

  private readRequestValue(request: unknown, key: string): string | undefined {
    if (
      typeof request !== 'object' ||
      request === null ||
      Array.isArray(request)
    ) {
      return undefined;
    }

    const value = (request as Record<string, unknown>)[key];
    const result = typeof value === 'string' ? value : undefined;

    return result;
  }
}
