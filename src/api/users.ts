import type { CurrentUser } from "@/types/user";
import { API_BASE_URL } from "./base";
import { getAuthHeaders } from "./client";

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

    const json: CurrentUserResponse = await res.json();

    if (!res.ok) {
        throw new Error(json.description || "Failed to load current user");
    }

    return json.data;
};
