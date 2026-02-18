"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle,
  XCircle,
  Shield,
  UserPlus,
  X,
  Mail,
  Key,
  Pause,
  MoreHorizontal,
  Pencil,
  Lock,
  Play,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";

// Types
interface Privilege {
  module: string;
  can_view: boolean;
  can_edit: boolean;
}

interface SubAccount {
  id: number;
  parent_id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  privileges: Privilege[];
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

// Available modules for privileges
const AVAILABLE_MODULES = [
  { id: "dashboard", label: "Dashboard", description: "View and manage dashboard" },
  { id: "camera_inventory", label: "Camera Inventory", description: "Manage cameras and devices" },
  { id: "health", label: "System Health", description: "Monitor system health" },
  { id: "alarm_console", label: "Alarm Console", description: "Manage alarms and notifications" },
  { id: "user_logs", label: "User Logs", description: "View user activity logs" },
  { id: "analytics", label: "Analytics", description: "View analytics and reports" },
  { id: "storage", label: "Storage", description: "Manage storage" },
  { id: "users", label: "User Management", description: "Manage NX System users" },
];

// Default privileges (all view, no edit)
const getDefaultPrivileges = (): Privilege[] =>
  AVAILABLE_MODULES.map((m) => ({
    module: m.id,
    can_view: true,
    can_edit: false,
  }));

import { isAdmin } from "@/lib/auth";

export default function SubAccountManagement() {
  const { user } = useAuth();
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [orgId, setOrgId] = useState<number | null>(null);

  // Check permissions
  const isUserAdmin = isAdmin(user);
  const canEditMembers = isUserAdmin || user?.privileges?.find(p => p.module === "user_management" || p.module === "users")?.can_edit === true;

  // Fetch organization ID if not available in context
  useEffect(() => {
    const getOrgId = async () => {
      if (!isUserAdmin) {
        if (!loading) setLoading(false);
        return;
      }

      console.log("[RoleManagement] Checking for orgId in user context...", user);

      // If already in user context, use it
      if (user?.organizations && user.organizations.length > 0) {
        const id = user.organizations[0].id || (user.organizations[0] as any).org_id;
        if (id) {
          console.log("[RoleManagement] Found orgId in context:", id);
          setOrgId(Number(id));
          return;
        }
      }

      // Otherwise fetch from /me API
      try {
        console.log("[RoleManagement] Fetching orgId from /api/auth/me...");
        const response = await fetch("/api/auth/me");
        const data = await response.json();

        // Very flexible check based on different possible API response structures
        const id = data.organization?.id ||
          data.organization?.org_id ||
          data.user?.organization_id ||
          data.user?.organizations?.[0]?.id ||
          data.user?.organizations?.[0]?.org_id;

        if (id) {
          console.log("[RoleManagement] Received orgId successfully:", id);
          setOrgId(Number(id));
        } else {
          console.error("[RoleManagement] No organization found in API response structure:", data);
          setError("Failed to get organization data from server.");
          setLoading(false);
        }
      } catch (err) {
        console.error("[RoleManagement] Error fetching organization data:", err);
        setError("Failed to connect to server to get organization data.");
        setLoading(false);
      }
    };

    getOrgId();
  }, [user, isAdmin]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SubAccount | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "user",
    is_active: true,
    privileges: getDefaultPrivileges(),
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Password Change State
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: "",
  });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Fetch sub-accounts
  const fetchSubAccounts = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/users");
      const data = await response.json();

