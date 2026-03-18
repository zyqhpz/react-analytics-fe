import { API_BASE_URL } from "./base";
import { handleUnauthorizedStatus, setWithExpiry } from "./utils";

export interface LoginResponse {
    token: string;
}

export async function login(email: string, password: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            email,
            password,
        }),
    });

    handleUnauthorizedStatus(response.status);

    if (!response.ok) {
        throw new Error("Login failed");
    }

    const data: LoginResponse = await response.json();

    const token = data.token;

    setWithExpiry("token", token, 60 * 60 * 1000);

    return token;
}
