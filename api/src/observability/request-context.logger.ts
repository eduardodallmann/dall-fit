import { ConsoleLogger, Inject, Injectable } from '@nestjs/common';

import {
  REQUEST_CONTEXT_STORAGE,
  type RequestContextStorage,
} from '~/observability/request-context';

@Injectable()
export class RequestContextLogger extends ConsoleLogger {
  constructor(
    @Inject(REQUEST_CONTEXT_STORAGE)
    private readonly storage: RequestContextStorage,
  ) {
    super();
  }

  override log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(message, ...this.addRequestId(optionalParams));
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message, ...this.addRequestId(optionalParams));
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(message, ...this.addRequestId(optionalParams));
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(message, ...this.addRequestId(optionalParams));
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(message, ...this.addRequestId(optionalParams));
  }

  override fatal(message: unknown, ...optionalParams: unknown[]): void {
    super.fatal(message, ...this.addRequestId(optionalParams));
  }

  private addRequestId(optionalParams: unknown[]): unknown[] {
    const requestId = this.storage.getStore()?.requestId;
    if (requestId === undefined) {
      return optionalParams;
    }

    const result = [...optionalParams];
    const metadataIndex = result.findIndex((value) =>
      this.isStructuredMetadata(value),
    );

    if (metadataIndex >= 0) {
      result[metadataIndex] = {
        ...(result[metadataIndex] as Record<string, unknown>),
        requestId,
      };
      return result;
    }

    const trailingStringCount = [...result]
      .reverse()
      .findIndex((value) => typeof value !== 'string');
    const insertionIndex =
      trailingStringCount === -1 ? 0 : result.length - trailingStringCount;
    result.splice(insertionIndex, 0, { requestId });

    return result;
  }

  private isStructuredMetadata(
    value: unknown,
  ): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const prototype: unknown = Object.getPrototypeOf(value);
    const result = prototype === Object.prototype || prototype === null;

    return result;
  }
}
