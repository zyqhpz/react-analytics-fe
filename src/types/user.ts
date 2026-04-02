export interface UserDepartment {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  name: string;
  description: string;
  department_id: string;
  permissions: Record<string, unknown>;
  created_at: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  department_id: string;
  department: UserDepartment;
  role: UserRole;
  created_at: string;
  updated_at: string;
  last_login_at: string;
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  department_id?: string;
  department?: Partial<UserDepartment> | null;
  role?: Partial<UserRole> | null;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string;
}

export interface PaginationMeta {
  page: number;
  size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}
