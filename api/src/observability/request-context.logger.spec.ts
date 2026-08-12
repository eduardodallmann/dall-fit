import { AsyncLocalStorage } from 'node:async_hooks';

import { ConsoleLogger, LOG_LEVELS, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RequestContext } from '~/observability/request-context';
import { RequestContextLogger } from '~/observability/request-context.logger';

describe('RequestContextLogger', () => {
  function createLogger(
    storage: AsyncLocalStorage<RequestContext>,
    logLevel: LogLevel = 'verbose',
  ): RequestContextLogger {
    const configService = new ConfigService({ LOG_LEVEL: logLevel });
    const result = new RequestContextLogger(storage, configService);

    return result;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const)(
    'adds requestId to %s structured metadata',
    (level) => {
      const storage = new AsyncLocalStorage<RequestContext>();
      const logger = createLogger(storage);
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
    const logger = createLogger(storage);
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
    const logger = createLogger(storage);
    const logSpy = vi
      .spyOn(ConsoleLogger.prototype, 'log')
      .mockImplementation(() => undefined);

    logger.log('bootstrap', { data: { ready: true } });

    expect(logSpy).toHaveBeenCalledWith('bootstrap', { data: { ready: true } });
  });

  it.each(LOG_LEVELS)(
    'uses %s as a cascading minimum log level',
    (configuredLevel) => {
      const storage = new AsyncLocalStorage<RequestContext>();
      const logger = createLogger(storage, configuredLevel);
      const configuredLevelIndex = LOG_LEVELS.indexOf(configuredLevel);

      for (const [levelIndex, level] of LOG_LEVELS.entries()) {
        expect(logger.isLevelEnabled(level)).toBe(
          levelIndex >= configuredLevelIndex,
        );
      }
    },
  );

  it('does not write levels below the configured threshold', () => {
    const storage = new AsyncLocalStorage<RequestContext>();
    const logger = createLogger(storage, 'warn');
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    logger.log('suppressed log');
    logger.warn('visible warning');
    logger.error('visible error');

    const output = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls]
      .map(([value]) => String(value))
      .join('\n');

    expect(output).not.toContain('suppressed log');
    expect(output).toContain('visible warning');
    expect(output).toContain('visible error');
  });
});
