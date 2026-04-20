import type { PaginationMeta, UserDepartment } from "@/types/user";
import { API_BASE_URL, type ResponseApiBase } from "./base";
import { authFetch } from "./client";
import { handleUnauthorizedStatus, parseApiError } from "./utils";

type DepartmentsResponse = ResponseApiBase<{
  list?: UserDepartment[];
  meta?: Partial<PaginationMeta>;
}>;

export async function fetchDepartments() {
  const res = await authFetch(`${API_BASE_URL}/api/v1/departments`);

  handleUnauthorizedStatus(res.status);

  if (!res.ok) {
    throw new Error(await parseApiError(res, "Failed to load departments"));
  }

  const json = (await res.json()) as DepartmentsResponse;

  return json.data?.list ?? [];
}
