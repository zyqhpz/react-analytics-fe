import type { CurrentUser, ManagedUser, PaginationMeta } from "@/types/user";
import { API_BASE_URL, type ResponseApiBase } from "./base";
import { authFetch } from "./client";
import { handleUnauthorizedStatus, parseApiError } from "./utils";

type CurrentUserResponse = ResponseApiBase<CurrentUser>;

type CreateUserPayload = {
  department: string;
  email: string;
  name: string;
  password: string;
  role: string;
};

type UpdateUserDetailsPayload = {
  name: string;
};

type UpdateUserStatusPayload = {
  is_active: boolean;
};

type AssignUserRolePayload = {
  department: string;
  role: string;
  user_id: string;
};

type FetchUsersParams = {
  page: number;
  size: number;
  department?: string;
  role?: string;
  isSuperAdmin: boolean;
};

type FetchUsersData =
  | ManagedUser[]
  | {
      list?: ManagedUser[];
      users?: ManagedUser[];
      meta?: Partial<PaginationMeta>;
    };

type FetchUsersResponse = ResponseApiBase<FetchUsersData> & {
  meta?: Partial<PaginationMeta>;
};

const DEFAULT_PAGINATION_META: PaginationMeta = {
  page: 1,
  size: 10,
  total: 0,
  total_pages: 1,
  has_next: false,
  has_prev: false,
};

export function normalizeRoleName(roleName?: string | null) {
  return roleName?.trim().toUpperCase() ?? "";
}

export function isSuperUserRole(roleName?: string | null) {
  return normalizeRoleName(roleName) === "SUPER_ADMIN";
}

export function isAdminOrSuperAdminRole(roleName?: string | null) {
  const normalizedRole = normalizeRoleName(roleName);
  return normalizedRole === "SUPER_ADMIN" || normalizedRole === "ADMIN";
}

function extractUsersList(data: FetchUsersResponse["data"]) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.list)) {
    return data.list;
  }

  if (Array.isArray(data?.users)) {
    return data.users;
  }

  return [];
}

function extractPaginationMeta(
  response: FetchUsersResponse,
  params: FetchUsersParams,
): PaginationMeta {
  const candidateMeta = Array.isArray(response.data)
    ? response.meta
    : response.data?.meta || response.meta;

  return {
    page: candidateMeta?.page ?? params.page ?? DEFAULT_PAGINATION_META.page,
    size: candidateMeta?.size ?? params.size ?? DEFAULT_PAGINATION_META.size,
    total: candidateMeta?.total ?? extractUsersList(response.data).length,
    total_pages:
      candidateMeta?.total_pages ?? DEFAULT_PAGINATION_META.total_pages,
    has_next: candidateMeta?.has_next ?? DEFAULT_PAGINATION_META.has_next,
    has_prev: candidateMeta?.has_prev ?? params.page > 1,
  };
}

export const fetchCurrentUser = async () => {
  const res = await authFetch(`${API_BASE_URL}/api/v1/users/me`);

  handleUnauthorizedStatus(res.status);

  if (!res.ok) {
    throw new Error(await parseApiError(res, "Failed to load current user"));
  }

  const json: CurrentUserResponse = await res.json();

  return json.data;
};

export async function fetchUsers(params: FetchUsersParams) {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
  });

  if (params.isSuperAdmin && params.department) {
    searchParams.set("department", params.department);
  }

  if (params.isSuperAdmin && params.role) {
    searchParams.set("role", params.role);
  }

  const endpoint = params.isSuperAdmin
    ? "/api/v1/users/admin"
    : "/api/v1/users";
  const res = await authFetch(`${API_BASE_URL}${endpoint}?${searchParams}`);

  handleUnauthorizedStatus(res.status);

  if (!res.ok) {
    throw new Error(await parseApiError(res, "Failed to load users"));
  }

  const json = (await res.json()) as FetchUsersResponse;

  return {
    list: extractUsersList(json.data),
    meta: extractPaginationMeta(json, params),
  };
}

export async function createUser(payload: CreateUserPayload) {
  const res = await authFetch(`${API_BASE_URL}/api/v1/users`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  handleUnauthorizedStatus(res.status);

  if (!res.ok) {
    throw new Error(await parseApiError(res, "Failed to create user"));
  }

  return (await res.json()) as ResponseApiBase<unknown>;
}

export async function updateUserDetails(
  userId: string,
  payload: UpdateUserDetailsPayload,
) {
  const res = await authFetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  handleUnauthorizedStatus(res.status);

  if (!res.ok) {
    throw new Error(await parseApiError(res, "Failed to update user"));
  }

  return (await res.json()) as ResponseApiBase<unknown>;
}

export async function updateUserStatus(
  userId: string,
  payload: UpdateUserStatusPayload,
) {
  const res = await authFetch(`${API_BASE_URL}/api/v1/users/${userId}/status`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  handleUnauthorizedStatus(res.status);

  if (!res.ok) {
    throw new Error(await parseApiError(res, "Failed to update user status"));
  }

  return (await res.json()) as ResponseApiBase<unknown>;
}

export async function assignUserRole(payload: AssignUserRolePayload) {
  const res = await authFetch(`${API_BASE_URL}/api/v1/roles/assign`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  handleUnauthorizedStatus(res.status);

  if (!res.ok) {
    throw new Error(await parseApiError(res, "Failed to assign user role"));
  }

  return (await res.json()) as ResponseApiBase<unknown>;
}

export type {
  AssignUserRolePayload,
  CreateUserPayload,
  UpdateUserDetailsPayload,
  UpdateUserStatusPayload,
  FetchUsersParams,
};
