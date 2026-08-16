import { AsyncLocalStorage } from 'node:async_hooks';

import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { RequestContext } from '~/observability/request-context';
import { RequestContextMiddleware } from '~/observability/request-context.middleware';

describe('RequestContextMiddleware', () => {
  it.each([
    ['absent', [], false],
    ['malformed', ['x-request-id', 'invalid request id'], false],
    ['too long', ['x-request-id', `a${'b'.repeat(128)}`], false],
    [
      'repeated',
      ['x-request-id', 'first-id', 'X-Request-Id', 'second-id'],
      false,
    ],
    ['valid', ['X-Request-Id', 'client:id-001'], true],
  ])('resolves an %s request ID', (_scenario, rawHeaders, acceptsIncoming) => {
    const storage = new AsyncLocalStorage<RequestContext>();
    const middleware = new RequestContextMiddleware(storage);
    const setHeader = vi.fn();
    let contextualRequestId: string | undefined;
    const next = vi.fn(() => {
      contextualRequestId = storage.getStore()?.requestId;
    });
    const incoming = rawHeaders[1];

    middleware.use(
      {
        get: vi.fn().mockReturnValue(incoming),
        rawHeaders,
      } as unknown as Request,
      { setHeader } as unknown as Response,
      next as NextFunction,
    );

    const requestId = setHeader.mock.calls[0]?.[1] as string;
    expect(requestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
    expect(requestId === incoming).toBe(acceptsIncoming);
    expect(contextualRequestId).toBe(requestId);
    expect(next).toHaveBeenCalledOnce();
  });

  it('isolates concurrent asynchronous request contexts', async () => {
    const storage = new AsyncLocalStorage<RequestContext>();
    const middleware = new RequestContextMiddleware(storage);
    const observed = new Map<string, string | undefined>();

    await Promise.all(
      ['request-a', 'request-b'].map(
        (incomingRequestId) =>
          new Promise<void>((resolve) => {
            middleware.use(
              {
                get: vi.fn().mockReturnValue(incomingRequestId),
                rawHeaders: ['x-request-id', incomingRequestId],
              } as unknown as Request,
              { setHeader: vi.fn() } as unknown as Response,
              (() => {
                setImmediate(() => {
                  observed.set(
                    incomingRequestId,
                    storage.getStore()?.requestId,
                  );
                  resolve();
                });
              }) as NextFunction,
            );
          }),
      ),
    );

    expect(observed).toEqual(
      new Map([
        ['request-a', 'request-a'],
        ['request-b', 'request-b'],
      ]),
    );
  });

  it('accepts one valid document UUID without reflecting it in the response', () => {
    const storage = new AsyncLocalStorage<RequestContext>();
    const middleware = new RequestContextMiddleware(storage);
    const setHeader = vi.fn();
    let clientInstanceId: string | undefined;

    middleware.use(
      {
        get: vi.fn(),
        rawHeaders: [
          'x-client-instance-id',
          '123e4567-e89b-42d3-a456-426614174000',
        ],
      } as unknown as Request,
      { setHeader } as unknown as Response,
      (() => {
        clientInstanceId = storage.getStore()?.clientInstanceId;
      }) as NextFunction,
    );

    expect(clientInstanceId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(setHeader).not.toHaveBeenCalledWith(
      'x-client-instance-id',
      expect.anything(),
    );
  });
});
