import { describe, expect, it } from 'vitest';
import { start } from 'workflow/api';

describe('workflowSpike', () => {
  it('executes a transformed workflow and step in the local runtime', async () => {
    const run = await start(
      {
        workflowId: 'workflow//./workflows/workflow-spike//workflowSpike',
      },
      ['clone-job-spike'],
    );
    const result = await run.returnValue;

    expect(result).toBe('clone-job-spike');
    expect(run.runId).toMatch(/^wrun_/u);
  });
});
