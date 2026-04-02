/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { login as loginRequest, logout as logoutRequest } from "@/api/auth";
import { fetchCurrentUser } from "@/api/users";
import { clearSelectedDashboardId } from "@/api/dashboard";
import {
  clearAuthSession,
  getSessionToken,
  getStoredCurrentUser,
  setStoredCurrentUser,
} from "@/api/utils";
import type { CurrentUser } from "@/types/user";

type AuthContextValue = {
  currentUser: CurrentUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshCurrentUser: () => Promise<CurrentUser | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const refreshCurrentUser = async () => {
    const token = getSessionToken();
    if (!token) {
      setCurrentUser(null);
      clearSelectedDashboardId();
      clearAuthSession();
      return null;
    }

    try {
      const user = await fetchCurrentUser();
      setCurrentUser(user);
      setStoredCurrentUser({
        id: user.id,
        name: user.name,
        email: user.email,
      });
      return user;
    } catch (error) {
      clearSelectedDashboardId();
      clearAuthSession();
      setCurrentUser(null);
      throw error;
    }
  };

  useEffect(() => {
    const storedUser = getStoredCurrentUser();
    if (storedUser) {
      setCurrentUser(
        (prev) =>
          prev ?? {
            id: storedUser.id,
            name: storedUser.name,
            email: storedUser.email,
            is_active: true,
            department_id: "",
            department: {
              id: "",
              name: "",
              slug: "",
              settings: {},
              created_at: "",
              updated_at: "",
            },
            role: {
              id: "",
              name: "",
              description: "",
              department_id: "",
              permissions: {},
              created_at: "",
            },
            created_at: "",
            updated_at: "",
            last_login_at: "",
          },
      );
    }

    if (!getSessionToken()) {
      setIsInitializing(false);
      return;
    }

    void refreshCurrentUser().finally(() => {
      setIsInitializing(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    await loginRequest({ email, password });
    await refreshCurrentUser();
  };

  const logout = async () => {
    try {
      await logoutRequest();
    } finally {
      clearSelectedDashboardId();
      clearAuthSession();
      setCurrentUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: Boolean(getSessionToken()),
        isInitializing,
        login,
        logout,
        refreshCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
