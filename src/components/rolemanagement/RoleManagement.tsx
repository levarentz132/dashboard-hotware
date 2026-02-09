"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  AlertCircle,
  Shield,
  UserPlus,
  X,
  Pause,
  Play,
  EyeOff,
  Eye,
  Settings2,
  UserCheck,
  UserX,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Mail,
  User,
  Lock,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  { id: "dashboard", label: "Dashboard", description: "Lihat dan kelola dashboard", icon: "📊" },
  { id: "camera_inventory", label: "Camera Inventory", description: "Kelola kamera dan perangkat", icon: "📹" },
  { id: "health", label: "System Health", description: "Monitor kesehatan sistem", icon: "💚" },
  { id: "alarm_console", label: "Alarm Console", description: "Kelola alarm dan notifikasi", icon: "🔔" },
  { id: "user_logs", label: "User Logs", description: "Lihat log aktivitas pengguna", icon: "📋" },
  { id: "analytics", label: "Analytics", description: "Lihat analitik dan laporan", icon: "📈" },
  { id: "storage", label: "Storage", description: "Kelola penyimpanan", icon: "💾" },
  { id: "users", label: "User Management", description: "Kelola pengguna NX System", icon: "👥" },
];

// Default privileges (all view, no edit)
const getDefaultPrivileges = (): Privilege[] =>
  AVAILABLE_MODULES.map((m) => ({
    module: m.id,
    can_view: true,
    can_edit: false,
  }));

