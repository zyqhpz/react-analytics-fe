import { getSessionToken } from "./utils";

export function getAuthHeaders() {
  const token = getSessionToken();

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}
