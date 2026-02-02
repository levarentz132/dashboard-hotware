"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  RefreshCw,
  Users,
  User,
  Shield,
  Cloud,
  Server,
  Clock,
  Mail,
  AlertCircle,
  Filter,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Link,
  MoreHorizontal,
} from "lucide-react";
import nxAPI, { NxSystemInfo } from "@/lib/nxapi";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchUsers,
  fetchUserGroups,
  createUser as serviceCreateUser,
  updateUser as serviceUpdateUser,
  deleteUser as serviceDeleteUser,
  timeUnitToSeconds,
  secondsToTimeUnit,
} from "./user-service";
import { getCloudAuthHeader, CLOUD_CONFIG } from "@/lib/config";
import { CloudLoginDialog } from "@/components/cloud/CloudLoginDialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { showNotification } from "@/lib/notifications";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ScrollArea } from "../ui/scroll-area";

// User interface based on NX Witness API
export interface NxUser {
  id: string;
  name: string;
  fullName?: string;
  email?: string;
  type: "local" | "temporaryLocal" | "ldap" | "cloud";
  groupIds?: string[];
  isEnabled?: boolean;
  temporaryToken?: {
    startS?: number;
    endS?: number;
    expiresAfterLoginS?: number;
    token?: string;
  };
}

// User Group interface
export interface NxUserGroup {
  id: string;
  name: string;
  description?: string;
  parentGroupId?: string;
  permissions?: string[];
}

// Cloud System interface
interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
  isOnline?: boolean;
}

// Time unit type for expires after login
type TimeUnit = "minutes" | "hours" | "days";

// Form data for creating/editing users
interface UserFormData {
  name: string;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  type: "local" | "temporaryLocal" | "cloud";
  groupIds: string[];
  isEnabled: boolean;
  // Temporary user specific
  startS?: number;
  endS?: number;
  expiresAfterLoginS?: number;
  // Expires after login UI state
  expiresAfterLoginEnabled: boolean;
  expiresAfterLoginValue: number;
  expiresAfterLoginUnit: TimeUnit;
}

const initialFormData: UserFormData = {
  name: "",
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  type: "local",
  groupIds: [],
  isEnabled: true,
  startS: undefined,
  endS: undefined,
  expiresAfterLoginS: undefined,
  expiresAfterLoginEnabled: false,
  expiresAfterLoginValue: 1,
  expiresAfterLoginUnit: "days",
};

// Helper functions for time conversion (moved to service)

// Custom hook for fetching users
function useUsers(systemId?: string) {
  const [users, setUsers] = useState<NxUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);

  const fetchUsersData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setRequiresAuth(false);

      if (!systemId) {
        setUsers([]);
        setLoading(false);
        return;
      }

      const { users: data, error: err, requiresAuth: auth } = await fetchUsers(systemId);
      if (auth) {
        setRequiresAuth(true);
        setUsers([]);
      } else if (err) {
        setError(err);
        setUsers([]);
      } else {
        setUsers(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [systemId]);

  useEffect(() => {
    fetchUsersData();
  }, [fetchUsersData]);

  return { users, loading, error, requiresAuth, refetch: fetchUsersData };
}

