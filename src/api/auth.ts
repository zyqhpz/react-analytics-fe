import { API_BASE_URL, RESET_PASSWORD_ENDPOINT } from "./base";
import { authFetch } from "./client";
import {
  clearAuthSession,
  getSessionToken,
  handleUnauthorizedStatus,
  parseApiError,
  setSessionToken,
} from "./utils";

export interface LoginResponse {
  token: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ResetPasswordPayload {
  password: string;
  confirm_password: string;
}

export async function login({
  email,
  password,
}: LoginPayload): Promise<string> {
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
    throw new Error(await parseApiError(response, "Login failed"));
  }

  const data: LoginResponse = await response.json();

  const token = data.token;

  setSessionToken(token);

  return token;
}

export async function logout() {
  const token = getSessionToken();
  if (!token) {
    clearAuthSession();
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok && response.status !== 401) {
    throw new Error(await parseApiError(response, "Logout failed"));
  }

  clearAuthSession();
}

export async function resetPassword(payload: ResetPasswordPayload) {
  const token = getSessionToken();

  if (!token) {
    throw new Error("You need to log in before resetting your password.");
  }

  const response = await authFetch(
    `${API_BASE_URL}${RESET_PASSWORD_ENDPOINT}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  handleUnauthorizedStatus(response.status);

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Unable to reset password"));
  }
}
