export async function echoWorkflowStep(value: string): Promise<string> {
  'use step';

  const result = await Promise.resolve(value);

  return result;
}

export async function workflowSpike(value: string): Promise<string> {
  'use workflow';

  const result = await echoWorkflowStep(value);

  return result;
}
