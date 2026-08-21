import { describe, expect, it } from 'vitest';

import { echoWorkflowStep } from './workflow-spike';

describe('echoWorkflowStep', () => {
  it('returns the provided technical value', async () => {
    const result = await echoWorkflowStep('clone-job-spike');

    expect(result).toBe('clone-job-spike');
  });
});