// Custom hook for fetching user groups
function useUserGroups(systemId?: string) {
  const [groups, setGroups] = useState<NxUserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroupsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!systemId) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const { groups: data, error: err } = await fetchUserGroups(systemId);
      if (err) {
        setError(err);
        setGroups([]);
      } else {
        setGroups(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch user groups");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [systemId]);

  useEffect(() => {
    fetchGroupsData();
  }, [fetchGroupsData]);

  return { groups, loading, error, refetch: fetchGroupsData };
}

export default function UserManagement() {
  const { user: localUser } = useAuth();
  const [selectedSystemId, setSelectedSystemId] = useState<string>("");
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);

  // Cloud login state
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [loginSystemId, setLoginSystemId] = useState("");
  const [loginSystemName, setLoginSystemName] = useState("");

  const systemId = selectedSystemId;

  const { users, loading: usersLoading, error: usersError, requiresAuth, refetch: refetchUsers } = useUsers(systemId);
  const { groups, loading: groupsLoading, error: groupsError, refetch: refetchGroups } = useUserGroups(systemId);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState<Set<string>>(new Set());
  const [isLoggedIn, setIsLoggedIn] = useState<Set<string>>(new Set());

  // Fetch cloud systems
  const fetchCloudSystems = useCallback(async () => {
    setLoadingCloud(true);
    try {
      const response = await fetch("https://meta.nxvms.com/cdb/systems", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: getCloudAuthHeader(),
        },
      });

      if (!response.ok) {
        setCloudSystems([]);
        return;
      }

      const data = await response.json();
      const systems: CloudSystem[] = (data.systems || []).map((s: CloudSystem) => ({
        ...s,
        isOnline: s.stateOfHealth === "online",
      }));

      // Sort: owner first, then online systems
      systems.sort((a, b) => {
        if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
        if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return 0;
      });

      setCloudSystems(systems);
    } catch (err) {
      console.error("Error fetching cloud systems:", err);
      setCloudSystems([]);
    } finally {
      setLoadingCloud(false);
    }
  }, []);

  useEffect(() => {
    fetchCloudSystems();
  }, [fetchCloudSystems]);

  // Auto-select first online system if none selected
  useEffect(() => {
    if (!selectedSystemId && cloudSystems.length > 0) {
      const onlineSystem = cloudSystems.find((s) => s.isOnline) || cloudSystems[0];
      setSelectedSystemId(onlineSystem.id);
    }
  }, [selectedSystemId, cloudSystems]);

  // Handle system change
  const handleSystemChange = (value: string) => {
    setSelectedSystemId(value);
  };

  // Auto-login function for cloud systems using local account credentials
  const attemptAutoLogin = useCallback(
    async (targetSystemId: string, systemName: string): Promise<boolean> => {
      // Check if auto-login is enabled
      if (!CLOUD_CONFIG.autoLoginEnabled) {
        console.log("[User Cloud Auto-Login] Disabled");
        return false;
      }

      // Use local user credentials if available, otherwise fall back to config
      const username = localUser?.username || CLOUD_CONFIG.username;
      const password = CLOUD_CONFIG.password; // Password must come from config (local passwords are hashed)

      if (!username || !password) {
        console.log("[User Cloud Auto-Login] Credentials not available");
        return false;
      }

      // Check if we already attempted auto-login for this system
      if (autoLoginAttempted.has(targetSystemId)) {
        console.log(`[User Cloud Auto-Login] Already attempted for ${systemName}`);
        return false;
      }

      console.log(`[User Cloud Auto-Login] Attempting login to ${systemName} with user: ${username}...`);

      try {
        const response = await fetch("/api/cloud/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemId: targetSystemId,
            username: username,
            password: password,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(`[User Cloud Auto-Login] Failed for ${systemName}:`, data.error);
          setAutoLoginAttempted((prev) => new Set(prev).add(targetSystemId));
          return false;
        }

        console.log(`[User Cloud Auto-Login] Success for ${systemName} with user: ${username}`);
        setAutoLoginAttempted((prev) => new Set(prev).add(targetSystemId));
        setIsLoggedIn((prev) => new Set(prev).add(targetSystemId));

        // After successful login, we need to refetch users and groups
        await Promise.all([refetchUsers(), refetchGroups()]);
        return true;
      } catch (err) {
        console.error(`[User Cloud Auto-Login] Error for ${systemName}:`, err);
        setAutoLoginAttempted((prev) => new Set(prev).add(targetSystemId));
        return false;
      }
    },
    [autoLoginAttempted, refetchUsers, refetchGroups, localUser],
  );

  // Sync requiresAuth with login dialog or auto-login
  useEffect(() => {
    const handleAuth = async () => {
      if (requiresAuth && systemId) {
        const system = cloudSystems.find((s) => s.id === systemId);
        const systemName = system?.name || systemId;

        // Try auto-login first using local account credentials
        if (CLOUD_CONFIG.autoLoginEnabled && !autoLoginAttempted.has(systemId)) {
          console.log(`[UserManagement] Auth required for ${systemName}, attempting auto-login with local account...`);
          const success = await attemptAutoLogin(systemId, systemName);
          if (success) return; // Auto-login succeeded, useEffect will re-run after refetch
        }

        // Auto-login failed or not available, show dialog
        setLoginSystemId(systemId);
        setLoginSystemName(systemName);
        setShowLoginDialog(true);
      }
    };

    handleAuth();
  }, [requiresAuth, systemId, cloudSystems, autoLoginAttempted, attemptAutoLogin]);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<NxUser | null>(null);

  // Form state
  const [formData, setFormData] = useState<UserFormData>(initialFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Token copy state
  const [copiedToken, setCopiedToken] = useState(false);

  // Filter users based on search term and type
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = filterType === "all" || user.type === filterType;
    return matchesSearch && matchesType;
  });

  // Get group name by ID
  const getGroupName = (groupId: string): string => {
    const group = groups.find((g) => g.id === groupId);
    return group ? group.name : groupId.substring(0, 8) + "...";
  };

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchUsers(), refetchGroups()]);
    setIsRefreshing(false);
  };

  // Get user type icon
  const getUserTypeIcon = (type: NxUser["type"]) => {
    switch (type) {
      case "local":
        return <Users className="h-4 w-4" />;
      case "temporaryLocal":
        return <Clock className="h-4 w-4" />;
      case "ldap":
        return <Shield className="h-4 w-4" />;
      case "cloud":
        return <Cloud className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  // Get user type badge variant
  const getUserTypeBadge = (type: NxUser["type"]) => {
    const config = {
      local: {
        label: "Local",
        className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 transition-all",
      },
      temporaryLocal: {
        label: "Temporary",
        className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 transition-all",
      },
      ldap: {
        label: "LDAP",
        className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 transition-all",
      },
      cloud: {
        label: "Cloud",
        className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 transition-all",
      },
    };
    return config[type] || { label: type, className: "bg-gray-100 text-gray-800 transition-all" };
  };

  // Count users by type
  const userStats = {
    total: users.length,
    local: users.filter((u) => u.type === "local").length,
    temporaryLocal: users.filter((u) => u.type === "temporaryLocal").length,
    ldap: users.filter((u) => u.type === "ldap").length,
    cloud: users.filter((u) => u.type === "cloud").length,
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      ...initialFormData,
      expiresAfterLoginEnabled: false,
      expiresAfterLoginValue: 1,
      expiresAfterLoginUnit: "days",
    });
    setFormErrors({});
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  // Open create dialog
  const handleOpenCreate = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  // Open edit dialog
  const handleOpenEdit = (user: NxUser) => {
    setSelectedUser(user);
    const expiresS = user.temporaryToken?.expiresAfterLoginS;
    const timeConversion = expiresS ? secondsToTimeUnit(expiresS) : { value: 1, unit: "days" as TimeUnit };

    setFormData({
      name: user.name,
      fullName: user.fullName || "",
      email: user.email || "",
      password: "",
      confirmPassword: "",
      type: user.type === "ldap" ? "local" : user.type,
      groupIds: user.groupIds || [],
      isEnabled: user.isEnabled !== false,
      startS: user.temporaryToken?.startS,
      endS: user.temporaryToken?.endS,
      expiresAfterLoginS: user.temporaryToken?.expiresAfterLoginS,
      expiresAfterLoginEnabled: !!expiresS,
      expiresAfterLoginValue: timeConversion.value,
      expiresAfterLoginUnit: timeConversion.unit,
    });
    setFormErrors({});
    setShowEditDialog(true);
  };

  // Open delete dialog
  const handleOpenDelete = (user: NxUser) => {
    // Check if user is an administrator
    const isAdmin = user.groupIds?.some((groupId) => {
      const group = groups.find((g) => g.id === groupId);
      return group?.name.toLowerCase().includes("administrator");
    });

    if (isAdmin) {
      showNotification({
        type: "error",
        title: "Action Denied",
        message: "This user belongs to an Administrator group and cannot be deleted.",
      });
      return;
    }

    setSelectedUser(user);
    setShowDeleteDialog(true);
  };

  // Validate form
  const validateForm = (isEdit: boolean = false): boolean => {
    const errors: Record<string, string> = {};

    if (formData.type === "cloud") {
      if (!formData.email.trim()) {
        errors.email = "Email is required for cloud users";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = "Please enter a valid email address";
      }
    } else {
      // Local and temporaryLocal
      if (!formData.name.trim()) {
        errors.name = "Username is required";
      }

      if (!isEdit) {
        if (!formData.password) {
          errors.password = "Password is required";
        } else if (formData.password.length < 4) {
          errors.password = "Password must be at least 4 characters";
        }

        if (formData.password !== formData.confirmPassword) {
          errors.confirmPassword = "Passwords do not match";
        }
      } else if (formData.password && formData.password !== formData.confirmPassword) {
        errors.confirmPassword = "Passwords do not match";
      }

      // Temporary user validation
      if (formData.type === "temporaryLocal") {
        if (!formData.endS) {
          errors.endS = "End date is required for temporary users";
        }
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Create user
  const handleCreate = async () => {
    if (!validateForm(false)) return;

    setIsSubmitting(true);
    try {
      const body: any = {
        type: formData.type,
        isEnabled: formData.isEnabled,
        groupIds: formData.groupIds,
      };

      if (formData.type === "cloud") {
        body.name = formData.email;
        body.email = formData.email;
      } else {
        body.name = formData.name;
        body.fullName = formData.fullName || undefined;
        body.email = formData.email || undefined;
        body.password = formData.password;

        if (formData.type === "temporaryLocal") {
          body.temporaryToken = {
            startS: formData.startS || Math.floor(Date.now() / 1000),
            endS: formData.endS,
            expiresAfterLoginS: formData.expiresAfterLoginEnabled
              ? timeUnitToSeconds(formData.expiresAfterLoginValue, formData.expiresAfterLoginUnit)
              : undefined,
          };
        }
      }

      const result = await serviceCreateUser(body, systemId);
      if (!result.success) {
        throw new Error(result.error);
      }

      setShowCreateDialog(false);
      resetForm();
      await refetchUsers();
    } catch (err) {
      setFormErrors({
        submit: err instanceof Error ? err.message : "Failed to create user",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update user
  const handleUpdate = async () => {
    if (!selectedUser || !validateForm(true)) return;

    setIsSubmitting(true);
    try {
      const body: any = {
        isEnabled: formData.isEnabled,
        groupIds: formData.groupIds,
      };

      if (formData.type === "cloud") {
        body.email = formData.email;
      } else {
        body.name = formData.name;
        body.fullName = formData.fullName || undefined;
        body.email = formData.email || undefined;

        if (formData.password) {
          body.password = formData.password;
        }

        if (formData.type === "temporaryLocal") {
          body.temporaryToken = {
            startS: formData.startS || Math.floor(Date.now() / 1000),
            endS: formData.endS,
            expiresAfterLoginS: formData.expiresAfterLoginEnabled
              ? timeUnitToSeconds(formData.expiresAfterLoginValue, formData.expiresAfterLoginUnit)
              : undefined,
          };
        }
      }

      const result = await serviceUpdateUser(selectedUser.id, body, systemId);
      if (!result.success) {
        throw new Error(result.error);
      }

      setShowEditDialog(false);
      setSelectedUser(null);
      resetForm();
      await refetchUsers();
    } catch (err) {
      setFormErrors({
        submit: err instanceof Error ? err.message : "Failed to update user",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete user
  const handleDelete = async () => {
    if (!selectedUser) return;

    setIsSubmitting(true);
    try {
      const result = await serviceDeleteUser(selectedUser.id, systemId);
      if (!result.success) {
        throw new Error(result.error);
      }

      setShowDeleteDialog(false);
      setSelectedUser(null);
      await refetchUsers();
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle group toggle
  const handleGroupToggle = (groupId: string) => {
    setFormData((prev) => ({
      ...prev,
      groupIds: prev.groupIds.includes(groupId)
        ? prev.groupIds.filter((id) => id !== groupId)
        : [...prev.groupIds, groupId],
    }));
  };

  // Copy token to clipboard
  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  // Convert timestamp to datetime-local input value
  const timestampToDatetimeLocal = (timestamp?: number): string => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    return date.toISOString().slice(0, 16);
  };

  // Convert datetime-local input value to timestamp
  const datetimeLocalToTimestamp = (value: string): number | undefined => {
    if (!value) return undefined;
    return Math.floor(new Date(value).getTime() / 1000);
  };

  const loading = usersLoading || groupsLoading;
  const error = usersError || groupsError;

  // Render form based on user type
  const renderFormFields = () => {
    return (
      <div className="space-y-4">
        {/* User Type Selection */}
        <div className="space-y-2">
          <Label>User Type *</Label>
          <Select
            value={formData.type}
            onValueChange={(value: "local" | "temporaryLocal" | "cloud") =>
              setFormData((prev) => ({ ...prev, type: value }))
            }
            disabled={showEditDialog}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select user type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Local
                </div>
              </SelectItem>
              <SelectItem value="temporaryLocal">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Temporary Local
                </div>
              </SelectItem>
              <SelectItem value="cloud">
                <div className="flex items-center gap-2">
                  <Cloud className="h-4 w-4" />
                  Cloud
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Enabled Toggle */}
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="isEnabled"
            checked={formData.isEnabled}
            onChange={(e) => setFormData((prev) => ({ ...prev, isEnabled: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label htmlFor="isEnabled" className="text-sm font-normal cursor-pointer">
            User is enabled (disabled users cannot login)
          </Label>
        </div>

        {/* Cloud User Fields */}
        {formData.type === "cloud" && (
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="user@example.com"
              className={formErrors.email ? "border-red-500" : ""}
            />
            {formErrors.email && <p className="text-xs text-red-500">{formErrors.email}</p>}
          </div>
        )}

        {/* Local/Temporary User Fields */}
        {(formData.type === "local" || formData.type === "temporaryLocal") && (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Username *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="username"
                className={formErrors.name ? "border-red-500" : ""}
              />
              {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password {showEditDialog ? "(leave empty to keep current)" : "*"}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                  className={formErrors.password ? "border-red-500 pr-10" : "pr-10"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {formErrors.password && <p className="text-xs text-red-500">{formErrors.password}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="••••••••"
                  className={formErrors.confirmPassword ? "border-red-500 pr-10" : "pr-10"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {formErrors.confirmPassword && <p className="text-xs text-red-500">{formErrors.confirmPassword}</p>}
            </div>
          </>
        )}

        {/* Temporary User Specific Fields */}
        {formData.type === "temporaryLocal" && (
          <div className="space-y-4 p-3 sm:p-4 border rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
              <Link className="h-4 w-4" />
              <span className="font-medium text-sm sm:text-base">Link Valid Until</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label htmlFor="startS" className="text-sm">
                  Start Date
                </Label>
                <Input
                  id="startS"
                  type="datetime-local"
                  value={timestampToDatetimeLocal(formData.startS)}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      startS: datetimeLocalToTimestamp(e.target.value),
                    }))
                  }
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">Leave empty for current time</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="endS" className="text-sm">
                  End Date *
                </Label>
                <Input
                  id="endS"
                  type="datetime-local"
                  value={timestampToDatetimeLocal(formData.endS)}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      endS: datetimeLocalToTimestamp(e.target.value),
                    }))
                  }
                  className={`text-sm ${formErrors.endS ? "border-red-500" : ""}`}
                />
                {formErrors.endS && <p className="text-xs text-red-500">{formErrors.endS}</p>}
              </div>
            </div>

            {/* Revoke access after login */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="expiresAfterLoginEnabled"
                  checked={formData.expiresAfterLoginEnabled}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      expiresAfterLoginEnabled: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="expiresAfterLoginEnabled" className="text-sm font-normal cursor-pointer">
                  Revoke access after login
                </Label>
              </div>

              {formData.expiresAfterLoginEnabled && (
                <div className="flex items-center gap-2 pl-6">
                  <span className="text-sm text-muted-foreground">In</span>
                  <Input
                    type="number"
                    min="1"
                    value={formData.expiresAfterLoginValue}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        expiresAfterLoginValue: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="w-20 text-sm"
                  />
                  <Select
                    value={formData.expiresAfterLoginUnit}
                    onValueChange={(value: TimeUnit) =>
                      setFormData((prev) => ({
                        ...prev,
                        expiresAfterLoginUnit: value,
                      }))
                    }
                  >
                    <SelectTrigger className="w-28 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Show token if editing and token exists */}
            {showEditDialog && selectedUser?.temporaryToken?.token && (
              <div className="space-y-2">
                <Label className="text-sm">Authentication Token</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                    {selectedUser.temporaryToken.token}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyToken(selectedUser.temporaryToken!.token!)}
                  >
                    {copiedToken ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Permissions / Group Selection */}
        <div className="space-y-2">
          <Label>Permissions (Groups)</Label>
          <ScrollArea className="h-40 border rounded-lg p-3">
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No groups available</p>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => (
                  <div key={group.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`group-${group.id}`}
                      checked={formData.groupIds.includes(group.id)}
                      onChange={() => handleGroupToggle(group.id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor={`group-${group.id}`} className="text-sm font-normal cursor-pointer flex-1">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3 w-3 text-muted-foreground" />
                        {group.name}
                      </div>
                      {group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Submit Error */}
        {formErrors.submit && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{formErrors.submit}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 sm:h-6 sm:w-6" />
            User Management
          </h1>

          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Manage VMS users and their access permissions
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button onClick={handleOpenCreate} className="flex items-center gap-2 flex-1 sm:flex-none" size="sm">
            <Plus className="h-4 w-4" />
            <span className="hidden xs:inline">Add User</span>
            <span className="xs:hidden">Add</span>
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            variant="outline"
            className="flex items-center gap-2"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
        <Card>
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardDescription className="text-xs sm:text-sm">Total Users</CardDescription>
            <CardTitle className="text-xl sm:text-2xl">{userStats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardDescription className="flex items-center gap-1 text-xs sm:text-sm">
              <Users className="h-3 w-3" /> Local
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl text-blue-600">{userStats.local}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardDescription className="flex items-center gap-1 text-xs sm:text-sm">
              <Clock className="h-3 w-3" /> Temporary
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl text-yellow-600">{userStats.temporaryLocal}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardDescription className="flex items-center gap-1 text-xs sm:text-sm">
              <Shield className="h-3 w-3" /> LDAP
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl text-purple-600">{userStats.ldap}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardDescription className="flex items-center gap-1 text-xs sm:text-sm">
              <Cloud className="h-3 w-3" /> Cloud
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl text-green-600">{userStats.cloud}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-2 sm:gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2 w-full md:w-auto justify-center" size="sm">
              <Filter className="h-4 w-4" />
              {filterType === "all" ? "All Types" : getUserTypeBadge(filterType as NxUser["type"]).label}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFilterType("all")}>All Types</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType("local")}>
              <Users className="h-4 w-4 mr-2" /> Local
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType("temporaryLocal")}>
              <Clock className="h-4 w-4 mr-2" /> Temporary
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType("ldap")}>
              <Shield className="h-4 w-4 mr-2" /> LDAP
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType("cloud")}>
              <Cloud className="h-4 w-4 mr-2" /> Cloud
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-auto">
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading users...</span>
        </div>
      )}

      {/* Users Table */}
      {!loading && !error && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">Users ({filteredUsers.length})</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              List of all users with access to the VMS system
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            {filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-muted-foreground">
                <Users className="h-10 w-10 sm:h-12 sm:w-12 mb-4 opacity-50" />
                <p className="text-sm sm:text-base">No users found</p>
                {searchTerm && <p className="text-xs sm:text-sm mt-1">Try adjusting your search or filter criteria</p>}
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px] sm:w-[50px] text-xs sm:text-sm">#</TableHead>
                      <TableHead className="text-xs sm:text-sm min-w-[120px]">Name</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden md:table-cell">Email</TableHead>
                      <TableHead className="text-xs sm:text-sm">Type</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Status</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Groups</TableHead>
                      <TableHead className="w-[60px] sm:w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user, index) => {
                      const typeBadge = getUserTypeBadge(user.type);
                      return (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium text-muted-foreground text-xs sm:text-sm">
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="p-1 sm:p-1.5 rounded-full bg-muted flex-shrink-0">
                                {getUserTypeIcon(user.type)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-medium text-xs sm:text-sm truncate block">{user.name}</span>
                                {user.fullName && (
                                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                                    {user.fullName}
                                  </p>
                                )}
                                {/* Show email on mobile */}
                                {user.email && (
                                  <p className="text-[10px] text-muted-foreground truncate md:hidden">{user.email}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {user.email ? (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Mail className="h-3 w-3 flex-shrink-0" />
                                <span className="text-xs sm:text-sm truncate">{user.email}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs sm:text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`${typeBadge.className} text-[10px] sm:text-xs`}>
                              {typeBadge.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {user.isEnabled !== false ? (
                              <Badge
                                variant="outline"
                                className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-[10px] sm:text-xs transition-all"
                              >
                                Enabled
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 text-[10px] sm:text-xs transition-all"
                              >
                                Disabled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {user.groupIds && user.groupIds.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {user.groupIds.slice(0, 2).map((groupId) => (
                                  <Badge key={groupId} variant="outline" className="text-[10px] sm:text-xs">
                                    {getGroupName(groupId)}
                                  </Badge>
                                ))}
                                {user.groupIds.length > 2 && (
                                  <Badge variant="outline" className="text-[10px] sm:text-xs">
                                    +{user.groupIds.length - 2}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs sm:text-sm">No groups</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleOpenEdit(user)} disabled={user.type === "ldap"}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleOpenDelete(user)}
                                  className="text-red-600 focus:text-red-600"
                                  disabled={user.type === "ldap"}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* User Groups Section */}
      {!loading && !error && groups.length > 0 && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
              User Groups ({groups.length})
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Available user groups for permission management
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="p-2 rounded-full bg-primary/10">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{group.name}</p>
                    {group.description && <p className="text-xs text-muted-foreground truncate">{group.description}</p>}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {users.filter((u) => u.groupIds?.includes(group.id)).length} users
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
              Create New User
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">Add a new user to the VMS system</DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
              size="sm"
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting} className="w-full sm:w-auto" size="sm">
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create User"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Pencil className="h-4 w-4 sm:h-5 sm:w-5" />
              Edit User
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Modify user details for {selectedUser?.name}
            </DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
              size="sm"
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={isSubmitting} className="w-full sm:w-auto" size="sm">
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user <strong>{selectedUser?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700">
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cloud Login Dialog */}
      <CloudLoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        systemId={loginSystemId}
        systemName={loginSystemName}
        onLoginSuccess={refetchUsers}
      />
    </div>
  );
}
