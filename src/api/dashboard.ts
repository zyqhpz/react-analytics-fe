import type { DashboardSummary } from "@/types/dashboard";
import { API_BASE_URL } from "./base";
import { getAuthHeaders } from "./client";
import { handleUnauthorizedStatus } from "./utils";

const SELECTED_DASHBOARD_STORAGE_KEY = "selected_dashboard_id";

type DashboardListResponse = {
  data?: DashboardSummary[];
  description?: string;
};

type DashboardMutationPayload = {
  name: string;
  description: string;
};

type CreateDashboardPayload = DashboardMutationPayload & {
  department: string;
};

type AdminDashboardListResponse = {
  data?: {
    list?: DashboardSummary[];
    meta?: {
      page: number;
      size: number;
      total: number;
      total_pages: number;
      has_next: boolean;
      has_prev: boolean;
    };
  };
  description?: string;
};

export function isSuperUserRole(roleName?: string | null) {
  const normalizedRole = roleName?.trim().toUpperCase();
  return normalizedRole === "SUPER_ADMIN";
}

export function getSelectedDashboardId() {
  return sessionStorage.getItem(SELECTED_DASHBOARD_STORAGE_KEY);
}

export function setSelectedDashboardId(dashboardId: string) {
  sessionStorage.setItem(SELECTED_DASHBOARD_STORAGE_KEY, dashboardId);
}

export function clearSelectedDashboardId() {
  sessionStorage.removeItem(SELECTED_DASHBOARD_STORAGE_KEY);
}

export const fetchDashboards = async (roleName?: string | null) => {
  if (isSuperUserRole(roleName)) {
    const dashboards: DashboardSummary[] = [];
    let page = 1;
    const size = 100;
    let hasNext = true;

    while (hasNext) {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/dashboards/admin?page=${page}&size=${size}`,
        {
          headers: getAuthHeaders(),
        },
      );

      handleUnauthorizedStatus(res.status);

      const json = (await res.json()) as AdminDashboardListResponse;

      if (!res.ok) {
        throw new Error(json.description || "Failed to load dashboards");
      }

      dashboards.push(...(json.data?.list ?? []));
      hasNext = Boolean(json.data?.meta?.has_next);
      page += 1;
    }

    return dashboards;
  }

  const res = await fetch(`${API_BASE_URL}/api/v1/dashboards`, {
    headers: getAuthHeaders(),
  });

  handleUnauthorizedStatus(res.status);

  const json = (await res.json()) as DashboardListResponse;

  if (!res.ok) {
    throw new Error(json.description || "Failed to load dashboards");
  }

  return json.data ?? [];
};

export const fetchDashboard = async (dashboardID: string) => {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/dashboards/${dashboardID}?include_data=true`,
    {
      headers: getAuthHeaders(),
    },
  );

  handleUnauthorizedStatus(res.status);

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.description || "Failed to load dashboard");
  }

  return json;
};

export const createDashboard = async (payload: CreateDashboardPayload) => {
  const res = await fetch(`${API_BASE_URL}/api/v1/dashboards`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  handleUnauthorizedStatus(res.status);

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.description || "Failed to create dashboard");
  }

  return json;
};

export const updateDashboard = async (
  dashboardId: string,
  payload: DashboardMutationPayload,
) => {
  const res = await fetch(`${API_BASE_URL}/api/v1/dashboards/${dashboardId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  handleUnauthorizedStatus(res.status);

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.description || "Failed to update dashboard");
  }

  return json;
};
