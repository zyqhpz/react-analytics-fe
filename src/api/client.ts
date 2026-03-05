import { login } from "./auth";
import { getWithExpiry } from "./utils";
export function getAuthHeaders() {
    let token = getWithExpiry("token");

    if (!token) {
        const email = import.meta.env.VITE_USER_EMAIL;
        const password = import.meta.env.VITE_USER_PASSWORD;
        login(email, password);
    }

    token = getWithExpiry("token");

    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
}
