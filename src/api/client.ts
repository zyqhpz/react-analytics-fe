import { login } from "./auth";

export function getAuthHeaders() {
    const token = localStorage.getItem("token");

    const email = import.meta.env.VITE_USER_EMAIL;
    const password = import.meta.env.VITE_USER_PASSWORD;

    if (!token) {
        login(email, password);
    }

    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
}