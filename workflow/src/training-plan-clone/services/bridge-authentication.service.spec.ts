import { createHash, createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BridgeAuthenticationService } from './bridge-authentication.service';

const secret = 'workflow-test-secret-with-at-least-32-characters';
const now = new Date('2026-08-21T12:00:00.000Z');
const body = JSON.stringify({
  cloneJobId: '64b000000000000000000001',
  generation: 1,
});

function signature(payload: string, timestamp: string): string {
  const bodyHash = createHash('sha256').update(payload).digest('hex');
  const canonical = [
    'POST',
    '/internal/training-plan-clone-runs',
    timestamp,
    bodyHash,
  ].join('\n');
  return `sha256=${createHmac('sha256', secret).update(canonical).digest('hex')}`;
}

describe('BridgeAuthenticationService', () => {
  beforeEach(() => {
    process.env.WORKFLOW_HMAC_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.WORKFLOW_HMAC_SECRET;
  });

  it('accepts only the exact signed v1 envelope', () => {
    const timestamp = String(now.getTime());
    const result = new BridgeAuthenticationService().authenticate({
      body,
      method: 'POST',
      now,
      pathname: '/internal/training-plan-clone-runs',
      signature: signature(body, timestamp),
      timestamp,
      version: '1',
    });

    expect(result).toEqual({
      cloneJobId: '64b000000000000000000001',
      generation: 1,
    });
  });

  it.each([
    ['version', { version: '2' }],
    ['timestamp', { timestamp: String(now.getTime() - 301_000) }],
    ['signature', { signature: 'sha256=invalid' }],
    ['body', { body: '{"cloneJobId":"bad","generation":1}' }],
  ] as const)('rejects an invalid %s', (code, override) => {
    const timestamp = String(now.getTime());
    const inputBody = 'body' in override ? override.body : body;
    const input = {
      body: inputBody,
      method: 'POST',
      now,
      pathname: '/internal/training-plan-clone-runs',
      signature: signature(inputBody, timestamp),
      timestamp,
      version: '1',
      ...override,
    };

    expect(() => new BridgeAuthenticationService().authenticate(input)).toThrow(
      expect.objectContaining({ code }),
    );
  });
});
