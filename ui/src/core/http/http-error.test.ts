import axios from 'axios';
import { describe, expect, it } from 'vitest';

import {
  classifyHttpFailure,
  isAmbiguousMutationFailure,
  shouldRetryQuery,
} from '~/core/http/http-error';

function responseError(status: number, code = 'HTTP_ERROR') {
  return new axios.AxiosError(
    'Request failed',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      config: { headers: new axios.AxiosHeaders() },
      data: { code },
      headers: {},
      status,
      statusText: 'Error',
    },
  );
}

describe('HTTP failure policy', () => {
  it('classifies cancellation before timeout, network and HTTP failures', () => {
    expect(classifyHttpFailure(new axios.CanceledError())).toEqual({
      kind: 'cancelled',
    });
    expect(
      classifyHttpFailure(new DOMException('Session ended.', 'AbortError')),
    ).toEqual({ kind: 'cancelled' });
    expect(
      classifyHttpFailure(new axios.AxiosError('timeout', 'ETIMEDOUT')),
    ).toEqual({ kind: 'timeout' });
    expect(
      classifyHttpFailure(new axios.AxiosError('network', 'ERR_NETWORK')),
    ).toEqual({ kind: 'network' });
    expect(
      classifyHttpFailure(responseError(403, 'ADMIN_ACCESS_REQUIRED')),
    ).toEqual({
      code: 'ADMIN_ACCESS_REQUIRED',
      kind: 'http',
      status: 403,
    });
  });

  it('retries one time only for the explicit transient read allowlist', () => {
    const transient = [
      new axios.AxiosError('timeout', 'ETIMEDOUT'),
      new axios.AxiosError('network', 'ERR_NETWORK'),
      ...[408, 500, 502, 503, 504].map((status) => responseError(status)),
    ];
    for (const error of transient) {
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(1, error)).toBe(false);
    }
    for (const status of [400, 401, 403, 404, 409, 412, 422, 428, 429, 501])
      expect(shouldRetryQuery(0, responseError(status))).toBe(false);
    expect(shouldRetryQuery(0, new axios.CanceledError())).toBe(false);
  });

  it('marks only failures without a known mutation response as ambiguous', () => {
    expect(
      isAmbiguousMutationFailure(new axios.AxiosError('timeout', 'ETIMEDOUT')),
    ).toBe(true);
    expect(
      isAmbiguousMutationFailure(
        new axios.AxiosError('network', 'ERR_NETWORK'),
      ),
    ).toBe(true);
    expect(isAmbiguousMutationFailure(responseError(503))).toBe(false);
    expect(isAmbiguousMutationFailure(new axios.CanceledError())).toBe(false);
  });
});
