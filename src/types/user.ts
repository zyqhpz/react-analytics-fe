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
