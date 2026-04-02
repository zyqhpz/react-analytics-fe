import { toast } from "sonner";

type Token = {
  value: string;
  expiry: number;
};

const TOKEN_STORAGE_KEY = "auth_token";
const CURRENT_USER_STORAGE_KEY = "current_user";

export type StoredCurrentUser = {
  id: string;
  name: string;
  email: string;
};

export function setWithExpiry(key: string, value: string, ttl: number) {
  const now = Date.now();

  // `item` is an object which contains the original value
  // as well as the time when it's supposed to expire
  const item: Token = {
    value: value,
    expiry: now + ttl,
  };
  sessionStorage.setItem(key, JSON.stringify(item));
}

export function getWithExpiry(key: string) {
  const itemStr = sessionStorage.getItem(key);

  if (!itemStr) return null;

  if (itemStr === "undefined") {
    sessionStorage.removeItem(key);
    return null;
  }

  if (itemStr === "null") {
    sessionStorage.removeItem(key);
    return null;
  }

  try {
    const item = JSON.parse(itemStr) as Token;

    const now = Date.now(); // local system time in ms

    if (now > item.expiry) {
      sessionStorage.removeItem(key);
      return null;
    }

    return item.value;
  } catch (err) {
    console.error("Invalid sessionStorage data for key:", key, err);
    toast.error("Invalid session storage data for key: " + key);
    sessionStorage.removeItem(key);
    return null;
  }
}

export function setSessionToken(token: string, ttl = 60 * 60 * 1000) {
  setWithExpiry(TOKEN_STORAGE_KEY, token, ttl);
}

export function getSessionToken() {
  return getWithExpiry(TOKEN_STORAGE_KEY);
}

export function clearSessionToken() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function setStoredCurrentUser(user: StoredCurrentUser) {
  sessionStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
}

export function getStoredCurrentUser(): StoredCurrentUser | null {
  const rawValue = sessionStorage.getItem(CURRENT_USER_STORAGE_KEY);
  if (!rawValue) return null;

  try {
    return JSON.parse(rawValue) as StoredCurrentUser;
  } catch (error) {
    console.error("Invalid sessionStorage data for current user:", error);
    sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    return null;
  }
}

export function clearStoredCurrentUser() {
  sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

export function clearAuthSession() {
  clearSessionToken();
  clearStoredCurrentUser();
}

export async function parseApiError(
  response: Response,
  fallbackMessage: string,
) {
  try {
    const data = (await response.json()) as {
      description?: string;
      error?: string;
      message?: string;
    };

    return data.description || data.error || data.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

let hasShownUnauthorizedAlert = false;

export function handleUnauthorizedStatus(status: number) {
  if (status !== 401 || hasShownUnauthorizedAlert) {
    return;
  }

  hasShownUnauthorizedAlert = true;
  clearAuthSession();
  toast.error("Your session has expired. Please log in again.");
}
