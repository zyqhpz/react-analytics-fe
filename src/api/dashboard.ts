import type { DashboardSummary, WidgetPosition } from "@/types/dashboard";
import type { ChartType, Query } from "@/types/query";
import { API_BASE_URL, type ResponseApiBase } from "./base";
import { authFetch } from "./client";
import { handleUnauthorizedStatus } from "./utils";

const SELECTED_DASHBOARD_STORAGE_KEY = "selected_dashboard_id";

type DashboardListResponse = ResponseApiBase<DashboardSummary[]>;

type DashboardMutationPayload = {
  name: string;
  description: string;
};

type CreateDashboardPayload = DashboardMutationPayload & {
  department: string;
};

type AdminDashboardListResponse = ResponseApiBase<{
  list?: DashboardSummary[];
  meta?: {
    page: number;
    size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}>;

type DashboardWidgetResponse = {
  id: string;
  widget_type: ChartType;
  position: WidgetPosition;
  query?: Query;
};

type DashboardDetail = DashboardSummary & {
  dashboard_id?: string;
  widgets?: DashboardWidgetResponse[];
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
      const res = await authFetch(
        `${API_BASE_URL}/api/v1/dashboards/admin?page=${page}&size=${size}`,
        {},
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

  const res = await authFetch(`${API_BASE_URL}/api/v1/dashboards`);

  handleUnauthorizedStatus(res.status);

  const json = (await res.json()) as DashboardListResponse;

  if (!res.ok) {
    throw new Error(json.description || "Failed to load dashboards");
  }

  return json.data ?? [];
};

export const fetchDashboard = async (dashboardID: string) => {
  const res = await authFetch(
    `${API_BASE_URL}/api/v1/dashboards/${dashboardID}?include_data=true`,
    {},
  );

  handleUnauthorizedStatus(res.status);

  const json = (await res.json()) as ResponseApiBase<DashboardDetail>;

  if (!res.ok) {
    throw new Error(json.description || "Failed to load dashboard");
  }

  return json;
};

export const createDashboard = async (payload: CreateDashboardPayload) => {
  const res = await authFetch(`${API_BASE_URL}/api/v1/dashboards`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  handleUnauthorizedStatus(res.status);

  const json = (await res.json()) as ResponseApiBase<DashboardDetail>;

  if (!res.ok) {
    throw new Error(json.description || "Failed to create dashboard");
  }

  return json;
};

export const updateDashboard = async (
  dashboardId: string,
  payload: DashboardMutationPayload,
) => {
  const res = await authFetch(
    `${API_BASE_URL}/api/v1/dashboards/${dashboardId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );

  handleUnauthorizedStatus(res.status);

  const json = (await res.json()) as ResponseApiBase<DashboardDetail>;

  if (!res.ok) {
    throw new Error(json.description || "Failed to update dashboard");
  }

  return json;
};