      if (data.success) {
        setSubAccounts(data.users || data.data || []);
      } else {
        setError(data.message || "Failed to fetch sub-accounts");
      }
    } catch (err) {
      console.error("Error fetching sub-accounts:", err);
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, [isUserAdmin]);

  useEffect(() => {
    if (isUserAdmin) {
      fetchSubAccounts();
    }
  }, [fetchSubAccounts, isUserAdmin]);

  // If not admin, don't show the management UI
  if (!isUserAdmin && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Shield className="w-16 h-16 text-slate-300 mb-4" />
        <h3 className="text-xl font-semibold text-slate-900">Limited Access</h3>
        <p className="text-slate-500 max-w-md mt-2">
          Only administrators can manage user accounts and permissions.
          Please contact your system admin for assistance.
        </p>
      </div>
    );
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      username: "",
      email: "",
      password: "",
      role: "user",
      is_active: true,
      privileges: getDefaultPrivileges(),
    });
    setFormError(null);
    setShowPassword(false);
  };

  // Open create modal
  const handleOpenCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const handleOpenChangePassword = (account: SubAccount) => {
    setSelectedAccount(account);
    setPasswordForm({ password: "", confirmPassword: "" });
    setFormError(null);
    setShowChangePasswordModal(true);
  };

  // Open edit modal
  const handleOpenEdit = async (account: SubAccount) => {
    setSelectedAccount(account);
    setLoading(true);

    try {
      const response = await fetch(`/api/users/${account.id}`);
      const data = await response.json();

      if (data.success && data.user) {
        const userDetail = data.user;
        setFormData({
          username: userDetail.username,
          email: userDetail.email || account.email,
          password: "", // Don't pre-fill password
          role: userDetail.role || account.role || "user",
          is_active: userDetail.is_active ?? account.is_active,
          privileges: AVAILABLE_MODULES.map((m) => {
            const existing = userDetail.privileges?.find((p: any) => p.module === m.id);
            return existing || { module: m.id, can_view: false, can_edit: false };
          }),
        });
        setFormError(null);
        setShowEditModal(true);
      } else {
        setError(data.message || "Failed to fetch user details");
      }
    } catch (err) {
      console.error("Error fetching user details:", err);
      setError("Failed to connect to server to fetch user details");
    } finally {
      setLoading(false);
    }
  };

  // Open delete dialog
  const handleOpenDelete = (account: SubAccount) => {
    setSelectedAccount(account);
    setShowDeleteDialog(true);
  };

  // Update privilege
  const updatePrivilege = (moduleId: string, field: "can_view" | "can_edit", value: boolean) => {
    setFormData((prev) => {
      const existingIdx = prev.privileges.findIndex((p) => p.module === moduleId);
      let newPrivileges = [...prev.privileges];

      if (existingIdx >= 0) {
        // Update existing
        const p = newPrivileges[existingIdx];
        newPrivileges[existingIdx] = {
          ...p,
          [field]: value,
          // If turning on edit, MUST turn on view
          ...(field === "can_edit" && value ? { can_view: true } : {}),
          // If removing view, MUST remove edit
          ...(field === "can_view" && !value ? { can_edit: false } : {}),
        };
      } else {
        // Add new
        newPrivileges.push({
          module: moduleId,
          can_view: field === "can_view" ? value : (field === "can_edit" && value),
          can_edit: field === "can_edit" ? value : false,
        });
      }

      return {
        ...prev,
        privileges: newPrivileges,
      };
    });
  };

  // Create sub-account
  const handleCreate = async () => {
    setSaving(true);
    setFormError(null);

    try {
      // Map privileges to permissions format for API
      const permissions: Record<string, "view" | "edit" | "none"> = {};
      formData.privileges.forEach((p) => {
        if (p.can_edit) permissions[p.module] = "edit";
        else if (p.can_view) permissions[p.module] = "view";
        else permissions[p.module] = "none";
      });

      // Use orgId from state
      if (orgId === null) {
        setFormError("ID organisasi tidak tersedia.");
        setSaving(false);
        return;
      }

      const response = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          email: formData.email,
          role: formData.role,
          org_id: orgId,
          permissions,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowCreateModal(false);
        resetForm();
        fetchSubAccounts();
      } else {
        setFormError(data.message || "Failed to create new user");
      }
    } catch (err) {
      console.error("Error creating user:", err);
      setFormError("Failed to connect to server");
    } finally {
      setSaving(false);
    }
  };

  // Update sub-account
  const handleUpdate = async () => {
    if (!selectedAccount) return;

    setSaving(true);
    setFormError(null);

    try {
      // Map privileges to permissions format for API
      const permissions: Record<string, "view" | "edit" | "none"> = {};
      formData.privileges.forEach((p) => {
        if (p.can_edit) permissions[p.module] = "edit";
        else if (p.can_view) permissions[p.module] = "view";
        else permissions[p.module] = "none";
      });

      // Prepare update data
      const updateData = {
        id: selectedAccount.id,
        username: formData.username,
        email: formData.email,
        role: formData.role,
        password: formData.password || undefined,
        is_active: formData.is_active ? 1 : 0,
        permissions,
      };

      const response = await fetch("/api/edit-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();

      if (data.success) {
        setShowEditModal(false);
        setSelectedAccount(null);
        resetForm();
        fetchSubAccounts();
      } else {
        setFormError(data.message || "Failed to update user");
      }
    } catch (err) {
      console.error("Error updating user:", err);
      setFormError("Failed to connect to server");
    } finally {
      setSaving(false);
    }
  };

  // Toggle user status (Activate/Deactivate)
  const handleToggleStatus = async (account: SubAccount) => {
    try {
      // Fetch full details first to ensure we have current permissions
      const detailResponse = await fetch(`/api/users/${account.id}`);
      const detailData = await detailResponse.json();

      if (!detailData.success) {
        setError(detailData.message || "Gagal mendapatkan detail pengguna");
        return;
      }

      const userDetail = detailData.user;
      const permissions: Record<string, string> = {};
      userDetail.privileges?.forEach((p: any) => {
        if (p.can_edit) permissions[p.module] = "edit";
        else if (p.can_view) permissions[p.module] = "view";
        else permissions[p.module] = "none";
      });

      const updateData = {
        id: account.id,
        email: userDetail.email || account.email,
        role: userDetail.role || account.role,
        is_active: account.is_active ? 0 : 1, // Toggle
        permissions,
      };

      const response = await fetch("/api/edit-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();
      if (data.success) {
        fetchSubAccounts();
      } else {
        setError(data.message || "Failed to change user status");
      }
    } catch (err) {
      console.error("Error toggling status:", err);
      setError("Failed to connect to server");
    }
  };

  const handleChangePassword = async () => {
    if (!selectedAccount) return;

    if (passwordForm.password.length < 6) {
      setFormError("Password must be at least 6 characters");
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const response = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: selectedAccount.id,
          new_password: passwordForm.password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowChangePasswordModal(false);
        setPasswordForm({ password: "", confirmPassword: "" });
        // Optional: Show success toast
      } else {
        setFormError(data.message || "Failed to update password");
      }
    } catch (err) {
      console.error("Error changing password:", err);
      setFormError("Failed to connect to server");
    } finally {
      setSaving(false);
    }
  };

  // Delete user
  const handleDelete = async () => {
    if (!selectedAccount) return;

    try {
      const response = await fetch("/api/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedAccount.id }),
      });

      const data = await response.json();

      if (data.success) {
        setShowDeleteDialog(false);
        setSelectedAccount(null);
        fetchSubAccounts();
      } else {
        setError(data.message || "Failed to delete sub-account");
      }
    } catch (err) {
      console.error("Error deleting sub-account:", err);
      setError("Failed to connect to server");
    }
  };

  // Filter accounts by search
  const filteredAccounts = subAccounts.filter(
    (account) =>
      account.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Form component (reused for create and edit)
  const renderForm = (isEdit: boolean) => (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto px-2 pb-4 text-slate-900">
      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{formError}</span>
        </div>
      )}

      {/* Basic Info */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">Account Information</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username *</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="johndoe"
              className="h-11 border-slate-200 focus-visible:ring-blue-600"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="john@example.com"
              className="h-11 border-slate-200 focus-visible:ring-blue-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
              className="flex h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
            >
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter password"
                  className="h-11 pr-10 border-slate-200 focus-visible:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Privileges - Hidden for Admin */}
      {formData.role !== "admin" && (
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h4 className="font-medium text-gray-900">Access Permissions</h4>
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="w-[40%]">Module</TableHead>
                  <TableHead className="text-center">View</TableHead>
                  <TableHead className="text-center">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AVAILABLE_MODULES.map((module) => {
                  const privilege = formData.privileges.find((p) => p.module === module.id) || {
                    module: module.id,
                    can_view: false,
                    can_edit: false,
                  };

                  return (
                    <TableRow key={module.id} className="hover:bg-slate-100/50">
                      <TableCell>
                        <div className="font-medium text-slate-900">{module.label}</div>
                        <div className="text-xs text-slate-500">{module.description}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => updatePrivilege(module.id, "can_view", !privilege.can_view)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors select-none ${privilege.can_view ? "bg-blue-600" : "bg-slate-300"
                            }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${privilege.can_view ? "translate-x-5" : "translate-x-1"
                              }`}
                          />
                        </button>
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => updatePrivilege(module.id, "can_edit", !privilege.can_edit)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors select-none ${privilege.can_edit ? "bg-blue-600" : "bg-slate-300"
                            }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${privilege.can_edit ? "translate-x-5" : "translate-x-1"
                              }`}
                          />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 select-none">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Role Management
          </h2>

          <div className="flex items-center gap-2">
            {canEditMembers && (
              <Button onClick={handleOpenCreate} className="gap-2 h-10 px-4" size="default">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add User</span>
              </Button>
            )}

            <button
              onClick={fetchSubAccounts}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm h-10 transition-colors shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span className="font-medium">Refresh</span>
            </button>
          </div>
        </div>
        <p className="text-gray-500">Manage users and access permissions in your organization</p>
      </div>

      {/* Search and Filters */}
      <Card className="mb-4">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1 select-none w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Search username or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 select-text h-10"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 select-none"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Member List</CardTitle>
          <CardDescription>{filteredAccounts.length} members found</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No members found</p>
              <p className="text-sm">Click "Add User" to create a new one</p>
            </div>
          ) : (
            <Table className="border-collapse table-fixed w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">Username</TableHead>
                  <TableHead className="w-[20%]">Email</TableHead>
                  <TableHead className="w-[20%]">Role</TableHead>
                  <TableHead className="w-[20%]">Status</TableHead>
                  <TableHead className="w-[20%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium text-slate-900">
                      {account.username}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {account.email}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {account.role || "User"}
                    </TableCell>
                    <TableCell>
                      {account.is_active ? (
                        <Badge
                          variant="outline"
                          className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-[10px] sm:text-xs transition-all"
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 text-[10px] sm:text-xs transition-all"
                        >
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEditMembers ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenChangePassword(account)}>
                              <Lock className="h-4 w-4 mr-2" />
                              Change Password
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenEdit(account)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit Permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(account)}>
                              {account.is_active ? (
                                <>
                                  <Pause className="h-4 w-4 mr-2" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-2" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleOpenDelete(account)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-not-allowed opacity-50 pointer-events-auto" disabled>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new user account and set their access permissions</DialogDescription>
          </DialogHeader>
          {renderForm(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update information and access permissions for {selectedAccount?.username}</DialogDescription>
          </DialogHeader>
          {renderForm(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Modal */}
      <Dialog open={showChangePasswordModal} onOpenChange={setShowChangePasswordModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Set a new password for {selectedAccount?.username}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{formError}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={passwordForm.password}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const confirmInput = document.getElementById("confirm-password");
                      if (confirmInput) {
                        (confirmInput as HTMLInputElement).focus();
                      }
                    }
                  }}
                  placeholder="Enter new password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleChangePassword();
                    }
                  }}
                  placeholder="Confirm new password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangePasswordModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={saving}>
              {saving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user <strong>{selectedAccount?.username}</strong>? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
}
