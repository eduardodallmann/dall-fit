export interface ApiError {
  code: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface ApiResponse<TData> {
  data: TData;
}

export interface CollectionResponse<TData> {
  data: readonly TData[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RequestContract<
  TBody = never,
  TParams = never,
  TQuery = never,
> {
  body: TBody;
  params: TParams;
  query: TQuery;
}