// Stats Card Component
function StatsCard({
  title,
  value,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variants = {
    default: "bg-slate-50 border-slate-200 text-slate-600",
    success: "bg-emerald-50 border-emerald-200 text-emerald-600",
    warning: "bg-amber-50 border-amber-200 text-amber-600",
    danger: "bg-red-50 border-red-200 text-red-600",
  };

  const iconVariants = {
    default: "bg-slate-100 text-slate-600",
    success: "bg-emerald-100 text-emerald-600",
    warning: "bg-amber-100 text-amber-600",
    danger: "bg-red-100 text-red-600",
  };

  return (
    <Card className={`${variants[variant]} border`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${iconVariants[variant]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm opacity-80">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SubAccountManagement() {
  const { user } = useAuth();
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [orgId, setOrgId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("all");

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

        const id =
          data.organization?.id ||
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
  }, [user, isAdmin, loading]);

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

  // Computed stats
  const stats = useMemo(() => {
    const total = subAccounts.length;
    const active = subAccounts.filter((a) => a.is_active).length;
    const inactive = total - active;
    const admins = subAccounts.filter((a) => a.role === "admin").length;
    return { total, active, inactive, admins };
  }, [subAccounts]);

  // If not admin, don't show the management UI
  if (!isAdmin && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
          <Shield className="w-10 h-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900">Akses Terbatas</h3>
        <p className="text-slate-500 max-w-md mt-2">
          Hanya administrator yang dapat mengelola akun pengguna dan perizinan. Silakan hubungi admin sistem Anda untuk
          bantuan.
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
          password: "",
          role: userDetail.role || account.role || "user",
          is_active: userDetail.is_active ?? account.is_active,
          privileges: AVAILABLE_MODULES.map((m) => {
            const existing = userDetail.privileges?.find((p: Privilege) => p.module === m.id);
            return existing || { module: m.id, can_view: false, can_edit: false };
          }),
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
    setFormData((prev) => {
      const existingIdx = prev.privileges.findIndex((p) => p.module === moduleId);
      const newPrivileges = [...prev.privileges];

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
          can_view: field === "can_view" ? value : field === "can_edit" && value,
          can_edit: field === "can_edit" ? value : false,
        });
      }

      return { ...prev, privileges: newPrivileges };
    });
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

  // Toggle user status
  const handleToggleStatus = async (account: SubAccount) => {
    try {
      const detailResponse = await fetch(`/api/users/${account.id}`);
      const detailData = await detailResponse.json();

      if (!detailData.success) {
        setError(detailData.message || "Gagal mendapatkan detail pengguna");
        return;
      }

      const userDetail = detailData.user;
      const permissions: Record<string, string> = {};
      userDetail.privileges?.forEach((p: Privilege) => {
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

  // Filter accounts by search and tab
  const filteredAccounts = useMemo(() => {
    return subAccounts.filter((account) => {
      const matchesSearch =
        account.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        account.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesTab =
        activeTab === "all" ||
        (activeTab === "active" && account.is_active) ||
        (activeTab === "inactive" && !account.is_active);

      return matchesSearch && matchesTab;
    });
  }, [subAccounts, searchTerm, activeTab]);

  // Get user initials for avatar
  const getInitials = (username: string) => {
    return username
      .split(/[\s_-]/)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Form component (reused for create and edit)
  const renderForm = (isEdit: boolean) => (
    <ScrollArea className="max-h-[65vh] pr-4">
      <div className="space-y-6 pb-4">
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{formError}</span>
          </div>
        )}

        {/* Account Information Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <User className="w-4 h-4 text-blue-600" />
            <h4 className="font-semibold">Informasi Akun</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-700">
                Username <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="johndoe"
                  className="pl-10 h-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700">
                Email <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="john@example.com"
                  className="pl-10 h-11"
                />
              </div>
            </div>
          </div>

          <div className={`grid gap-4 ${isEdit ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="role" className="text-slate-700">
                Role <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      <span>Admin</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-600" />
                      <span>User</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!isEdit && (
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700">
                  Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Masukkan password"
                    className="pl-10 pr-10 h-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Privileges Section - Hidden for Admin */}
        {formData.role !== "admin" && (
          <>
            <Separator />

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Shield className="w-4 h-4 text-blue-600" />
                <h4 className="font-semibold">Hak Akses Modul</h4>
              </div>
              <p className="text-sm text-slate-500">
                Atur akses untuk setiap modul. &quot;View&quot; untuk melihat, &quot;Edit&quot; untuk mengubah data.
              </p>

              <div className="bg-slate-50 rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100 hover:bg-slate-100 border-0">
                      <TableHead className="w-[50%] font-semibold">Modul</TableHead>
                      <TableHead className="text-center font-semibold">View</TableHead>
                      <TableHead className="text-center font-semibold">Edit</TableHead>
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
                        <TableRow key={module.id} className="hover:bg-slate-100/50 border-0">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className="text-lg">{module.icon}</span>
                              <div>
                                <p className="font-medium text-slate-900">{module.label}</p>
                                <p className="text-xs text-slate-500">{module.description}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={privilege.can_view}
                              onCheckedChange={(checked) => updatePrivilege(module.id, "can_view", checked)}
                              className="data-[state=checked]:bg-blue-600"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={privilege.can_edit}
                              onCheckedChange={(checked) => updatePrivilege(module.id, "can_edit", checked)}
                              className="data-[state=checked]:bg-emerald-600"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}

        {formData.role === "admin" && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <ShieldCheck className="w-5 h-5 text-amber-600" />
            <p className="text-sm text-amber-800">
              Admin memiliki akses penuh ke semua modul. Pengaturan hak akses tidak diperlukan.
            </p>
          </div>
        )}
      </div>
    </ScrollArea>
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Settings2 className="w-6 h-6 text-blue-600" />
              </div>
              Role Management
            </h2>
            <p className="text-slate-500 mt-1 ml-12">Kelola pengguna dan hak akses dalam organisasi Anda</p>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={fetchSubAccounts} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Muat ulang</TooltipContent>
            </Tooltip>

            <Button onClick={handleOpenCreate} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Tambah Pengguna
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Total Pengguna" value={stats.total} icon={Users} />
          <StatsCard title="Aktif" value={stats.active} icon={UserCheck} variant="success" />
          <StatsCard title="Nonaktif" value={stats.inactive} icon={UserX} variant="danger" />
          <StatsCard title="Admin" value={stats.admins} icon={ShieldCheck} variant="warning" />
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Content Card */}
        <Card className="border-slate-200">
          <CardHeader className="border-b bg-slate-50/50">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Daftar Pengguna</CardTitle>
                <CardDescription>
                  {filteredAccounts.length} dari {subAccounts.length} pengguna
                </CardDescription>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
                  <TabsList className="grid grid-cols-3 w-full sm:w-auto">
                    <TabsTrigger value="all" className="gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Semua</span>
                    </TabsTrigger>
                    <TabsTrigger value="active" className="gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Aktif</span>
                    </TabsTrigger>
                    <TabsTrigger value="inactive" className="gap-1.5">
                      <UserX className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Nonaktif</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Search */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Cari username atau email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))}
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-1">Tidak ada pengguna</h3>
                <p className="text-slate-500 mb-4">
                  {searchTerm
                    ? "Tidak ada hasil untuk pencarian Anda"
                    : 'Klik "Tambah Pengguna" untuk membuat akun baru'}
                </p>
                {!searchTerm && (
                  <Button onClick={handleOpenCreate} variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Tambah Pengguna Pertama
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-100 hover:bg-slate-100 border-0">
                    <TableHead className="text-slate-700 font-semibold w-[25%]">Pengguna</TableHead>
                    <TableHead className="text-slate-700 font-semibold w-[30%]">Email</TableHead>
                    <TableHead className="text-slate-700 font-semibold text-center w-[15%]">Role</TableHead>
                    <TableHead className="text-slate-700 font-semibold text-center w-[15%]">Status</TableHead>
                    <TableHead className="text-slate-700 font-semibold text-center w-[15%]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => (
                    <TableRow key={account.id} className="group hover:bg-slate-50 border-0">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border-2 border-slate-200">
                            <AvatarFallback
                              className={`text-xs font-semibold ${
                                account.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {getInitials(account.username)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-slate-900">{account.username}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500">{account.email}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`${
                            account.role === "admin"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {account.role === "admin" ? (
                            <ShieldCheck className="w-3 h-3 mr-1" />
                          ) : (
                            <User className="w-3 h-3 mr-1" />
                          )}
                          {account.role || "User"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {account.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                            Aktif
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-red-100 text-red-700 border-red-200">
                            Nonaktif
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleOpenEdit(account)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${
                                  account.is_active
                                    ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                    : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                }`}
                                onClick={() => handleToggleStatus(account)}
                              >
                                {account.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{account.is_active ? "Nonaktifkan" : "Aktifkan"}</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleOpenDelete(account)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Hapus</TooltipContent>
                          </Tooltip>
                        </div>

                        {/* Mobile dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild className="lg:hidden">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenEdit(account)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(account)}>
                              {account.is_active ? (
                                <>
                                  <Pause className="w-4 h-4 mr-2" />
                                  Nonaktifkan
                                </>
                              ) : (
                                <>
                                  <Play className="w-4 h-4 mr-2" />
                                  Aktifkan
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleOpenDelete(account)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Hapus
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                Tambah Pengguna Baru
              </DialogTitle>
              <DialogDescription>Buat akun pengguna baru dan atur hak aksesnya ke berbagai modul.</DialogDescription>
            </DialogHeader>
            {renderForm(false)}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Batal
              </Button>
              <Button onClick={handleCreate} disabled={saving} className="gap-2">
                {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                Simpan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" />
                Edit Pengguna
              </DialogTitle>
              <DialogDescription>
                Perbarui informasi dan hak akses untuk <strong>{selectedAccount?.username}</strong>
              </DialogDescription>
            </DialogHeader>
            {renderForm(true)}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Batal
              </Button>
              <Button onClick={handleUpdate} disabled={saving} className="gap-2">
                {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                Simpan Perubahan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" />
                Hapus Pengguna?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Anda yakin ingin menghapus akun <strong>{selectedAccount?.username}</strong>? Tindakan ini tidak dapat
                dibatalkan dan semua data pengguna akan dihapus permanen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Ya, Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
