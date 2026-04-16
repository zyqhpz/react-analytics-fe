import type { ResponseApiBase } from "./base";
import { getSessionToken, setSessionToken } from "./utils";

export function getAuthHeaders() {
  const token = getSessionToken();

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const token = getSessionToken();
  const headers = new Headers(init.headers);

  headers.set(
    "Content-Type",
    headers.get("Content-Type") ?? "application/json",
  );
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.ok) {
    try {
      const data = (await response.clone().json()) as ResponseApiBase<unknown>;

      if (typeof data.token === "string" && data.token.trim()) {
        setSessionToken(data.token);
      }
    } catch {
      // Ignore non-JSON responses or responses without a token payload.
    }
  }

  return response;
}
