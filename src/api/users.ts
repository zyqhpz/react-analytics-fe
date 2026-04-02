import type { CurrentUser } from "@/types/user";
import { API_BASE_URL } from "./base";
import { getAuthHeaders } from "./client";
import { handleUnauthorizedStatus, parseApiError } from "./utils";

type CurrentUserResponse = {
    response_code: number;
    description: string;
    data: CurrentUser;
    token?: string;
};

export const fetchCurrentUser = async () => {
    const res = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
        headers: getAuthHeaders(),
    });

    handleUnauthorizedStatus(res.status);

    if (!res.ok) {
        throw new Error(await parseApiError(res, "Failed to load current user"));
    }

    const json: CurrentUserResponse = await res.json();

    return json.data;
};
