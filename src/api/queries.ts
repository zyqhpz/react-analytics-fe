import type { FullSchema, Query } from "@/types/query";
import { API_BASE_URL, type ResponseApiBase } from "./base";
import { getAuthHeaders } from "./client";
import { handleUnauthorizedStatus } from "./utils";

export type QueryApiResponse = ResponseApiBase<Query | Query[]>;
export type GetSchemasResponse = ResponseApiBase<FullSchema>;

export const fetchSavedQueries = async () => {
    const res = await fetch(`${API_BASE_URL}/api/v1/query`, {
        headers: getAuthHeaders(),
    });

    handleUnauthorizedStatus(res.status);

    const json: QueryApiResponse = await res.json();

    if (!res.ok) {
        throw new Error(json.description);
    }

    return (json.data as Query[]) || [];
};

export const fetchQueryWithData = async (queryId: string) => {
    const res = await fetch(`${API_BASE_URL}/api/v1/query/${queryId}/run`, {
        headers: getAuthHeaders(),
    });

    handleUnauthorizedStatus(res.status);

    const json: QueryApiResponse = await res.json();

    if (!res.ok) {
        throw new Error(json.description);
    }

    return json.data as Query;
};

export const deleteSavedQuery = async (queryId: string) => {
    const res = await fetch(`${API_BASE_URL}/api/v1/query/${queryId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });

    handleUnauthorizedStatus(res.status);

    const json: QueryApiResponse = await res.json();

    if (!res.ok) {
        throw new Error(json.description);
    }

    return json.data;
};
