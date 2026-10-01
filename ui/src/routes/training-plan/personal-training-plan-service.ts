import type {
  ActivatePersonalTrainingPlanResponse,
  CreateGlobalTrainingPlanReferenceResponse,
  CreatePersonalTrainingPlanResponse,
  CreateTrainingPlanCloneJobRequest,
  CreateTrainingPlanRequest,
  GlobalTrainingPlanLibraryResponse,
  PersonalTrainingPlanCollectionResponse,
  PersonalTrainingPlanDetails,
  PersonalTrainingPlanDetailsResponse,
  PersonalTrainingPlanListItem,
  TrainingPlanCloneJobResponse,
  TrainingPlanSummary,
  UpdateTrainingPlanRequest,
  UpdateTrainingPlanResponse,
} from '@dall-fit/types';

import { apiClient } from '~/core/http/api-client';
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';

const resourceVersionHeader = 'X-Resource-Version';

function requestConfig(
  scenario: MockTrainingPlansScenario,
  signal?: AbortSignal,
) {
  const headers =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
      ? { 'x-dall-fit-mock-training-plans': scenario }
      : undefined;
  return { headers, signal };
}

function mutationConfig(scenario: MockTrainingPlansScenario, version: number) {
  const base = requestConfig(scenario);
  return {
    ...base,
    headers: { ...base.headers, [resourceVersionHeader]: String(version) },
  };
}

function responseVersion(headers: Record<string, unknown>): number {
  const value = headers['x-resource-version'];
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value))
    throw new Error('API response has an invalid resource version.');
  return Number(value);
}

export async function listPersonalTrainingPlans(
  page: number,
  scenario: MockTrainingPlansScenario,
  signal?: AbortSignal,
): Promise<PersonalTrainingPlanCollectionResponse> {
  const response = await apiClient.get<PersonalTrainingPlanCollectionResponse>(
    '/training-plans',
    { ...requestConfig(scenario, signal), params: { page } },
  );
  return response.data;
}

export async function listGlobalTrainingPlanLibrary(
  page: number,
  scenario: MockTrainingPlansScenario,
  signal?: AbortSignal,
): Promise<GlobalTrainingPlanLibraryResponse> {
  const response = await apiClient.get<GlobalTrainingPlanLibraryResponse>(
    '/training-plans/library',
    { ...requestConfig(scenario, signal), params: { page } },
  );
  return response.data;
}

export async function getPersonalTrainingPlan(
  catalogEntryId: string,
  scenario: MockTrainingPlansScenario,
  signal?: AbortSignal,
): Promise<PersonalTrainingPlanDetails> {
  const response = await apiClient.get<PersonalTrainingPlanDetailsResponse>(
    `/training-plans/${catalogEntryId}`,
    requestConfig(scenario, signal),
  );
  return response.data.data;
}

export async function createPersonalTrainingPlan(
  input: CreateTrainingPlanRequest,
  scenario: MockTrainingPlansScenario,
): Promise<PersonalTrainingPlanListItem> {
  const response = await apiClient.post<CreatePersonalTrainingPlanResponse>(
    '/training-plans',
    input,
    requestConfig(scenario),
  );
  return response.data.data;
}

export async function updatePersonalTrainingPlan(
  catalogEntryId: string,
  changes: UpdateTrainingPlanRequest,
  version: number,
  scenario: MockTrainingPlansScenario,
): Promise<TrainingPlanSummary> {
  const response = await apiClient.patch<UpdateTrainingPlanResponse>(
    `/training-plans/${catalogEntryId}`,
    changes,
    mutationConfig(scenario, version),
  );
  return { ...response.data.data, version: responseVersion(response.headers) };
}

export async function deletePersonalTrainingPlan(
  catalogEntryId: string,
  version: number | undefined,
  scenario: MockTrainingPlansScenario,
): Promise<void> {
  await apiClient.delete(
    `/training-plans/${catalogEntryId}`,
    version === undefined
      ? requestConfig(scenario)
      : mutationConfig(scenario, version),
  );
}

export async function activatePersonalTrainingPlan(
  catalogEntryId: string,
  active: boolean,
  scenario: MockTrainingPlansScenario,
): Promise<readonly string[]> {
  const response = await apiClient.put<ActivatePersonalTrainingPlanResponse>(
    '/training-plans/active',
    { active, catalogEntryId },
    requestConfig(scenario),
  );
  return response.data.data.activeCatalogEntryIds;
}

export async function createGlobalTrainingPlanReference(
  globalTrainingPlanId: string,
  scenario: MockTrainingPlansScenario,
): Promise<PersonalTrainingPlanListItem> {
  const response =
    await apiClient.post<CreateGlobalTrainingPlanReferenceResponse>(
      '/training-plans/global-references',
      { globalTrainingPlanId },
      requestConfig(scenario),
    );
  return response.data.data;
}

export async function startTrainingPlanClone(
  globalTrainingPlanId: string,
  scenario: MockTrainingPlansScenario,
): Promise<PersonalTrainingPlanListItem> {
  const input: CreateTrainingPlanCloneJobRequest = { globalTrainingPlanId };
  const response = await apiClient.post<TrainingPlanCloneJobResponse>(
    '/training-plan-clone-jobs',
    input,
    requestConfig(scenario),
  );
  return response.data.data;
}

export async function retryTrainingPlanClone(
  cloneJobId: string,
  scenario: MockTrainingPlansScenario,
): Promise<PersonalTrainingPlanListItem> {
  const response = await apiClient.post<TrainingPlanCloneJobResponse>(
    `/training-plan-clone-jobs/${cloneJobId}/retry`,
    {},
    requestConfig(scenario),
  );
  return response.data.data;
}

export async function cancelTrainingPlanClone(
  cloneJobId: string,
  scenario: MockTrainingPlansScenario,
): Promise<PersonalTrainingPlanListItem> {
  const response = await apiClient.delete<TrainingPlanCloneJobResponse>(
    `/training-plan-clone-jobs/${cloneJobId}`,
    requestConfig(scenario),
  );
  return response.data.data;
}
