import { AsyncLocalStorage } from 'node:async_hooks';

import { ConsoleLogger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RequestContext } from '~/observability/request-context';
import { RequestContextLogger } from '~/observability/request-context.logger';

describe('RequestContextLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const)(
    'adds requestId to %s structured metadata',
    (level) => {
      const storage = new AsyncLocalStorage<RequestContext>();
      const logger = new RequestContextLogger(storage);
      const logSpy = vi
        .spyOn(ConsoleLogger.prototype, level)
        .mockImplementation(() => undefined);

      storage.run({ requestId: 'request-001' }, () => {
        logger[level]('message', { data: { safe: true } }, 'Context');
      });

      expect(logSpy).toHaveBeenCalledWith(
        'message',
        { data: { safe: true }, requestId: 'request-001' },
        'Context',
      );
    },
  );

  it('inserts metadata before stack and context strings', () => {
    const storage = new AsyncLocalStorage<RequestContext>();
    const logger = new RequestContextLogger(storage);
    const errorSpy = vi
      .spyOn(ConsoleLogger.prototype, 'error')
      .mockImplementation(() => undefined);

    storage.run({ requestId: 'request-002' }, () => {
      logger.error('message', 'stack', 'Context');
    });

    expect(errorSpy).toHaveBeenCalledWith(
      'message',
      { requestId: 'request-002' },
      'stack',
      'Context',
    );
  });

  it('keeps bootstrap logs unchanged outside a request context', () => {
    const storage = new AsyncLocalStorage<RequestContext>();
    const logger = new RequestContextLogger(storage);
    const logSpy = vi
      .spyOn(ConsoleLogger.prototype, 'log')
      .mockImplementation(() => undefined);

    logger.log('bootstrap', { data: { ready: true } });

    expect(logSpy).toHaveBeenCalledWith('bootstrap', { data: { ready: true } });
  });
});
