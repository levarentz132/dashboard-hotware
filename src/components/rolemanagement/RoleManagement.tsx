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
  Play,
  EyeOff,
  Eye,
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
  { id: "dashboard", label: "Dashboard", description: "Lihat dan kelola dashboard" },
  { id: "camera_inventory", label: "Camera Inventory", description: "Kelola kamera dan perangkat" },
  { id: "health", label: "System Health", description: "Monitor kesehatan sistem" },
  { id: "alarm_console", label: "Alarm Console", description: "Kelola alarm dan notifikasi" },
  { id: "user_logs", label: "User Logs", description: "Lihat log aktivitas pengguna" },
  { id: "analytics", label: "Analytics", description: "Lihat analitik dan laporan" },
  { id: "storage", label: "Storage", description: "Kelola penyimpanan" },
  { id: "users", label: "User Management", description: "Kelola pengguna NX System" },
];

// Default privileges (all view, no edit)
const getDefaultPrivileges = (): Privilege[] =>
  AVAILABLE_MODULES.map((m) => ({
    module: m.id,
    can_view: true,
    can_edit: false,
  }));

export default function SubAccountManagement() {
  const { user } = useAuth();
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [orgId, setOrgId] = useState<number | null>(null);

  // Check if user is admin
  const isAdmin = user?.role === "admin";

  // Fetch organization ID if not available in context
  useEffect(() => {
    const getOrgId = async () => {
      if (!isAdmin) {
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
          setError("Gagal mendapatkan data organisasi dari server.");
          setLoading(false);
        }
      } catch (err) {
        console.error("[RoleManagement] Error fetching organization data:", err);
        setError("Gagal terhubung ke server untuk mendapatkan data organisasi.");
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
        setError(data.message || "Gagal mengambil data sub-akun");
      }
    } catch (err) {
      console.error("Error fetching sub-accounts:", err);
      setError("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchSubAccounts();
    }
  }, [fetchSubAccounts, isAdmin]);

  // If not admin, don't show the management UI
  if (!isAdmin && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Shield className="w-16 h-16 text-slate-300 mb-4" />
        <h3 className="text-xl font-semibold text-slate-900">Akses Terbatas</h3>
        <p className="text-slate-500 max-w-md mt-2">
          Hanya administrator yang dapat mengelola akun pengguna dan perizinan.
          Silakan hubungi admin sistem Anda untuk bantuan.
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
          privileges: userDetail.privileges?.length > 0 ? userDetail.privileges : getDefaultPrivileges(),
        });
        setFormError(null);
        setShowEditModal(true);
      } else {
        setError(data.message || "Gagal mengambil detail pengguna");
      }
    } catch (err) {
      console.error("Error fetching user details:", err);
      setError("Gagal terhubung ke server untuk mengambil detail pengguna");
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
    setFormData((prev) => ({
      ...prev,
      privileges: prev.privileges.map((p) =>
        p.module === moduleId
          ? {
            ...p,
            [field]: value,
            // If removing view, also remove edit
            ...(field === "can_view" && !value ? { can_edit: false } : {}),
          }
          : p,
      ),
    }));
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
        setFormError(data.message || "Gagal membuat pengguna baru");
      }
    } catch (err) {
      console.error("Error creating user:", err);
      setFormError("Gagal terhubung ke server");
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
        setFormError(data.message || "Gagal memperbarui pengguna");
      }
    } catch (err) {
      console.error("Error updating user:", err);
      setFormError("Gagal terhubung ke server");
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
        setError(data.message || "Gagal mengubah status pengguna");
      }
    } catch (err) {
      console.error("Error toggling status:", err);
      setError("Gagal terhubung ke server");
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
        setError(data.message || "Gagal menghapus sub-akun");
      }
    } catch (err) {
      console.error("Error deleting sub-account:", err);
      setError("Gagal terhubung ke server");
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
    return new Date(dateStr).toLocaleDateString("id-ID", {
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
        <h4 className="font-medium text-gray-900">Informasi Akun</h4>

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

          <div className="space-y-2">
            <Label htmlFor="password">Password {isEdit ? "" : "*"}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                placeholder={isEdit ? "••••••••" : "Masukkan password"}
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
        </div>
      </div>

      {/* Privileges - Hidden for Admin */}
      {formData.role !== "admin" && (
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h4 className="font-medium text-gray-900">Hak Akses</h4>
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
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${privilege.can_view ? "bg-blue-600" : "bg-slate-300"
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
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${privilege.can_edit ? "bg-blue-600" : "bg-slate-300"
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-7 h-7 text-blue-600" />
            Role Management
          </h2>
          <p className="text-gray-500 mt-1">Manage users and access permissions in your organization</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchSubAccounts} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Member
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search username or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

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
              <p className="text-sm">Click "Tambah Pengguna" to create a new one</p>
            </div>
          ) : (
            <Table className="border-collapse">
              <TableHeader className="bg-[#343f4b] hover:bg-[#343f4b]">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="text-white font-bold uppercase tracking-wider py-4">Username</TableHead>
                  <TableHead className="text-white font-bold uppercase tracking-wider py-4">Email</TableHead>
                  <TableHead className="text-white font-bold uppercase tracking-wider py-4 text-center">Role</TableHead>
                  <TableHead className="text-white font-bold uppercase tracking-wider py-4 text-center">Status</TableHead>
                  <TableHead className="text-white font-bold uppercase tracking-wider py-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="py-4">
                      <span className="font-bold text-slate-800">{account.username}</span>
                    </TableCell>
                    <TableCell className="py-4 text-slate-500">
                      {account.email}
                    </TableCell>
                    <TableCell className="py-4 text-center text-slate-600">
                      {account.role || "User"}
                    </TableCell>
                    <TableCell className="py-4 text-center">
                      {account.is_active ? (
                        <Badge variant="outline" className="bg-[#d1fadf] text-[#027a48] border-none rounded-full px-4 py-1 font-bold uppercase text-[10px] tracking-widest shadow-sm">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-100 text-red-700 border-none rounded-full px-4 py-1 font-bold uppercase text-[10px] tracking-widest shadow-sm">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex justify-start gap-2 pl-4">
                        {/* Edit Action (Key icon as per mockup) */}
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-9 w-9 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg shadow-sm border border-slate-200 transition-all duration-200"
                          onClick={() => handleOpenEdit(account)}
                          title="Permissions / Edit"
                        >
                          <Key className="w-4 h-4" />
                        </Button>

                        {/* Toggle Action (Pause icon as per mockup) */}
                        <Button
                          size="icon"
                          className={`h-9 w-9 rounded-lg shadow-md transition-all duration-200 ${account.is_active
                            ? "bg-[#e28a0d] hover:bg-[#c97b0a] text-white"
                            : "bg-[#027a48] hover:bg-[#02663c] text-white"
                            }`}
                          onClick={() => handleToggleStatus(account)}
                          title={account.is_active ? "Deactivate" : "Activate"}
                        >
                          {account.is_active ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
                        </Button>

                        {/* Delete Action (Red icon as per mockup) */}
                        <Button
                          size="icon"
                          className="h-9 w-9 bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded-lg shadow-md transition-all duration-200"
                          onClick={() => handleOpenDelete(account)}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 fill-white" />
                        </Button>
                      </div>
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
            <DialogTitle>Tambah Pengguna Baru</DialogTitle>
            <DialogDescription>Buat akun pengguna baru dan atur hak aksesnya</DialogDescription>
          </DialogHeader>
          {renderForm(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Batal
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Pengguna</DialogTitle>
            <DialogDescription>Perbarui informasi dan hak akses untuk {selectedAccount?.username}</DialogDescription>
          </DialogHeader>
          {renderForm(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Batal
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Pengguna?</AlertDialogTitle>
            <AlertDialogDescription>
              Anda yakin ingin menghapus akun <strong>{selectedAccount?.username}</strong>? Tindakan ini tidak dapat
              dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
