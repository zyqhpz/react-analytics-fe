import {
  assignUserRole,
  createUser,
  fetchUsers,
  isAdminOrSuperAdminRole,
  isSuperUserRole,
  normalizeRoleName,
  updateUserDetails,
  updateUserStatus,
  type CreateUserPayload,
} from "@/api/users";
import { CurrentUserBadge } from "@/components/CurrentUserBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import type { ManagedUser } from "@/types/user";
import {
  LoaderCircle,
  Plus,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";

const PAGE_SIZE_OPTIONS = ["10", "25", "50"] as const;
const SUPER_ADMIN_CREATE_ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;
const ADMIN_CREATE_ROLES = ["EDITOR", "VIEWER"] as const;
const inputClassName =
  "w-full rounded-xl border border-white/12 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60";

type EditableUserState = {
  id: string;
  name: string;
  role: string;
};

const formatRoleLabel = (roleName?: string | null) => {
  const normalized = normalizeRoleName(roleName);
  if (!normalized) return "No role";
  return normalized.replaceAll("_", " ");
};

const getDepartmentLabel = (user: ManagedUser) =>
  user.department?.name || user.department?.slug || user.department_id || "N/A";

const getDepartmentValue = (user: ManagedUser) =>
  user.department?.slug || user.department?.name || user.department_id || "";

const canManageUser = (
  user: ManagedUser,
  currentRoleName: string,
  currentDepartmentValue: string,
) => {
  if (isSuperUserRole(currentRoleName)) {
    return true;
  }

  if (normalizeRoleName(currentRoleName) !== "ADMIN") {
    return false;
  }

  const targetDepartment = (
    user.department?.slug ||
    user.department?.name ||
    user.department_id ||
    ""
  )
    .trim()
    .toLowerCase();

  return (
    Boolean(targetDepartment) && targetDepartment === currentDepartmentValue
  );
};

const canManageUserRole = (user: ManagedUser, currentRoleName: string) => {
  const targetRole = normalizeRoleName(user.role?.name);

  if (targetRole === "SUPER_ADMIN") {
    return false;
  }

  if (isSuperUserRole(currentRoleName)) {
    return true;
  }

  return targetRole !== "ADMIN";
};

const buildCreatePayload = (
  form: CreateUserPayload,
  isSuperAdmin: boolean,
  departmentValue: string,
): CreateUserPayload => ({
  ...form,
  department: isSuperAdmin ? form.department.trim() : departmentValue,
  email: form.email.trim(),
  name: form.name.trim(),
  password: form.password.trim(),
  role: normalizeRoleName(form.role),
});

export default function UserManagementPage() {
  const { currentUser } = useAuth();
  const currentRoleName = normalizeRoleName(currentUser?.role?.name);
  const isSuperAdmin = isSuperUserRole(currentRoleName);
  const canAccessPage = isAdminOrSuperAdminRole(currentRoleName);
  const currentDepartmentValue = (
    currentUser?.department?.slug ||
    currentUser?.department?.name ||
    currentUser?.department_id ||
    ""
  )
    .trim()
    .toLowerCase();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editableUser, setEditableUser] = useState<EditableUserState | null>(
    null,
  );
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pagination, setPagination] = useState({
    page: 1,
    size: 10,
    total: 0,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  });
  const [filters, setFilters] = useState({
    department: "",
    role: "ALL",
  });
  const availableRoles = useMemo(
    () =>
      isSuperAdmin ? [...SUPER_ADMIN_CREATE_ROLES] : [...ADMIN_CREATE_ROLES],
    [isSuperAdmin],
  );
  const [createForm, setCreateForm] = useState<CreateUserPayload>({
    department:
      currentUser?.department?.slug || currentUser?.department?.name || "",
    email: "",
    name: "",
    password: "",
    role: "",
  });

  useEffect(() => {
    setCreateForm((prev) => ({
      ...prev,
      department:
        currentUser?.department?.slug || currentUser?.department?.name || "",
      role:
        availableRoles.find(
          (role) => normalizeRoleName(role) === normalizeRoleName(prev.role),
        ) ||
        availableRoles[0] ||
        "",
    }));
  }, [
    availableRoles,
    currentUser?.department?.name,
    currentUser?.department?.slug,
  ]);

  useEffect(() => {
    if (!canAccessPage) {
      return;
    }

    let isCancelled = false;

    const loadUsers = async () => {
      setIsLoading(true);

      try {
        const response = await fetchUsers({
          page: pagination.page,
          size: pagination.size,
          department: isSuperAdmin ? filters.department.trim() : undefined,
          role:
            isSuperAdmin && filters.role !== "ALL" ? filters.role : undefined,
          isSuperAdmin,
        });

        if (isCancelled) {
          return;
        }

        setUsers(response.list);
        setPagination((prev) => ({
          ...prev,
          ...response.meta,
        }));
      } catch (error) {
        if (!isCancelled) {
          toast.error("Failed to load users.", {
            description:
              error instanceof Error ? error.message : "Unknown error",
          });
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadUsers();

    return () => {
      isCancelled = true;
    };
  }, [
    canAccessPage,
    filters.department,
    filters.role,
    isSuperAdmin,
    pagination.page,
    pagination.size,
    reloadKey,
  ]);

  const managedUsersCount = useMemo(
    () =>
      users.filter((user) =>
        canManageUser(user, currentRoleName, currentDepartmentValue),
      ).length,
    [currentDepartmentValue, currentRoleName, users],
  );

  if (!canAccessPage) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleCreateFieldChange = (
    field: keyof CreateUserPayload,
    value: string,
  ) => {
    setCreateForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const departmentValue = (
      currentUser?.department?.slug ||
      currentUser?.department?.name ||
      createForm.department
    ).trim();
    const payload = buildCreatePayload(
      createForm,
      isSuperAdmin,
      departmentValue,
    );

    if (!payload.name || !payload.email || !payload.password || !payload.role) {
      toast.error("Name, email, password, and role are required.");
      return;
    }

    if (!payload.department) {
      toast.error("Department is required.");
      return;
    }

    if (
      !availableRoles.includes(payload.role as (typeof availableRoles)[number])
    ) {
      toast.error("Selected role is not allowed for your account.");
      return;
    }

    setIsSubmittingCreate(true);

    try {
      await createUser(payload);
      toast.success("User created successfully.");
      setCreateForm({
        department:
          currentUser?.department?.slug || currentUser?.department?.name || "",
        email: "",
        name: "",
        password: "",
        role: availableRoles[0] || "",
      });
      setPagination((prev) => ({
        ...prev,
        page: 1,
      }));
      setReloadKey((prev) => prev + 1);
      setIsCreateModalOpen(false);
    } catch (error) {
      toast.error("Failed to create user.", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleEditStart = (user: ManagedUser) => {
    setEditableUser({
      id: user.id,
      name: user.name,
      role: normalizeRoleName(user.role?.name),
    });
  };

  const handleEditSave = async () => {
    if (!editableUser) {
      return;
    }

    const nextName = editableUser.name.trim();
    const nextRole = normalizeRoleName(editableUser.role);
    if (!nextName) {
      toast.error("User name is required.");
      return;
    }

    setSavingUserId(editableUser.id);

    try {
      const userToUpdate = users.find((user) => user.id === editableUser.id);

      if (!userToUpdate) {
        throw new Error("User not found");
      }

      const canUpdateRole = canManageUserRole(userToUpdate, currentRoleName);

      if (
        canUpdateRole &&
        !availableRoles.includes(nextRole as (typeof availableRoles)[number])
      ) {
        toast.error("Selected role is not allowed for your account.");
        return;
      }

      await updateUserDetails(editableUser.id, { name: nextName });

      if (
        canUpdateRole &&
        nextRole !== normalizeRoleName(userToUpdate.role?.name)
      ) {
        const department = getDepartmentValue(userToUpdate).trim();

        if (!department) {
          throw new Error("Department is required to assign a role");
        }

        await assignUserRole({
          department,
          role: nextRole.toLowerCase(),
          user_id: editableUser.id,
        });
      }

      setUsers((prev) =>
        prev.map((user) =>
          user.id === editableUser.id
            ? {
                ...user,
                name: nextName,
                role: {
                  ...user.role,
                  name: canUpdateRole
                    ? nextRole
                    : normalizeRoleName(user.role?.name),
                },
              }
            : user,
        ),
      );
      toast.success("User details updated.");
      setEditableUser(null);
    } catch (error) {
      toast.error("Failed to update user.", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSavingUserId(null);
    }
  };

  const handleStatusToggle = async (user: ManagedUser) => {
    setTogglingUserId(user.id);

    try {
      await updateUserStatus(user.id, { is_active: !user.is_active });
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? {
                ...item,
                is_active: !item.is_active,
              }
            : item,
        ),
      );
      toast.success(
        `${user.name} is now ${user.is_active ? "inactive" : "active"}.`,
      );
    } catch (error) {
      toast.error("Failed to update user status.", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setTogglingUserId(null);
    }
  };

  const totalPages = Math.max(1, pagination.total_pages || 1);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-cyan-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.4)] backdrop-blur-xl">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
              Administration
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-100">
                <Users className="size-5" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
                  User Management
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-slate-300">
                  Manage application users, access levels, and active status
                  from one dedicated workspace.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1">
                Signed in as {formatRoleLabel(currentRoleName)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Department:{" "}
                {currentUser?.department?.name ||
                  currentUser?.department?.slug ||
                  "N/A"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Manageable users on this page: {managedUsersCount}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <CurrentUserBadge />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                className="rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <Plus className="size-4" />
                New User
              </Button>
              <Link
                to="/dashboard"
                className="rounded-lg border border-white/15 bg-slate-800/70 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-700"
              >
                Dashboard
              </Link>
              <Link
                to="/query-builder"
                className="rounded-lg border border-white/15 bg-slate-800/70 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-700"
              >
                Query Builder
              </Link>
              <Link
                to="/graphql-playground"
                className="rounded-lg border border-white/15 bg-slate-800/70 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-700"
              >
                GraphQL Playground
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <Card className="border-white/10 bg-slate-900/75 text-slate-50 shadow-[0_20px_50px_rgba(2,6,23,0.35)]">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="size-5 text-cyan-200" />
                  Users Directory
                </CardTitle>
                <p className="text-sm text-slate-400">
                  {pagination.total} total users
                  {isSuperAdmin
                    ? " across all departments."
                    : " available to your account."}
                </p>
              </div>

              <div className="grid w-full gap-3 md:w-auto md:grid-cols-[minmax(180px,1fr)_160px_120px]">
                {isSuperAdmin ? (
                  <input
                    value={filters.department}
                    onChange={(event) => {
                      setFilters((prev) => ({
                        ...prev,
                        department: event.target.value,
                      }));
                      setPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    className={inputClassName}
                    placeholder="Filter by department"
                  />
                ) : (
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-300">
                    Department:{" "}
                    {currentUser?.department?.name ||
                      currentUser?.department?.slug ||
                      "N/A"}
                  </div>
                )}

                <Select
                  value={filters.role}
                  onValueChange={(value) => {
                    setFilters((prev) => ({
                      ...prev,
                      role: value,
                    }));
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  disabled={!isSuperAdmin}
                >
                  <SelectTrigger className="w-full rounded-xl border-white/12 bg-slate-950/60 text-slate-100 disabled:opacity-60">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-slate-950 text-slate-100">
                    <SelectItem value="ALL">All roles</SelectItem>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                    <SelectItem value="EDITOR">EDITOR</SelectItem>
                    <SelectItem value="VIEWER">VIEWER</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={String(pagination.size)}
                  onValueChange={(value) =>
                    setPagination((prev) => ({
                      ...prev,
                      page: 1,
                      size: Number(value),
                    }))
                  }
                >
                  <SelectTrigger className="w-full rounded-xl border-white/12 bg-slate-950/60 text-slate-100">
                    <SelectValue placeholder="Page size" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-slate-950 text-slate-100">
                    {PAGE_SIZE_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <Table className="min-w-full text-slate-100">
                  <TableHeader className="bg-slate-950/80">
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="px-4 text-slate-300">
                        Name
                      </TableHead>
                      <TableHead className="px-4 text-slate-300">
                        Email
                      </TableHead>
                      <TableHead className="px-4 text-slate-300">
                        Role
                      </TableHead>
                      <TableHead className="px-4 text-slate-300">
                        Department
                      </TableHead>
                      <TableHead className="px-4 text-slate-300">
                        Status
                      </TableHead>
                      <TableHead className="px-4 text-right text-slate-300">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow className="border-white/10">
                        <TableCell
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm text-slate-400"
                        >
                          <span className="inline-flex items-center gap-2">
                            <LoaderCircle className="size-4 animate-spin" />
                            Loading users...
                          </span>
                        </TableCell>
                      </TableRow>
                    ) : users.length ? (
                      users.map((user) => {
                        const rowIsEditable =
                          editableUser?.id === user.id &&
                          canManageUser(
                            user,
                            currentRoleName,
                            currentDepartmentValue,
                          );
                        const rowIsManageable = canManageUser(
                          user,
                          currentRoleName,
                          currentDepartmentValue,
                        );
                        const rowCanManageRole = canManageUserRole(
                          user,
                          currentRoleName,
                        );

                        return (
                          <TableRow
                            key={user.id}
                            className="border-white/10 hover:bg-white/5"
                          >
                            <TableCell className="px-4 py-3">
                              {rowIsEditable ? (
                                <input
                                  value={editableUser.name}
                                  onChange={(event) =>
                                    setEditableUser((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            name: event.target.value,
                                          }
                                        : prev,
                                    )
                                  }
                                  className={inputClassName}
                                />
                              ) : (
                                <div className="font-medium text-slate-50">
                                  {user.name}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-slate-300">
                              {user.email}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-slate-300">
                              {rowIsEditable && rowCanManageRole ? (
                                <Select
                                  value={editableUser.role}
                                  onValueChange={(value) =>
                                    setEditableUser((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            role: value,
                                          }
                                        : prev,
                                    )
                                  }
                                  disabled={savingUserId === user.id}
                                >
                                  <SelectTrigger className="w-42.5 rounded-xl border-white/12 bg-slate-950/60 text-slate-100 disabled:opacity-60">
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                  <SelectContent className="border-white/10 bg-slate-950 text-slate-100">
                                    {availableRoles.map((role) => (
                                      <SelectItem key={role} value={role}>
                                        {formatRoleLabel(role)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                formatRoleLabel(user.role?.name)
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-slate-300">
                              {getDepartmentLabel(user)}
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  user.is_active
                                    ? "bg-emerald-400/15 text-emerald-200"
                                    : "bg-rose-400/15 text-rose-200"
                                }`}
                              >
                                {user.is_active ? "Active" : "Inactive"}
                              </span>
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                {rowIsEditable ? (
                                  <>
                                    <Button
                                      size="sm"
                                      className="rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                                      onClick={handleEditSave}
                                      disabled={savingUserId === user.id}
                                    >
                                      {savingUserId === user.id
                                        ? "Saving..."
                                        : "Save"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-lg border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
                                      onClick={() => setEditableUser(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-lg border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
                                      onClick={() => handleEditStart(user)}
                                      disabled={!rowIsManageable}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-lg border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
                                      onClick={() => handleStatusToggle(user)}
                                      disabled={
                                        !rowIsManageable ||
                                        togglingUserId === user.id
                                      }
                                    >
                                      {togglingUserId === user.id
                                        ? "Updating..."
                                        : user.is_active
                                          ? "Deactivate"
                                          : "Activate"}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow className="border-white/10">
                        <TableCell
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm text-slate-400"
                        >
                          No users found for the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-400">
                  Page {pagination.page} of {totalPages}
                </p>

                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() =>
                          setPagination((prev) => ({
                            ...prev,
                            page: Math.max(1, prev.page - 1),
                          }))
                        }
                        disabled={!pagination.has_prev || isLoading}
                        className="border-white/10 text-slate-100 hover:bg-white/10 disabled:opacity-50"
                      />
                    </PaginationItem>

                    {Array.from({ length: totalPages }, (_, index) => index + 1)
                      .slice(
                        Math.max(0, pagination.page - 3),
                        Math.max(0, pagination.page - 3) + 5,
                      )
                      .map((pageNumber) => (
                        <PaginationItem key={pageNumber}>
                          <PaginationLink
                            isActive={pageNumber === pagination.page}
                            onClick={() =>
                              setPagination((prev) => ({
                                ...prev,
                                page: pageNumber,
                              }))
                            }
                            className={
                              pageNumber === pagination.page
                                ? "border-cyan-400/40 bg-slate-800 text-slate-50 hover:bg-slate-700"
                                : "border-white/10 text-slate-100 hover:bg-white/10"
                            }
                            disabled={isLoading}
                          >
                            {pageNumber}
                          </PaginationLink>
                        </PaginationItem>
                      ))}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() =>
                          setPagination((prev) => ({
                            ...prev,
                            page: Math.min(totalPages, prev.page + 1),
                          }))
                        }
                        disabled={!pagination.has_next || isLoading}
                        className="border-white/10 text-slate-100 hover:bg-white/10 disabled:opacity-50"
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => !isSubmittingCreate && setIsCreateModalOpen(false)}
          />
          <Card className="relative z-10 w-full max-w-xl border-white/10 bg-slate-900/95 text-slate-50 shadow-[0_30px_90px_rgba(2,6,23,0.55)]">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserCog className="size-5 text-cyan-200" />
                  Create New User
                </CardTitle>
                <p className="text-sm text-slate-400">
                  {isSuperAdmin
                    ? "Choose any department and role available from the backend."
                    : "This user will be created under your current department."}
                </p>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isSubmittingCreate}
              >
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleCreateUser}>
                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Name
                  </label>
                  <input
                    value={createForm.name}
                    onChange={(event) =>
                      handleCreateFieldChange("name", event.target.value)
                    }
                    className={inputClassName}
                    placeholder="Jane Doe"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Email
                  </label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(event) =>
                      handleCreateFieldChange("email", event.target.value)
                    }
                    className={inputClassName}
                    placeholder="jane@company.com"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Password
                  </label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(event) =>
                      handleCreateFieldChange("password", event.target.value)
                    }
                    className={inputClassName}
                    placeholder="Temporary password"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Role
                  </label>
                  <Select
                    value={createForm.role}
                    onValueChange={(value) =>
                      handleCreateFieldChange("role", value)
                    }
                    disabled={!availableRoles.length}
                  >
                    <SelectTrigger className="w-full rounded-xl border-white/12 bg-slate-950/60 text-slate-100 disabled:opacity-60">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-slate-950 text-slate-100">
                      {availableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {formatRoleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Department
                  </label>
                  <input
                    value={
                      isSuperAdmin
                        ? createForm.department
                        : currentUser?.department?.name ||
                          currentUser?.department?.slug ||
                          ""
                    }
                    onChange={(event) =>
                      handleCreateFieldChange("department", event.target.value)
                    }
                    className={inputClassName}
                    placeholder="finance"
                    disabled={!isSuperAdmin}
                  />
                  {!isSuperAdmin ? (
                    <p className="mt-2 text-xs text-slate-400">
                      ADMIN accounts can create users only for their own
                      department.
                    </p>
                  ) : null}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
                    onClick={() => setIsCreateModalOpen(false)}
                    disabled={isSubmittingCreate}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-xl bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    disabled={isSubmittingCreate || !availableRoles.length}
                  >
                    {isSubmittingCreate ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        Creating user...
                      </>
                    ) : (
                      "Create User"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
