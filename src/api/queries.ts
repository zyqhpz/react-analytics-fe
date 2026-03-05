import type { ResponseApiBase } from "./base";
import { getAuthHeaders } from "./client";

export interface Query {
    id: string;
    data?: QueryRow[];
    name: string;
    description: string;
    result_schema: string[];
}

export type QueryApiResponse = ResponseApiBase<Query | Query[]>;
export type QueryRow = Record<string, never>;

export const fetchSavedQueries = async () => {
    const res = await fetch("http://localhost:8080/api/v1/query", {
        headers: getAuthHeaders(),
    });

    const json: QueryApiResponse = await res.json();

    if (!res.ok) {
        throw new Error(json.description);
    }

    return json.data as Query[] || [];
};

export const fetchQueryWithData = async (queryId: string) => {
    const res = await fetch(`http://localhost:8080/api/v1/query/${queryId}/run`, {
        headers: getAuthHeaders(),
    });

    const json: QueryApiResponse = await res.json();

    if (!res.ok) {
        throw new Error(json.description);
    }

    return json.data as Query;
};
