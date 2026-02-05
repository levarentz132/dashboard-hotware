"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Shield,
  UserPlus,
  X,
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
  full_name: string;
  is_active: boolean;
  privileges: Privilege[];
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

// Available modules for privileges
const AVAILABLE_MODULES = [
  { id: "dashboard", label: "Dashboard", description: "Lihat dan kelola dashboard" },
  { id: "cameras", label: "Camera Inventory", description: "Kelola kamera dan perangkat" },
  { id: "health", label: "System Health", description: "Monitor kesehatan sistem" },
  { id: "alarms", label: "Alarm Console", description: "Kelola alarm dan notifikasi" },
  { id: "audits", label: "User Logs", description: "Lihat log aktivitas pengguna" },
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
    full_name: "",
    is_active: true,
    privileges: getDefaultPrivileges(),
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch sub-accounts
  const fetchSubAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/subaccounts");
      const data = await response.json();

      if (data.success) {
        setSubAccounts(data.data || []);
      } else {
        setError(data.message || "Gagal mengambil data sub-akun");
      }
    } catch (err) {
      console.error("Error fetching sub-accounts:", err);
      setError("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubAccounts();
  }, [fetchSubAccounts]);

  // Reset form
  const resetForm = () => {
    setFormData({
      username: "",
      email: "",
      password: "",
      full_name: "",
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
  const handleOpenEdit = (account: SubAccount) => {
    setSelectedAccount(account);
    setFormData({
      username: account.username,
      email: account.email,
      password: "", // Don't pre-fill password
      full_name: account.full_name,
      is_active: account.is_active,
      privileges: account.privileges.length > 0 ? account.privileges : getDefaultPrivileges(),
    });
    setFormError(null);
    setShowEditModal(true);
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
      const response = await fetch("/api/subaccounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setShowCreateModal(false);
        resetForm();
        fetchSubAccounts();
      } else {
        setFormError(data.message || "Gagal membuat sub-akun");
      }
    } catch (err) {
      console.error("Error creating sub-account:", err);
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
      // Only include password if it's been changed
      const updateData = {
        ...formData,
        password: formData.password || undefined,
      };

      const response = await fetch(`/api/subaccounts/${selectedAccount.id}`, {
        method: "PUT",
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
        setFormError(data.message || "Gagal memperbarui sub-akun");
      }
    } catch (err) {
      console.error("Error updating sub-account:", err);
      setFormError("Gagal terhubung ke server");
    } finally {
      setSaving(false);
    }
  };

  // Delete sub-account
  const handleDelete = async () => {
    if (!selectedAccount) return;

    try {
      const response = await fetch(`/api/subaccounts/${selectedAccount.id}`, {
        method: "DELETE",
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
      account.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.full_name.toLowerCase().includes(searchTerm.toLowerCase()),
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
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
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
              disabled={isEdit} // Username cannot be changed
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
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="full_name">Nama Lengkap *</Label>
          <Input
            id="full_name"
            value={formData.full_name}
            onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
            placeholder="John Doe"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password {isEdit ? "(kosongkan jika tidak ingin mengubah)" : "*"}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
              placeholder={isEdit ? "••••••••" : "Masukkan password"}
              className="pr-10"
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

        <div className="flex items-center justify-between py-2">
          <div>
            <Label htmlFor="is_active">Status Aktif</Label>
            <p className="text-sm text-gray-500">Akun dapat login jika aktif</p>
          </div>
          <button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, is_active: !prev.is_active }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              formData.is_active ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                formData.is_active ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Privileges */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          <h4 className="font-medium text-gray-900">Hak Akses</h4>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-[200px]">Modul</TableHead>
                <TableHead className="w-[100px] text-center">Lihat</TableHead>
                <TableHead className="w-[100px] text-center">Edit</TableHead>
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
                  <TableRow key={module.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{module.label}</p>
                        <p className="text-xs text-gray-500">{module.description}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={privilege.can_view}
                        onChange={(e) => updatePrivilege(module.id, "can_view", e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={privilege.can_edit}
                        disabled={!privilege.can_view}
                        onChange={(e) => updatePrivilege(module.id, "can_edit", e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-gray-500">* Hak "Edit" memerlukan hak "Lihat" terlebih dahulu</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-7 h-7 text-blue-600" />
            Sub Account Management
          </h2>
          <p className="text-gray-500 mt-1">Kelola sub-akun yang terhubung dengan akun utama Anda</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchSubAccounts} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Tambah Sub Account
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Cari username, email, atau nama..."
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
          <CardTitle>Daftar Sub Account</CardTitle>
          <CardDescription>{filteredAccounts.length} sub-akun ditemukan</CardDescription>
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
              <p>Belum ada sub-akun</p>
              <p className="text-sm">Klik tombol "Tambah Sub Account" untuk membuat yang baru</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pengguna</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Hak Akses</TableHead>
                  <TableHead>Login Terakhir</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{account.full_name}</p>
                        <p className="text-sm text-gray-500">@{account.username}</p>
                        <p className="text-xs text-gray-400">{account.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {account.is_active ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Aktif
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          <XCircle className="w-3 h-3 mr-1" />
                          Nonaktif
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {account.privileges
                          .filter((p) => p.can_view || p.can_edit)
                          .slice(0, 3)
                          .map((p) => (
                            <Badge key={p.module} variant="secondary" className="text-xs">
                              {AVAILABLE_MODULES.find((m) => m.id === p.module)?.label || p.module}
                            </Badge>
                          ))}
                        {account.privileges.filter((p) => p.can_view || p.can_edit).length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{account.privileges.filter((p) => p.can_view || p.can_edit).length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{formatDate(account.last_login)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(account)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleOpenDelete(account)}
                        >
                          <Trash2 className="w-4 h-4" />
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
            <DialogTitle>Tambah Sub Account</DialogTitle>
            <DialogDescription>Buat akun baru yang terhubung dengan akun utama Anda</DialogDescription>
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
            <DialogTitle>Edit Sub Account</DialogTitle>
            <DialogDescription>Perbarui informasi sub-akun {selectedAccount?.username}</DialogDescription>
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
            <AlertDialogTitle>Hapus Sub Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Anda yakin ingin menghapus sub-akun <strong>{selectedAccount?.username}</strong>? Tindakan ini tidak dapat
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
