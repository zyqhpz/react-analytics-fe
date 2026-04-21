import type { FullSchema, Query } from "@/types/query";
import { API_BASE_URL, type ResponseApiBase } from "./base";
import { authFetch } from "./client";
import { isSuperUserRole } from "./users";
import { handleUnauthorizedStatus } from "./utils";

export type QueryApiResponse = ResponseApiBase<Query | Query[]>;
export type GetSchemasResponse = ResponseApiBase<FullSchema>;
type RequestOptions = Pick<RequestInit, "signal">;

export const fetchSavedQueries = async (roleName?: string | null) => {
  const endpoint = isSuperUserRole(roleName)
    ? "/api/v1/query/admin"
    : "/api/v1/query";
  const res = await authFetch(`${API_BASE_URL}${endpoint}`);

  handleUnauthorizedStatus(res.status);

  const json: QueryApiResponse = await res.json();

  if (!res.ok) {
    throw new Error(json.description);
  }

  return (json.data as Query[]) || [];
};

export const fetchQueryWithData = async (
  queryId: string,
  options: RequestOptions = {},
) => {
  const res = await authFetch(
    `${API_BASE_URL}/api/v1/query/${queryId}/run`,
    options,
  );

  handleUnauthorizedStatus(res.status);

  const json: QueryApiResponse = await res.json();

  if (!res.ok) {
    throw new Error(json.description);
  }

  return json.data as Query;
};

export const deleteSavedQuery = async (queryId: string) => {
  const res = await authFetch(`${API_BASE_URL}/api/v1/query/${queryId}`, {
    method: "DELETE",
  });

  handleUnauthorizedStatus(res.status);

  const json: QueryApiResponse = await res.json();

  if (!res.ok) {
    throw new Error(json.description);
  }

  return json.data;
};
