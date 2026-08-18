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
  Grid,
  List,
  Sparkles,
  Check,
  Copy,
  ShieldCheck,
  CheckSquare,
  Square,
  UserCheck,
  UserX,
  SlidersHorizontal,
  Layers,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/auth-context";
import { isAdmin } from "@/lib/auth";
import { cn } from "@/lib/utils";

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
  { id: "dashboard", label: "Dashboard", description: "View and manage system dashboard" },
  { id: "camera_inventory", label: "Camera Inventory", description: "Manage cameras and device configurations" },
  { id: "health", label: "System Health", description: "Monitor system health and server loads" },
  { id: "alarm_console", label: "Alarm Console", description: "Manage security alarms and notifications" },
  { id: "user_logs", label: "User Logs", description: "Audit trail and activity logs" },
  { id: "analytics", label: "Analytics", description: "View intelligent video analytics and reports" },
  { id: "storage", label: "Storage", description: "Manage storage drives and retention" },
  { id: "users", label: "User Management", description: "Manage system users and access tokens" },
];

// Default privileges (all view, no edit)
const getDefaultPrivileges = (): Privilege[] =>
  AVAILABLE_MODULES.map((m) => ({
    module: m.id,
    can_view: true,
    can_edit: false,
  }));

// Helper to get initials for avatars
const getInitials = (name: string = ""): string => {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export default function SubAccountManagement() {
  const { user } = useAuth();
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
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

      if (user?.organizations && user.organizations.length > 0) {
        const id = user.organizations[0].id || (user.organizations[0] as any).org_id;
        if (id) {
          console.log("[RoleManagement] Found orgId in context:", id);
          setOrgId(Number(id));
          return;
        }
      }

      try {
        console.log("[RoleManagement] Fetching orgId from /api/auth/me...");
        const response = await fetch("/api/auth/me");
        const data = await response.json();

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
  }, [user, isUserAdmin]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SubAccount | null>(null);
  const [modalTab, setModalTab] = useState<"general" | "permissions">("general");

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
    if (!isUserAdmin) {
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
      <div className="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6">
        <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-3">
          <Shield className="w-12 h-12 text-slate-400 opacity-70" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Limited Access</h3>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mt-1.5 text-xs sm:text-sm">
          Only administrators can manage organization user roles and module privileges.
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
    setModalTab("general");
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
          password: "",
          role: userDetail.role || account.role || "user",
          is_active: userDetail.is_active ?? account.is_active,
          privileges: AVAILABLE_MODULES.map((m) => {
            const existing = userDetail.privileges?.find((p: any) => p.module === m.id);
            return existing || { module: m.id, can_view: false, can_edit: false };
          }),
        });
        setFormError(null);
        setModalTab("general");
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
        const p = newPrivileges[existingIdx];
        newPrivileges[existingIdx] = {
          ...p,
          [field]: value,
          ...(field === "can_edit" && value ? { can_view: true } : {}),
          ...(field === "can_view" && !value ? { can_edit: false } : {}),
        };
      } else {
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

  // Batch permission shortcuts
  const handleSetAllPrivileges = (type: "all_view" | "all_edit" | "none") => {
    setFormData((prev) => ({
      ...prev,
      privileges: AVAILABLE_MODULES.map((m) => ({
        module: m.id,
        can_view: type === "all_view" || type === "all_edit",
        can_edit: type === "all_edit",
      })),
    }));
  };

  // Create sub-account
  const handleCreate = async () => {
    setSaving(true);
    setFormError(null);

    try {
      const permissions: Record<string, "view" | "edit" | "none"> = {};
      formData.privileges.forEach((p) => {
        if (p.can_edit) permissions[p.module] = "edit";
        else if (p.can_view) permissions[p.module] = "view";
        else permissions[p.module] = "none";
      });

      if (orgId === null) {
        setFormError("Organization ID is not available.");
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
      const permissions: Record<string, "view" | "edit" | "none"> = {};
      formData.privileges.forEach((p) => {
        if (p.can_edit) permissions[p.module] = "edit";
        else if (p.can_view) permissions[p.module] = "view";
        else permissions[p.module] = "none";
      });

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
      const detailResponse = await fetch(`/api/users/${account.id}`);
      const detailData = await detailResponse.json();

      if (!detailData.success) {
        setError(detailData.message || "Failed to fetch user details");
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
        is_active: account.is_active ? 0 : 1,
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

  // Filter accounts by search & role & status
  const filteredAccounts = subAccounts.filter((account) => {
    const matchesSearch =
      account.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === "all" || (account.role || "user").toLowerCase() === filterRole.toLowerCase();
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && account.is_active) ||
      (filterStatus === "inactive" && !account.is_active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Calculate statistics
  const roleStats = {
    total: subAccounts.length,
    admins: subAccounts.filter((a) => (a.role || "").toLowerCase() === "admin").length,
    users: subAccounts.filter((a) => (a.role || "").toLowerCase() !== "admin").length,
    active: subAccounts.filter((a) => a.is_active).length,
    inactive: subAccounts.filter((a) => !a.is_active).length,
  };

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

  // Count active privileges for a sub-account
  const getGrantedPrivilegesCount = (privileges: Privilege[] = []) => {
    const viewCount = privileges.filter((p) => p.can_view).length;
    const editCount = privileges.filter((p) => p.can_edit).length;
    return { viewCount, editCount };
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Global Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800 select-none">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Role Management
            </h1>
            <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800">
              <Sparkles className="w-3 h-3 mr-1 text-purple-500" /> Granular Access
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage organization members, assign roles, and define module-level view & edit permissions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {canEditMembers && (
            <Button
              onClick={handleOpenCreate}
              className="gap-2 h-10 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-md shadow-purple-500/20 transition-all active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              <span className="font-semibold text-xs sm:text-sm">Add Member</span>
            </Button>
          )}

          <Button
            onClick={fetchSubAccounts}
            disabled={loading}
            variant="outline"
            className="gap-2 h-10 px-3.5 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 shadow-sm transition-all"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? "animate-spin text-purple-600" : ""}`} />
            <span className="hidden sm:inline font-medium text-xs sm:text-sm">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {/* Total Members */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Members</span>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:scale-110 transition-transform">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-50">{roleStats.total}</span>
            <span className="text-xs text-slate-400">users</span>
          </div>
        </div>

        {/* Admins */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 border border-purple-100 dark:border-purple-950/50 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">Admins</span>
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
              <Shield className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-purple-600 dark:text-purple-400">{roleStats.admins}</span>
            <span className="text-xs text-purple-400/80">
              {roleStats.total > 0 ? Math.round((roleStats.admins / roleStats.total) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* Standard Users */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 border border-blue-100 dark:border-blue-950/50 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Users</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
              <UserPlus className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">{roleStats.users}</span>
            <span className="text-xs text-blue-400/80">
              {roleStats.total > 0 ? Math.round((roleStats.users / roleStats.total) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* Active Members */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 border border-emerald-100 dark:border-emerald-950/50 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Active</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{roleStats.active}</span>
            <span className="text-xs text-emerald-400/80">active</span>
          </div>
        </div>

        {/* Inactive Members */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Inactive</span>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:scale-110 transition-transform">
              <UserX className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-600 dark:text-slate-400">{roleStats.inactive}</span>
            <span className="text-xs text-slate-400">disabled</span>
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filters & View Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by username or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-9 h-10 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 justify-between lg:justify-end overflow-x-auto pb-1 lg:pb-0">
          {/* Role & Status Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800">
            <button
              onClick={() => {
                setFilterRole("all");
                setFilterStatus("all");
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
                filterRole === "all" && filterStatus === "all"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              All ({subAccounts.length})
            </button>
            <button
              onClick={() => setFilterRole("admin")}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 whitespace-nowrap",
                filterRole === "admin"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <Shield className="h-3 w-3" /> Admins ({roleStats.admins})
            </button>
            <button
              onClick={() => setFilterRole("user")}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 whitespace-nowrap",
                filterRole === "user"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <UserPlus className="h-3 w-3" /> Users ({roleStats.users})
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800 shrink-0">
            <button
              onClick={() => setViewMode("table")}
              title="Table View"
              className={cn(
                "p-1.5 rounded-lg transition-all text-slate-500",
                viewMode === "table" ? "bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm" : "hover:text-slate-900"
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              title="Card Grid View"
              className={cn(
                "p-1.5 rounded-lg transition-all text-slate-500",
                viewMode === "grid" ? "bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm" : "hover:text-slate-900"
              )}
            >
              <Grid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 rounded-2xl text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSubAccounts} className="rounded-xl border-red-200 hover:bg-red-100 text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {/* Member List Content */}
      {!loading && !error && (
        <>
          {filteredAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center p-6">
              <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-3">
                <Users className="h-10 w-10 opacity-70" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No members found</h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                {searchTerm ? "No organization member matches your search filter." : "Click 'Add Member' to create a new organization user."}
              </p>
              {canEditMembers && !searchTerm && (
                <Button onClick={handleOpenCreate} className="mt-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs gap-1.5">
                  <Plus className="h-4 w-4" /> Add First Member
                </Button>
              )}
            </div>
          ) : viewMode === "table" ? (
            /* TABLE VIEW */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80 dark:bg-slate-950/80">
                    <TableRow className="border-b border-slate-200/80 dark:border-slate-800">
                      <TableHead className="w-[50px] text-xs font-semibold text-slate-500">#</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 min-w-[180px]">Member Name</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 min-w-[200px]">Email Address</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Role</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 hidden sm:table-cell">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 hidden lg:table-cell">Module Permissions</TableHead>
                      <TableHead className="w-[70px] text-right text-xs font-semibold text-slate-500">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account, index) => {
                      const isAdminRole = (account.role || "").toLowerCase() === "admin";
                      const { viewCount, editCount } = getGrantedPrivilegesCount(account.privileges);
                      return (
                        <TableRow key={account.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/60 transition-colors">
                          <TableCell className="font-medium text-slate-400 text-xs">{index + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 border border-slate-200 dark:border-slate-700 shadow-xs">
                                <AvatarFallback
                                  className={cn(
                                    "text-white font-bold text-xs bg-gradient-to-br",
                                    isAdminRole ? "from-purple-600 to-indigo-700" : "from-blue-500 to-cyan-600"
                                  )}
                                >
                                  {getInitials(account.username)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate block">
                                {account.username}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                              <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{account.email || "-"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {isAdminRole ? (
                              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800 text-[10px] font-semibold gap-1 py-0.5 px-2 rounded-lg">
                                <Shield className="h-3 w-3 text-purple-600" /> Admin
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 text-[10px] font-semibold gap-1 py-0.5 px-2 rounded-lg">
                                <UserPlus className="h-3 w-3 text-blue-600" /> User
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {account.is_active ? (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 text-[11px] font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[11px] font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Inactive
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {isAdminRole ? (
                              <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-medium">
                                Full System Access
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                  {viewCount} View
                                </Badge>
                                {editCount > 0 && (
                                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                    {editCount} Edit
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canEditMembers ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44 rounded-xl">
                                  <DropdownMenuItem onClick={() => handleOpenChangePassword(account)} className="rounded-lg text-xs gap-2">
                                    <Lock className="h-3.5 w-3.5 text-slate-500" />
                                    <span>Change Password</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleOpenEdit(account)} className="rounded-lg text-xs gap-2">
                                    <Pencil className="h-3.5 w-3.5 text-purple-500" />
                                    <span>Edit Permissions</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleToggleStatus(account)} className="rounded-lg text-xs gap-2">
                                    {account.is_active ? (
                                      <>
                                        <Pause className="h-3.5 w-3.5 text-amber-500" />
                                        <span>Deactivate Account</span>
                                      </>
                                    ) : (
                                      <>
                                        <Play className="h-3.5 w-3.5 text-emerald-500" />
                                        <span>Activate Account</span>
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleOpenDelete(account)}
                                    className="rounded-lg text-xs gap-2 text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/40"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Delete Member</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-40 cursor-not-allowed" disabled>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            /* CARD GRID VIEW */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredAccounts.map((account) => {
                const isAdminRole = (account.role || "").toLowerCase() === "admin";
                const { viewCount, editCount } = getGrantedPrivilegesCount(account.privileges);
                return (
                  <div
                    key={account.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between group"
                  >
                    <div>
                      {/* Top Bar */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700 shadow-xs">
                            <AvatarFallback
                              className={cn(
                                "text-white font-bold text-sm bg-gradient-to-br",
                                isAdminRole ? "from-purple-600 to-indigo-700" : "from-blue-500 to-cyan-600"
                              )}
                            >
                              {getInitials(account.username)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{account.username}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{account.email}</p>
                          </div>
                        </div>

                        {isAdminRole ? (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 text-[10px] font-semibold gap-1 py-0.5 px-2 rounded-lg shrink-0">
                            <Shield className="h-3 w-3 text-purple-600" /> Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 text-[10px] font-semibold gap-1 py-0.5 px-2 rounded-lg shrink-0">
                            <UserPlus className="h-3 w-3 text-blue-600" /> User
                          </Badge>
                        )}
                      </div>

                      {/* Body Info */}
                      <div className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-slate-400">Account Status</span>
                          {account.is_active ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 text-[11px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-400 text-[11px]">
                              Inactive
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Privileges</span>
                          {isAdminRole ? (
                            <span className="font-semibold text-purple-600 text-[11px]">Full System Admin</span>
                          ) : (
                            <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                              {viewCount} Modules Viewable
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenChangePassword(account)}
                        className="h-8 px-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg gap-1"
                      >
                        <Lock className="h-3.5 w-3.5" /> Password
                      </Button>

                      {canEditMembers && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(account)}
                            className="h-8 px-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg gap-1"
                          >
                            <Pencil className="h-3.5 w-3.5 text-purple-500" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDelete(account)}
                            className="h-8 px-2.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg gap-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* CREATE & EDIT MEMBER MODAL */}
      <Dialog
        open={showCreateModal || showEditModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateModal(false);
            setShowEditModal(false);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] p-0 rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl flex flex-col">
          {/* Top Banner Header */}
          <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-purple-950 text-white flex items-start justify-between relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-white/10 backdrop-blur-md">
                  {showEditModal ? <Pencil className="h-5 w-5 text-purple-400" /> : <UserPlus className="h-5 w-5 text-purple-400" />}
                </div>
                <DialogTitle className="text-lg sm:text-xl font-extrabold text-white">
                  {showEditModal ? `Edit Member: ${selectedAccount?.username}` : "Add New Member"}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-300 mt-1.5">
                Set up account credentials, organizational role, and module-specific access rights.
              </DialogDescription>
            </div>
          </div>

          {/* Modal Content Body */}
          <div className="p-4 sm:p-6 flex-1 overflow-y-auto custom-scrollbar">
            {formError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <Tabs value={modalTab} onValueChange={(val: any) => setModalTab(val)} className="w-full">
              <TabsList className="grid grid-cols-2 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl mb-4 h-auto">
                <TabsTrigger value="general" className="text-xs py-2 rounded-lg font-semibold gap-1.5">
                  <Users className="h-3.5 w-3.5" /> General Information
                </TabsTrigger>
                <TabsTrigger value="permissions" className="text-xs py-2 rounded-lg font-semibold gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Module Access Permissions
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: GENERAL INFO */}
              <TabsContent value="general" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="username" className="text-xs font-semibold">Username *</Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
                      placeholder="johndoe"
                      className="h-10 rounded-xl text-xs sm:text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-semibold">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="john@example.com"
                      className="h-10 rounded-xl text-xs sm:text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="role" className="text-xs font-semibold">Organizational Role *</Label>
                    <select
                      id="role"
                      value={formData.role}
                      onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
                      className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs sm:text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 transition-all shadow-xs"
                    >
                      <option value="admin">Administrator (Full Access)</option>
                      <option value="user">Standard User (Granular Access)</option>
                    </select>
                  </div>

                  {!showEditModal && (
                    <div className="space-y-1.5">
                      <Label htmlFor="password" className="text-xs font-semibold">Password *</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={formData.password}
                          onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                          placeholder="Enter account password"
                          className="h-10 rounded-xl text-xs sm:text-sm pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-slate-400"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Account Active Toggle */}
                {showEditModal && (
                  <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_active" className="text-xs font-semibold text-slate-900 dark:text-slate-100 cursor-pointer">
                        Account Active Status
                      </Label>
                      <p className="text-[11px] text-slate-500">Deactivated accounts cannot log into the organization portal.</p>
                    </div>
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active}
                      onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>
                )}
              </TabsContent>

              {/* TAB 2: MODULE ACCESS PERMISSIONS */}
              <TabsContent value="permissions" className="space-y-3 mt-0">
                {formData.role === "admin" ? (
                  <div className="p-4 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 text-purple-800 dark:text-purple-300 text-xs flex items-center gap-2">
                    <Shield className="h-4 w-4 shrink-0 text-purple-600" />
                    <span>Administrators automatically possess full View and Edit access to all system modules.</span>
                  </div>
                ) : (
                  <>
                    {/* Batch Permission Shortcuts */}
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200/80 dark:border-slate-800">
                      <span className="text-[11px] font-semibold text-slate-500">Permission Quick Actions:</span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetAllPrivileges("all_view")}
                          className="h-7 px-2 text-[11px] text-blue-600 hover:bg-blue-50"
                        >
                          Grant All View
                        </Button>
                        <span className="text-slate-300">|</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetAllPrivileges("all_edit")}
                          className="h-7 px-2 text-[11px] text-purple-600 hover:bg-purple-50"
                        >
                          Grant All Edit
                        </Button>
                        <span className="text-slate-300">|</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetAllPrivileges("none")}
                          className="h-7 px-2 text-[11px] text-slate-500 hover:bg-slate-100"
                        >
                          Revoke All
                        </Button>
                      </div>
                    </div>

                    {/* Module Table */}
                    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
                      <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-950">
                          <TableRow>
                            <TableHead className="text-xs font-semibold text-slate-500">Module</TableHead>
                            <TableHead className="w-[80px] text-center text-xs font-semibold text-slate-500">View</TableHead>
                            <TableHead className="w-[80px] text-center text-xs font-semibold text-slate-500">Edit</TableHead>
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
                              <TableRow key={module.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                <TableCell className="py-2.5">
                                  <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 block">{module.label}</span>
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">{module.description}</span>
                                </TableCell>
                                <TableCell className="text-center py-2.5">
                                  <button
                                    type="button"
                                    onClick={() => updatePrivilege(module.id, "can_view", !privilege.can_view)}
                                    className={cn(
                                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors select-none",
                                      privilege.can_view ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow-xs",
                                        privilege.can_view ? "translate-x-5" : "translate-x-1"
                                      )}
                                    />
                                  </button>
                                </TableCell>
                                <TableCell className="text-center py-2.5">
                                  <button
                                    type="button"
                                    onClick={() => updatePrivilege(module.id, "can_edit", !privilege.can_edit)}
                                    className={cn(
                                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors select-none",
                                      privilege.can_edit ? "bg-purple-600" : "bg-slate-300 dark:bg-slate-700"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow-xs",
                                        privilege.can_edit ? "translate-x-5" : "translate-x-1"
                                      )}
                                    />
                                  </button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setShowEditModal(false);
                resetForm();
              }}
              disabled={saving}
              className="h-9 px-4 rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={showEditModal ? handleUpdate : handleCreate}
              disabled={saving}
              className="h-9 px-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Saving...
                </>
              ) : showEditModal ? (
                "Save Changes"
              ) : (
                "Create Member"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CHANGE PASSWORD MODAL */}
      <Dialog open={showChangePasswordModal} onOpenChange={setShowChangePasswordModal}>
        <DialogContent className="max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                <Lock className="h-4 w-4" />
              </div>
              <DialogTitle className="text-lg font-bold">Change Password</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Set a new password for member <strong className="text-slate-900 dark:text-slate-100">{selectedAccount?.username}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {formError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-600 rounded-xl flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs font-semibold">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={passwordForm.password}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="At least 6 characters"
                  className="h-10 rounded-xl text-xs pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-slate-400"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs font-semibold">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleChangePassword();
                  }}
                  placeholder="Confirm new password"
                  className="h-10 rounded-xl text-xs pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-slate-400"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowChangePasswordModal(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold">
              {saving ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="rounded-2xl border border-slate-200 dark:border-slate-800">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <AlertDialogTitle className="text-lg font-bold">Delete Member Account?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2">
              Are you sure you want to remove member <strong className="text-slate-900 dark:text-slate-100">{selectedAccount?.username}</strong> from this organization? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="rounded-xl text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold">
              Delete Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}