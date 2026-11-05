import type {
  AcceptedTerms,
  AcceptTermsRequest,
  ApiResponse,
  CollectionResponse,
  CreateTermsRequest,
  CurrentTerms,
  PublishTermsRequest,
  TermsAcceptance,
  TermsDocument,
  TermsFields,
  TermsList,
  TermsPublication,
} from '@dall-fit/types';

import { apiClient } from '~/core/http/api-client';
import { termsMockHeaders } from '~/core/terms/queries';

export async function readCurrentTerms(
  signal?: AbortSignal,
): Promise<CurrentTerms> {
  const response = await apiClient.get<ApiResponse<CurrentTerms>>(
    '/terms/current',
    { signal, headers: termsMockHeaders() },
  );
  return response.data.data;
}
export async function readTermsVersion(
  id: string,
  signal?: AbortSignal,
): Promise<TermsPublication> {
  const response = await apiClient.get<ApiResponse<TermsPublication>>(
    `/terms/versions/${id}`,
    { signal, headers: termsMockHeaders() },
  );
  return response.data.data;
}
export async function readTermsHistory(
  page: number,
  signal?: AbortSignal,
): Promise<CollectionResponse<TermsAcceptance>> {
  const response = await apiClient.get<CollectionResponse<TermsAcceptance>>(
    '/terms/acceptances',
    { signal, params: { page }, headers: termsMockHeaders() },
  );
  return response.data;
}
export async function acceptTerms(
  input: AcceptTermsRequest,
): Promise<AcceptedTerms> {
  const response = await apiClient.post<ApiResponse<AcceptedTerms>>(
    '/terms/acceptances',
    input,
    { headers: termsMockHeaders() },
  );
  return response.data.data;
}
export async function listTerms(
  page: number,
  signal?: AbortSignal,
): Promise<TermsList> {
  const response = await apiClient.get<TermsList>('/admin/terms', {
    signal,
    params: { page },
    headers: termsMockHeaders(),
  });
  return response.data;
}
export async function readTermsDraft(
  id: string,
  signal?: AbortSignal,
): Promise<TermsDocument> {
  const response = await apiClient.get<ApiResponse<TermsDocument>>(
    `/admin/terms/${id}`,
    { signal, headers: termsMockHeaders() },
  );
  return response.data.data;
}
export async function createTerms(
  input: CreateTermsRequest,
): Promise<TermsDocument> {
  const response = await apiClient.post<ApiResponse<TermsDocument>>(
    '/admin/terms',
    input,
    { headers: termsMockHeaders() },
  );
  return response.data.data;
}
export async function saveTerms(
  doc: TermsDocument,
  input: TermsFields,
): Promise<TermsDocument> {
  const response = await apiClient.patch<ApiResponse<TermsDocument>>(
    `/admin/terms/${doc.id}`,
    input,
    { headers: { ...termsMockHeaders(), 'X-Resource-Version': doc.version } },
  );
  return response.data.data;
}
export async function previewTerms(doc: TermsDocument): Promise<TermsDocument> {
  const response = await apiClient.post<ApiResponse<TermsDocument>>(
    `/admin/terms/${doc.id}/preview`,
    {},
    { headers: { ...termsMockHeaders(), 'X-Resource-Version': doc.version } },
  );
  return response.data.data;
}
export async function publishTerms(
  doc: TermsDocument,
  input: PublishTermsRequest,
): Promise<TermsDocument> {
  const response = await apiClient.post<ApiResponse<TermsDocument>>(
    `/admin/terms/${doc.id}/publish`,
    input,
    { headers: { ...termsMockHeaders(), 'X-Resource-Version': doc.version } },
  );
  return response.data.data;
}
export async function deleteTerms(doc: TermsDocument): Promise<void> {
  await apiClient.delete(`/admin/terms/${doc.id}`, {
    headers: { ...termsMockHeaders(), 'X-Resource-Version': doc.version },
  });
}
