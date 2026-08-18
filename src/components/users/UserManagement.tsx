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
  Link as LinkIcon,
  MoreHorizontal,
  X,
  Grid,
  List,
  UserCheck,
  UserX,
  Camera,
  CheckSquare,
  Square,
  SlidersHorizontal,
  Sparkles,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Info,
} from "lucide-react";
import nxAPI, { NxSystemInfo } from "@/lib/nxapi";
import { useAuth } from "@/contexts/auth-context";
import { isAdmin } from "@/lib/auth";
import {
  fetchUsers,
  fetchUserGroups,
  createUser as serviceCreateUser,
  updateUser as serviceUpdateUser,
  deleteUser as serviceDeleteUser,
  timeUnitToSeconds,
  secondsToTimeUnit,
} from "@/services/user-service";
import { useCloudSystemsWithOnline } from "@/hooks/use-cloud-systems-with-online";
import { API_CONFIG, CLOUD_CONFIG, getCloudAuthHeader, getElectronHeaders } from "@/lib/config";
import Cookies from "js-cookie";
import { performAdminLogin } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import { CloudLoginDialog } from "@/components/cloud/CloudLoginDialog";
import { Button } from "../ui/button";
import { format } from "date-fns";
import { showNotification } from "@/lib/notifications";
import { addPersistentNotification } from "@/lib/persistent-notifications";
import { Badge } from "../ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

// User interface based on NX Witness API
export interface NxUser {
  id: string;
  name: string;
  fullName?: string;
  email?: string;
  type: "local" | "temporaryLocal" | "ldap" | "cloud";
  groupIds?: string[];
  isEnabled?: boolean;
  resourceAccessRights?: Record<string, string>;
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
  resourceAccessRights?: Record<string, string>;
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
  resourceAccessRights: {},
  isEnabled: true,
  startS: undefined,
  endS: undefined,
  expiresAfterLoginS: undefined,
  expiresAfterLoginEnabled: false,
  expiresAfterLoginValue: 1,
  expiresAfterLoginUnit: "days",
};

// Hook to fetch devices for a system
function useDevices(systemId?: string) {
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    console.log(`[useDevices] Fetching devices for systemId: ${systemId}`);
    try {
      setLoading(true);
      setError(null);
      if (!systemId) {
        console.log(`[useDevices] No systemId provided, skipping fetch`);
        setDevices([]);
        setLoading(false);
        return;
      }

      const url = `/api/nx/devices?systemId=${encodeURIComponent(systemId)}`;
      console.log(`[useDevices] Fetching from: ${url}`);
      const response = await fetch(url, { method: "GET", credentials: "include", headers: { Accept: "application/json", ...getElectronHeaders() } });
      if (!response.ok) {
        console.error(`[useDevices] Failed to fetch devices: ${response.status}`);
        setDevices([]);
        setError(`Failed to fetch devices: ${response.status}`);
        return;
      }
      const data = await response.json();
      const mapped = Array.isArray(data) ? data.map((d: any) => ({ id: d.id || d.deviceId || "", name: d.name || d.displayName || d.deviceName || "Unnamed" })) : [];
      console.log(`[useDevices] Fetched ${mapped.length} devices:`, mapped);
      setDevices(mapped);
    } catch (err) {
      console.error(`[useDevices] Error:`, err);
      setError(err instanceof Error ? err.message : String(err));
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [systemId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return { devices, loading, error, refetch: fetchDevices };
}

// Default permission groups to use for selection (override/fallback)
const DEFAULT_PERMISSION_GROUPS: NxUserGroup[] = [
  {
    id: "{00000000-0000-0000-0000-100000000000}",
    name: "Administrators",
    description:
      "Members of this group have unlimited System privileges. Administrators can create and modify Power Users, merge Systems and connect or disconnect System to Nx Cloud.",
    permissions: ("powerUser|viewLogs|viewMetrics|generateEvents|administrator".split("|") || []),
  },
  {
    id: "{00000000-0000-0000-0000-100000000001}",
    name: "Power Users",
    description:
      "Members of this group can, in addition to the permissions granted by the Advanced Viewers group, control most of the System configuration, but are not allowed to change any Administrator related settings, like delete or change their own groups and permissions, and cannot create or edit other Power Users.",
    permissions: ("powerUser|viewLogs|viewMetrics|generateEvents".split("|") || []),
  },
  {
    id: "{00000000-0000-0000-0000-100000000002}",
    name: "Advanced Viewers",
    description:
      "Members of this group can, in addition to the permissions granted by the Viewers group, see and activate PTZ positions and PTZ tours, use 2-way audio, operate I/O module buttons, create and edit bookmarks, and view the Event Log.",
    permissions: ("viewLogs|generateEvents".split("|") || []),
  },
  {
    id: "{00000000-0000-0000-0000-100000000003}",
    name: "Viewers",
    description:
      "Members of this group can, in addition to the permissions granted by the Live Viewers group, view and export archive and Bookmarks.",
    permissions: ("none".split("|") || []),
  },
  {
    id: "{00000000-0000-0000-0000-100000000004}",
    name: "Live Viewers",
    description: "Members of this group can view live videos, I/O modules and web pages.",
    permissions: ("none".split("|") || []),
  },
  {
    id: "{00000000-0000-0000-0000-100000000005}",
    name: "System Health Viewers",
    description: "Members of this group can view System Health Monitoring information and server processor load in real-time (Server Monitoring).",
    permissions: ("viewMetrics".split("|") || []),
  },
];

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

// Helper to get initials for avatars
const getInitials = (name: string = ""): string => {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export default function UserManagement() {
  const { user: localUser } = useAuth();
  const isUserAdmin = isAdmin(localUser);
  const canEditUsers = isUserAdmin || localUser?.privileges?.find(p => p.module === "user_management" || p.module === "users")?.can_edit === true;
  const [selectedSystemId, setSelectedSystemId] = useState<string>("");
  const { cloudSystems, loadingCloud, refetchCloudSystems } = useCloudSystemsWithOnline();

  // Cloud login state
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [loginSystemId, setLoginSystemId] = useState("");
  const [loginSystemName, setLoginSystemName] = useState("");

  const systemId = selectedSystemId;

  const { users, loading: usersLoading, error: usersError, requiresAuth, refetch: refetchUsers } = useUsers(systemId);
  const { groups, loading: groupsLoading, error: groupsError, refetch: refetchGroups } = useUserGroups(systemId);
  
  // For devices, use selectedSystemId if available, otherwise use localhost for local server after cloud systems are loaded
  const deviceSystemId = selectedSystemId || (!loadingCloud && cloudSystems.length === 0 ? "localhost:7001" : selectedSystemId);
  console.log(`[UserManagement] Device loading - selectedSystemId: ${selectedSystemId}, loadingCloud: ${loadingCloud}, cloudSystems: ${cloudSystems.length}, deviceSystemId: ${deviceSystemId}`);
  const { devices, loading: devicesLoading, error: devicesError, refetch: refetchDevices } = useDevices(deviceSystemId);

  const [searchTerm, setSearchTerm] = useState("");
  const [resourceSearchTerm, setResourceSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState<Set<string>>(new Set());
  const [isLoggedIn, setIsLoggedIn] = useState<Set<string>>(new Set());

  // Modal active tab state
  const [modalTab, setModalTab] = useState<"general" | "validity" | "permissions" | "cameras">("general");

  // Local (NX proxy) users & groups state
  const [localUsers, setLocalUsers] = useState<NxUser[]>([]);
  const [localGroups, setLocalGroups] = useState<NxUserGroup[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);

  // Fetch local users directly from the NX server (Local First)
  const fetchLocalUsers = useCallback(async () => {
    const localUserStr = Cookies.get("local_nx_user");
    if (!localUserStr) return;

    let localUserInfo: any;
    try {
      localUserInfo = JSON.parse(localUserStr);
    } catch {
      return;
    }

    const token = localUserInfo?.token;
    if (!token) return;

    setLoadingLocal(true);
    try {
      // Fetch users and userGroups in parallel (v3 so IDs match)
      const [usersRes, groupsRes] = await Promise.all([
        fetch("/nx/rest/v3/users", {
          headers: { "x-runtime-guid": token, Accept: "application/json" },
        }),
        fetch("/nx/rest/v3/userGroups", {
          headers: { "x-runtime-guid": token, Accept: "application/json" },
        }),
      ]);

      if (usersRes.ok) {
        const data = await usersRes.json();
        const mapped: NxUser[] = (Array.isArray(data) ? data : []).map((u: any) => ({
          id: u.id || "",
          name: u.name || u.username || "",
          fullName: u.fullName || u.name || "",
          email: u.email || "",
          type: u.type || "local",
          groupIds: u.groupIds || u.roleIds || [],
          isEnabled: u.isEnabled !== false,
          temporaryToken: u.temporaryToken,
          resourceAccessRights: u.resourceAccessRights || undefined,
        }));
        console.log(`[UserManagement] Fetched ${mapped.length} local users`);
        setLocalUsers(mapped);
      }

      if (groupsRes.ok) {
        const data = await groupsRes.json();
        const mapped: NxUserGroup[] = (Array.isArray(data) ? data : []).map((r: any) => ({
          id: r.id || "",
          name: r.name || "",
          description: r.description || "",
          permissions: r.permissions || [],
        }));
        setLocalGroups(mapped);
      }
    } catch {
      // Local fetch is best-effort, silently ignore errors
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  // Initial load: fetch local data immediately
  useEffect(() => {
    fetchLocalUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Admin login function for cloud systems
  const attemptAdminLogin = useCallback(
    async (targetSystemId: string, systemName: string): Promise<boolean> => {
      console.log(`[UserManagement] Attempting Admin login to ${systemName}...`);

      const success = await performAdminLogin(targetSystemId);

      if (success) {
        console.log(`[UserManagement] Admin login success for ${systemName}`);
        setAutoLoginAttempted((prev) => new Set(prev).add(targetSystemId));
        setIsLoggedIn((prev) => new Set(prev).add(targetSystemId));
        // After successful login, refetch data
        await Promise.all([refetchUsers(), refetchGroups()]);
        return true;
      } else {
        setAutoLoginAttempted((prev) => new Set(prev).add(targetSystemId));
        return false;
      }
    },
    [refetchUsers, refetchGroups],
  );

  // Sync requiresAuth with login dialog or auto-login
  useEffect(() => {
    const handleAuth = async () => {
      if (requiresAuth && systemId) {
        const system = cloudSystems.find((s) => s.id === systemId);
        const systemName = system?.name || systemId;

        // Try admin login first
        if (!autoLoginAttempted.has(systemId)) {
          console.log(`[UserManagement] Auth required for ${systemName}, attempting admin login...`);
          const success = await attemptAdminLogin(systemId, systemName);
          if (success) return;
        }

        // Admin login failed or not available, show dialog
        setLoginSystemId(systemId);
        setLoginSystemName(systemName);
        setShowLoginDialog(true);
      }
    };

    handleAuth();
  }, [requiresAuth, systemId, cloudSystems, autoLoginAttempted, attemptAdminLogin]);

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
  // Copy permissions from existing user (use non-empty sentinel for 'none')
  const [copyFromUserId, setCopyFromUserId] = useState<string>("none");

  const handleCopyFromUser = (userId: string) => {
    setCopyFromUserId(userId);
    if (userId === "none") {
      setFormData((prev) => ({ ...prev, groupIds: [], resourceAccessRights: {} }));
      showNotification({ type: "info", title: "Permissions cleared", message: "Cleared copied groups and camera access" });
      return;
    }

    const src = effectiveUsers.find((u) => u.id === userId);
    if (src) {
      // Normalize resource access rights IDs when copying
      const normalizeId = (id: string) => id.replace(/[{}]/g, "");
      const rawRAR = src.resourceAccessRights || {};
      const normalizedRAR = Object.fromEntries(
        Object.entries(rawRAR).map(([deviceId, rights]) => [normalizeId(deviceId), rights as string])
      ) as Record<string, string>;
      
      setFormData((prev) => ({ 
        ...prev, 
        groupIds: src.groupIds || [], 
        resourceAccessRights: normalizedRAR 
      }));
      showNotification({ 
        type: "success", 
        title: "Permissions copied", 
        message: `Copied ${src.groupIds?.length || 0} groups and ${Object.keys(normalizedRAR).length} camera permissions from ${src.name}` 
      });
    }
  };

  // Combined loading and error states
  const loading = usersLoading || groupsLoading || (loadingLocal && localUsers.length === 0);
  const error = usersError || groupsError;

  // Effective data: prefer cloud when a system is selected, fall back to local
  const effectiveUsers = selectedSystemId ? users : localUsers;
  const effectiveGroups = selectedSystemId ? groups : localGroups;

  // Filter users based on search term and type (use effective data)
  const filteredUsers = effectiveUsers.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.fullName && user.fullName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = filterType === "all" || user.type === filterType;
    return matchesSearch && matchesType;
  });

  // Get group name by ID (from effective groups)
  const getGroupName = (groupId: string): string => {
    const group = DEFAULT_PERMISSION_GROUPS.find((g) => g.id === groupId) || effectiveGroups.find((g) => g.id === groupId);
    return group ? group.name : groupId.substring(0, 8) + "...";
  };

  // Handle refresh — refreshes both local and cloud
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchLocalUsers(),
      refetchUsers(),
      refetchGroups(),
    ]);
    setIsRefreshing(false);
  };

  // Get user type badge formatting
  const getUserTypeBadge = (type: NxUser["type"]) => {
    switch (type) {
      case "local":
        return {
          label: "Local",
          icon: <Users className="h-3.5 w-3.5" />,
          className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
          avatarGradient: "from-blue-500 to-indigo-600",
        };
      case "temporaryLocal":
        return {
          label: "Temporary",
          icon: <Clock className="h-3.5 w-3.5" />,
          className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
          avatarGradient: "from-amber-500 to-orange-600",
        };
      case "ldap":
        return {
          label: "LDAP",
          icon: <Shield className="h-3.5 w-3.5" />,
          className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800",
          avatarGradient: "from-purple-500 to-violet-600",
        };
      case "cloud":
        return {
          label: "Cloud",
          icon: <Cloud className="h-3.5 w-3.5" />,
          className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
          avatarGradient: "from-emerald-500 to-teal-600",
        };
      default:
        return {
          label: type,
          icon: <User className="h-3.5 w-3.5" />,
          className: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
          avatarGradient: "from-slate-500 to-slate-600",
        };
    }
  };

  // Count users by type (from effective data)
  const userStats = {
    total: effectiveUsers.length,
    local: effectiveUsers.filter((u) => u.type === "local").length,
    temporaryLocal: effectiveUsers.filter((u) => u.type === "temporaryLocal").length,
    ldap: effectiveUsers.filter((u) => u.type === "ldap").length,
    cloud: effectiveUsers.filter((u) => u.type === "cloud").length,
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
    setResourceSearchTerm("");
    setCopyFromUserId("none");
    setModalTab("general");
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

    // Normalize resource access rights IDs when loading user
    const normalizeId = (id: string) => id.replace(/[{}]/g, "");
    const rawRAR = user.resourceAccessRights || {};
    const normalizedRAR = Object.fromEntries(
      Object.entries(rawRAR).map(([deviceId, rights]) => [normalizeId(deviceId), rights as string])
    ) as Record<string, string>;

    console.log(`[UserManagement] Opening edit for user: ${user.name}`);

    setFormData({
      name: user.name,
      fullName: user.fullName || "",
      email: user.email || "",
      password: "",
      confirmPassword: "",
      type: user.type === "ldap" ? "local" : user.type,
      groupIds: user.groupIds || [],
      resourceAccessRights: normalizedRAR,
      isEnabled: user.isEnabled !== false,
      startS: user.temporaryToken?.startS,
      endS: user.temporaryToken?.endS,
      expiresAfterLoginS: user.temporaryToken?.expiresAfterLoginS,
      expiresAfterLoginEnabled: !!expiresS,
      expiresAfterLoginValue: timeConversion.value,
      expiresAfterLoginUnit: timeConversion.unit,
    });
    setFormErrors({});
    setModalTab("general");
    setShowEditDialog(true);
  };

  // Open delete dialog
  const handleOpenDelete = (user: NxUser) => {
    // Check if user is an administrator
    const isAdmin = user.groupIds?.some((groupId) => {
      const group = DEFAULT_PERMISSION_GROUPS.find((g) => g.id === groupId) || groups.find((g) => g.id === groupId);
      return group?.name.toLowerCase().includes("administrator");
    });

    if (isAdmin) {
      addPersistentNotification({
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
      const normalizeId = (id: string) => id.replace(/[{}]/g, "");

      const body: any = {
        type: formData.type,
        isEnabled: formData.isEnabled,
        groupIds: formData.groupIds.map(normalizeId),
      };

      if (formData.resourceAccessRights && Object.keys(formData.resourceAccessRights).length) {
        body.resourceAccessRights = Object.fromEntries(
          Object.entries(formData.resourceAccessRights).map(([deviceId, rights]) => [
            normalizeId(deviceId),
            rights
          ])
        );
      }

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
      showNotification({ type: "success", title: "User Created", message: `Successfully created user ${body.name}` });
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
      const body: any = {};

      if (formData.isEnabled !== selectedUser.isEnabled) body.isEnabled = formData.isEnabled;

      const normalizeId = (id: string) => id.replace(/[{}]/g, "");
      const currentGroups = (selectedUser.groupIds || []).map(normalizeId).sort().join(",");
      const newGroups = (formData.groupIds || []).map(normalizeId).sort().join(",");

      if (currentGroups !== newGroups) {
        body.groupIds = formData.groupIds.map(normalizeId);
      }

      if (formData.type === "cloud") {
        if (formData.email !== selectedUser.email) {
          body.email = formData.email;
        }
      } else {
        const isNameChanging = formData.name !== selectedUser.name;
        const hasPassword = formData.password && formData.password.trim() !== "";

        if (isNameChanging && !hasPassword) {
          setFormErrors({
            password: "Password is required when changing username",
          });
          setIsSubmitting(false);
          return;
        }

        if (isNameChanging) body.name = formData.name;
        if (formData.fullName !== (selectedUser.fullName || "")) body.fullName = formData.fullName;
        if (formData.email !== (selectedUser.email || "")) body.email = formData.email;

        if (hasPassword) {
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

      const newRAR = formData.resourceAccessRights || {};
      if (Object.keys(newRAR).length > 0) {
        body.resourceAccessRights = Object.fromEntries(
          Object.entries(newRAR).map(([deviceId, rights]) => [
            normalizeId(deviceId),
            rights
          ])
        );
      } else {
        body.resourceAccessRights = {};
      }

      if (Object.keys(body).length === 0) {
        setShowEditDialog(false);
        setSelectedUser(null);
        resetForm();
        return;
      }

      const result = await serviceUpdateUser(selectedUser.id, body, systemId);
      if (!result.success) {
        throw new Error(result.error);
      }

      setShowEditDialog(false);
      setSelectedUser(null);
      resetForm();
      await refetchUsers();
      showNotification({ type: "success", title: "User Updated", message: `Changes saved for ${selectedUser.name}` });
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
      const deletedName = selectedUser.name;
      setSelectedUser(null);
      await refetchUsers();
      showNotification({ type: "success", title: "User Deleted", message: `User ${deletedName} has been removed` });
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

  // Handle device access toggle
  const handleToggleDevice = (deviceId: string) => {
    setFormData((prev) => {
      const normalizeId = (id: string) => id.replace(/[{}]/g, "");
      const normalizedId = normalizeId(deviceId);
      
      const rar = { ...(prev.resourceAccessRights || {}) };
      
      const hasNormalizedKey = rar[normalizedId] !== undefined;
      const hasOriginalKey = rar[deviceId] !== undefined;
      
      if (hasNormalizedKey || hasOriginalKey) {
        delete rar[normalizedId];
        delete rar[deviceId];
      } else {
        rar[normalizedId] = "view|viewArchive|exportArchive|edit";
      }
      
      return { ...prev, resourceAccessRights: rar };
    });
  };

  // Select all or clear all cameras
  const handleSelectAllDevices = (select: boolean) => {
    setFormData((prev) => {
      if (!select) return { ...prev, resourceAccessRights: {} };
      
      const normalizeId = (id: string) => id.replace(/[{}]/g, "");
      const newRar: Record<string, string> = {};
      devices.forEach((d) => {
        newRar[normalizeId(d.id)] = "view|viewArchive|exportArchive|edit";
      });
      return { ...prev, resourceAccessRights: newRar };
    });
  };

  // Copy token to clipboard
  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
    showNotification({ type: "success", title: "Token Copied", message: "Authentication token copied to clipboard" });
  };

  // Quick preset duration for temporary users
  const handleSetQuickDuration = (days: number) => {
    const nowS = Math.floor(Date.now() / 1000);
    const endS = nowS + days * 86400;
    setFormData((prev) => ({
      ...prev,
      startS: prev.startS || nowS,
      endS: endS,
    }));
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

  // Count camera rights count for a user
  const getUserCameraCount = (u: NxUser): number => {
    if (!u.resourceAccessRights) return 0;
    return Object.keys(u.resourceAccessRights).length;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Global Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              User Management
            </h1>
            <Badge variant="outline" className="hidden sm:inline-flex bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800">
              <Sparkles className="w-3 h-3 mr-1 text-blue-500" /> VMS Security
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage system access accounts, cloud identities, temporary credentials, and camera permissions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {/* Cloud System Selector */}
          {cloudSystems.length > 0 && (
            <Select value={selectedSystemId} onValueChange={handleSystemChange} disabled={loadingCloud}>
              <SelectTrigger className="w-full sm:w-[220px] h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl text-xs sm:text-sm">
                <Cloud className="h-4 w-4 mr-2 text-blue-500 shrink-0" />
                <SelectValue placeholder="Select Cloud System..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {cloudSystems.map((system) => (
                  <SelectItem key={system.id} value={system.id} className="rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full", system.isOnline ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-slate-400")} />
                      <span className="font-medium">{system.name}</span>
                      {!system.isOnline && <span className="text-[10px] text-slate-400">(offline)</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Add User CTA */}
          {canEditUsers && (
            <Button
              onClick={handleOpenCreate}
              className="gap-2 h-10 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-[0.98]"
              disabled={!selectedSystemId && localUsers.length === 0}
            >
              <Plus className="h-4 w-4" />
              <span className="font-semibold text-xs sm:text-sm">Add User</span>
            </Button>
          )}

          {/* Refresh Button */}
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing || loadingCloud}
            variant="outline"
            className="gap-2 h-10 px-3.5 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 shadow-sm transition-all"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${isRefreshing || loadingCloud ? "animate-spin text-blue-600" : ""}`} />
            <span className="hidden sm:inline font-medium text-xs sm:text-sm">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Modern Stat Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {/* Total Users */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Users</span>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:scale-110 transition-transform">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-50">{userStats.total}</span>
            <span className="text-xs text-slate-400">accounts</span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-slate-800 dark:bg-slate-200 h-full rounded-full w-full" />
          </div>
        </div>

        {/* Local Users */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-4 border border-blue-100 dark:border-blue-950/50 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Local</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
              <User className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">{userStats.local}</span>
            <span className="text-xs text-blue-400/80">
              {userStats.total > 0 ? Math.round((userStats.local / userStats.total) * 100) : 0}%
            </span>
          </div>
          <div className="mt-3 w-full bg-blue-50 dark:bg-blue-950/60 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${userStats.total > 0 ? (userStats.local / userStats.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Temporary Users */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-4 border border-amber-100 dark:border-amber-950/50 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Temporary</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400">{userStats.temporaryLocal}</span>
            <span className="text-xs text-amber-400/80">
              {userStats.total > 0 ? Math.round((userStats.temporaryLocal / userStats.total) * 100) : 0}%
            </span>
          </div>
          <div className="mt-3 w-full bg-amber-50 dark:bg-amber-950/60 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${userStats.total > 0 ? (userStats.temporaryLocal / userStats.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* LDAP Users */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-4 border border-purple-100 dark:border-purple-950/50 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">LDAP</span>
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
              <Shield className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-purple-600 dark:text-purple-400">{userStats.ldap}</span>
            <span className="text-xs text-purple-400/80">
              {userStats.total > 0 ? Math.round((userStats.ldap / userStats.total) * 100) : 0}%
            </span>
          </div>
          <div className="mt-3 w-full bg-purple-50 dark:bg-purple-950/60 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-purple-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${userStats.total > 0 ? (userStats.ldap / userStats.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Cloud Users */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-4 border border-emerald-100 dark:border-emerald-950/50 shadow-sm hover:shadow-md transition-all duration-200 group col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Cloud</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <Cloud className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{userStats.cloud}</span>
            <span className="text-xs text-emerald-400/80">
              {userStats.total > 0 ? Math.round((userStats.cloud / userStats.total) * 100) : 0}%
            </span>
          </div>
          <div className="mt-3 w-full bg-emerald-50 dark:bg-emerald-950/60 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${userStats.total > 0 ? (userStats.cloud / userStats.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filter Tabs & View Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, email, or username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-9 h-10 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800">
            <button
              onClick={() => setFilterType("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
                filterType === "all"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              All ({effectiveUsers.length})
            </button>
            <button
              onClick={() => setFilterType("local")}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap",
                filterType === "local"
                  ? "bg-blue-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <User className="h-3 w-3" /> Local ({userStats.local})
            </button>
            <button
              onClick={() => setFilterType("temporaryLocal")}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap",
                filterType === "temporaryLocal"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <Clock className="h-3 w-3" /> Temp ({userStats.temporaryLocal})
            </button>
            <button
              onClick={() => setFilterType("cloud")}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap",
                filterType === "cloud"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <Cloud className="h-3 w-3" /> Cloud ({userStats.cloud})
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800 shrink-0">
            <button
              onClick={() => setViewMode("table")}
              title="Table View"
              className={cn(
                "p-1.5 rounded-lg transition-all text-slate-500",
                viewMode === "table" ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" : "hover:text-slate-900"
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              title="Card Grid View"
              className={cn(
                "p-1.5 rounded-lg transition-all text-slate-500",
                viewMode === "grid" ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" : "hover:text-slate-900"
              )}
            >
              <Grid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 rounded-2xl text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="rounded-xl border-red-200 hover:bg-red-100 text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mb-3" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading user accounts...</p>
        </div>
      )}

      {/* Content Area: Table vs Grid */}
      {!loading && !error && (
        <>
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center p-6">
              <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-3">
                <Users className="h-10 w-10 opacity-70" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No users found</h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                {searchTerm ? "No user matching your search query or selected filter criteria." : "No users exist in this system yet."}
              </p>
              {searchTerm && (
                <Button variant="ghost" size="sm" onClick={() => setSearchTerm("")} className="mt-4 text-blue-600 dark:text-blue-400">
                  Clear Search Filter
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
                      <TableHead className="text-xs font-semibold text-slate-500 min-w-[180px]">User Account</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 hidden md:table-cell">Email</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Type</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 hidden sm:table-cell">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 hidden lg:table-cell">Group Roles</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 hidden xl:table-cell">Cameras</TableHead>
                      <TableHead className="w-[70px] text-right text-xs font-semibold text-slate-500">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user, index) => {
                      const badge = getUserTypeBadge(user.type);
                      const cameraCount = getUserCameraCount(user);
                      return (
                        <TableRow key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/60 transition-colors">
                          <TableCell className="font-medium text-slate-400 text-xs">{index + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 border border-slate-200 dark:border-slate-700 shadow-xs">
                                <AvatarFallback className={`bg-gradient-to-br ${badge.avatarGradient} text-white font-bold text-xs`}>
                                  {getInitials(user.name || user.email)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 block truncate">{user.name}</span>
                                {user.fullName && (
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">{user.fullName}</span>
                                )}
                                {user.email && <span className="text-[10px] text-slate-400 md:hidden block truncate">{user.email}</span>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {user.email ? (
                              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{user.email}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px] font-semibold gap-1 py-0.5 px-2 rounded-lg border", badge.className)}>
                              {badge.icon}
                              <span>{badge.label}</span>
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {user.isEnabled !== false ? (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 text-[11px] font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Active
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[11px] font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                Disabled
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {user.groupIds && user.groupIds.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {user.groupIds.slice(0, 2).map((groupId) => {
                                  const name = getGroupName(groupId);
                                  const isAdminGroup = name.toLowerCase().includes("administrator");
                                  return (
                                    <Badge
                                      key={groupId}
                                      variant="secondary"
                                      className={cn(
                                        "text-[10px] font-medium rounded-md px-1.5 py-0.5",
                                        isAdminGroup
                                          ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                      )}
                                    >
                                      {name}
                                    </Badge>
                                  );
                                })}
                                {user.groupIds.length > 2 && (
                                  <Badge variant="outline" className="text-[10px] text-slate-500">
                                    +{user.groupIds.length - 2}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">No group</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            {cameraCount > 0 ? (
                              <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                                <Camera className="h-3.5 w-3.5" />
                                <span>{cameraCount} cameras</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Inherited</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canEditUsers ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                  <DropdownMenuItem onClick={() => handleOpenEdit(user)} disabled={user.type === "ldap"} className="rounded-lg text-xs gap-2">
                                    <Pencil className="h-3.5 w-3.5 text-blue-500" />
                                    <span>Edit Details</span>
                                  </DropdownMenuItem>
                                  {user.temporaryToken?.token && (
                                    <DropdownMenuItem onClick={() => handleCopyToken(user.temporaryToken!.token!)} className="rounded-lg text-xs gap-2">
                                      <Copy className="h-3.5 w-3.5 text-amber-500" />
                                      <span>Copy Token</span>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleOpenDelete(user)}
                                    disabled={user.type === "ldap"}
                                    className="rounded-lg text-xs gap-2 text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/40"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Delete Account</span>
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
              {filteredUsers.map((user) => {
                const badge = getUserTypeBadge(user.type);
                const cameraCount = getUserCameraCount(user);
                return (
                  <div
                    key={user.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between group"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700 shadow-xs">
                            <AvatarFallback className={`bg-gradient-to-br ${badge.avatarGradient} text-white font-bold text-sm`}>
                              {getInitials(user.name || user.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{user.name}</h4>
                            {user.fullName && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.fullName}</p>}
                          </div>
                        </div>

                        <Badge variant="outline" className={cn("text-[10px] font-semibold gap-1 py-0.5 px-2 rounded-lg shrink-0", badge.className)}>
                          {badge.icon}
                          <span>{badge.label}</span>
                        </Badge>
                      </div>

                      {/* Card Body */}
                      <div className="mt-4 space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                        {user.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{user.email}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-slate-400">Account Status</span>
                          {user.isEnabled !== false ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 text-[11px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-400 text-[11px]">
                              Disabled
                            </span>
                          )}
                        </div>

                        {/* Groups */}
                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-400 block">Groups & Roles</span>
                          {user.groupIds && user.groupIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.groupIds.map((gid) => (
                                <Badge key={gid} variant="secondary" className="text-[10px] rounded-md px-1.5 py-0.2">
                                  {getGroupName(gid)}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">No group assigned</span>
                          )}
                        </div>

                        {/* Camera Permissions */}
                        {cameraCount > 0 && (
                          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 p-2 rounded-xl border border-blue-100 dark:border-blue-900/40 mt-2">
                            <Camera className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-semibold text-[11px]">{cameraCount} specific cameras granted</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      {user.temporaryToken?.token ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToken(user.temporaryToken!.token!)}
                          className="h-8 px-2 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg gap-1"
                        >
                          <Copy className="h-3.5 w-3.5" /> Token
                        </Button>
                      ) : (
                        <div />
                      )}

                      {canEditUsers && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(user)}
                            disabled={user.type === "ldap"}
                            className="h-8 px-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg gap-1"
                          >
                            <Pencil className="h-3.5 w-3.5 text-blue-500" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDelete(user)}
                            disabled={user.type === "ldap"}
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

      {/* Permission Groups Summary Banner */}
      {!loading && !error && DEFAULT_PERMISSION_GROUPS.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">System Permission Groups</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Built-in roles for controlling access rights across the platform.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DEFAULT_PERMISSION_GROUPS.map((group) => {
              const assignedCount = effectiveUsers.filter((u) => u.groupIds?.includes(group.id)).length;
              return (
                <div
                  key={group.id}
                  className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 hover:border-slate-200 transition-colors flex items-start gap-3"
                >
                  <ShieldCheck className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">{group.name}</span>
                      <Badge variant="secondary" className="text-[10px] bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md">
                        {assignedCount} users
                      </Badge>
                    </div>
                    {group.description && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">{group.description}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CREATE & EDIT USER MODAL DIALOG */}
      <Dialog
        open={showCreateDialog || showEditDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setShowEditDialog(false);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] p-0 rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl flex flex-col">
          {/* Modal Top Banner Header */}
          <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-start justify-between relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-white/10 backdrop-blur-md">
                  {showEditDialog ? <Pencil className="h-5 w-5 text-blue-400" /> : <Plus className="h-5 w-5 text-blue-400" />}
                </div>
                <DialogTitle className="text-lg sm:text-xl font-extrabold text-white">
                  {showEditDialog ? `Edit Account: ${selectedUser?.name}` : "Create New User Account"}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-300 mt-1.5">
                Configure identity details, authentication, role groups, and camera permissions.
              </DialogDescription>
            </div>
          </div>

          {/* Modal Body with Structured Tabs */}
          <div className="p-4 sm:p-6 flex-1 overflow-y-auto custom-scrollbar">
            <Tabs value={modalTab} onValueChange={(val: any) => setModalTab(val)} className="w-full">
              <TabsList className="grid grid-cols-3 sm:grid-cols-4 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl mb-4 h-auto">
                <TabsTrigger value="general" className="text-xs py-2 rounded-lg font-semibold gap-1.5">
                  <User className="h-3.5 w-3.5" /> <span className="hidden sm:inline">General</span> Info
                </TabsTrigger>
                {formData.type === "temporaryLocal" && (
                  <TabsTrigger value="validity" className="text-xs py-2 rounded-lg font-semibold gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Validity
                  </TabsTrigger>
                )}
                <TabsTrigger value="permissions" className="text-xs py-2 rounded-lg font-semibold gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Roles
                </TabsTrigger>
                <TabsTrigger value="cameras" className="text-xs py-2 rounded-lg font-semibold gap-1.5">
                  <Camera className="h-3.5 w-3.5" /> Cameras
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: GENERAL INFO */}
              <TabsContent value="general" className="space-y-4 mt-0">
                {/* User Type Switcher */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Account Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(val: "local" | "temporaryLocal" | "cloud") => setFormData((prev) => ({ ...prev, type: val }))}
                    disabled={showEditDialog}
                  >
                    <SelectTrigger className="w-full h-10 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs sm:text-sm">
                      <SelectValue placeholder="Select user type" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="local">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                          <User className="h-4 w-4 text-blue-500" />
                          <span>Local User Account</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="temporaryLocal">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                          <Clock className="h-4 w-4 text-amber-500" />
                          <span>Temporary Guest Account (Token-based)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="cloud">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                          <Cloud className="h-4 w-4 text-emerald-500" />
                          <span>Cloud Integrated Account</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Account Enabled Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950">
                  <div className="space-y-0.5">
                    <Label htmlFor="isEnabled" className="text-xs font-semibold text-slate-900 dark:text-slate-100 cursor-pointer">
                      Account Active Status
                    </Label>
                    <p className="text-[11px] text-slate-500">Disabled accounts cannot log into the VMS system.</p>
                  </div>
                  <input
                    type="checkbox"
                    id="isEnabled"
                    checked={formData.isEnabled}
                    onChange={(e) => setFormData((prev) => ({ ...prev, isEnabled: e.target.checked }))}
                    className="h-4 w-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                {/* Form Fields for Cloud User */}
                {formData.type === "cloud" && (
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-semibold">Cloud Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="user@cloud-domain.com"
                      disabled={showEditDialog}
                      className={cn("h-10 rounded-xl text-xs sm:text-sm", formErrors.email && "border-red-500")}
                    />
                    {formErrors.email && <p className="text-xs text-red-500">{formErrors.email}</p>}
                  </div>
                )}

                {/* Form Fields for Local & Temporary User */}
                {(formData.type === "local" || formData.type === "temporaryLocal") && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="name" className="text-xs font-semibold">Username *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="johndoe"
                          className={cn("h-10 rounded-xl text-xs sm:text-sm", formErrors.name && "border-red-500")}
                        />
                        {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="fullName" className="text-xs font-semibold">Full Name</Label>
                        <Input
                          id="fullName"
                          value={formData.fullName}
                          onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
                          placeholder="John Doe"
                          className="h-10 rounded-xl text-xs sm:text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs font-semibold">Email Address (Optional)</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="john.doe@example.com"
                        className="h-10 rounded-xl text-xs sm:text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-xs font-semibold">
                          Password {showEditDialog ? "(Leave blank to keep unchanged)" : "*"}
                        </Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={formData.password}
                            onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                            placeholder="••••••••"
                            className={cn("h-10 rounded-xl text-xs sm:text-sm pr-10", formErrors.password && "border-red-500")}
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
                        {formErrors.password && <p className="text-xs text-red-500">{formErrors.password}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="confirmPassword" className="text-xs font-semibold">Confirm Password</Label>
                        <div className="relative">
                          <Input
                            id="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                            placeholder="••••••••"
                            className={cn("h-10 rounded-xl text-xs sm:text-sm pr-10", formErrors.confirmPassword && "border-red-500")}
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
                        {formErrors.confirmPassword && <p className="text-xs text-red-500">{formErrors.confirmPassword}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* TAB 2: VALIDITY & TEMPORARY TOKEN (Only for temporary users) */}
              {formData.type === "temporaryLocal" && (
                <TabsContent value="validity" className="space-y-4 mt-0">
                  <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-4">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs sm:text-sm">
                      <Clock className="h-4 w-4" />
                      <span>Temporary Access Lifetime</span>
                    </div>

                    {/* Quick duration presets */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-amber-700 dark:text-amber-400 block font-medium">Quick Set Duration</span>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleSetQuickDuration(1)} className="h-7 text-xs rounded-lg border-amber-300">
                          +1 Day
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleSetQuickDuration(7)} className="h-7 text-xs rounded-lg border-amber-300">
                          +7 Days
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleSetQuickDuration(30)} className="h-7 text-xs rounded-lg border-amber-300">
                          +30 Days
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="startS" className="text-xs font-semibold text-amber-900 dark:text-amber-200">Start Time</Label>
                        <Input
                          id="startS"
                          type="datetime-local"
                          value={timestampToDatetimeLocal(formData.startS)}
                          onChange={(e) => setFormData((prev) => ({ ...prev, startS: datetimeLocalToTimestamp(e.target.value) }))}
                          className="h-9 rounded-xl text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="endS" className="text-xs font-semibold text-amber-900 dark:text-amber-200">Expiration Time *</Label>
                        <Input
                          id="endS"
                          type="datetime-local"
                          value={timestampToDatetimeLocal(formData.endS)}
                          onChange={(e) => setFormData((prev) => ({ ...prev, endS: datetimeLocalToTimestamp(e.target.value) }))}
                          className={cn("h-9 rounded-xl text-xs", formErrors.endS && "border-red-500")}
                        />
                        {formErrors.endS && <p className="text-[11px] text-red-500">{formErrors.endS}</p>}
                      </div>
                    </div>

                    {/* Auto expiration option */}
                    <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40 space-y-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="expiresAfterLoginEnabled"
                          checked={formData.expiresAfterLoginEnabled}
                          onChange={(e) => setFormData((prev) => ({ ...prev, expiresAfterLoginEnabled: e.target.checked }))}
                          className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                        />
                        <Label htmlFor="expiresAfterLoginEnabled" className="text-xs font-medium text-amber-900 dark:text-amber-200 cursor-pointer">
                          Automatically revoke access X time after first login
                        </Label>
                      </div>

                      {formData.expiresAfterLoginEnabled && (
                        <div className="flex items-center gap-2 pl-6">
                          <span className="text-xs text-amber-800 dark:text-amber-300">Revoke in:</span>
                          <Input
                            type="number"
                            min="1"
                            value={formData.expiresAfterLoginValue}
                            onChange={(e) => setFormData((prev) => ({ ...prev, expiresAfterLoginValue: parseInt(e.target.value) || 1 }))}
                            className="w-20 h-8 text-xs rounded-lg"
                          />
                          <Select
                            value={formData.expiresAfterLoginUnit}
                            onValueChange={(val: TimeUnit) => setFormData((prev) => ({ ...prev, expiresAfterLoginUnit: val }))}
                          >
                            <SelectTrigger className="w-28 h-8 text-xs rounded-lg">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="minutes">Minutes</SelectItem>
                              <SelectItem value="hours">Hours</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Show Token Display */}
                    {showEditDialog && selectedUser?.temporaryToken?.token && (
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-900/60 space-y-1.5">
                        <span className="text-[11px] font-semibold text-slate-500 block">Access Token String</span>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-[11px] font-mono break-all text-amber-800 dark:text-amber-300">
                            {selectedUser.temporaryToken.token}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyToken(selectedUser.temporaryToken!.token!)}
                            className="h-8 px-2.5 rounded-lg border-amber-300 text-xs gap-1"
                          >
                            {copiedToken ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              )}

              {/* TAB 3: GROUP PERMISSIONS & COPY */}
              <TabsContent value="permissions" className="space-y-4 mt-0">
                {/* Copy permissions helper */}
                {effectiveUsers.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Copy Roles From Existing User</Label>
                    <Select value={copyFromUserId} onValueChange={handleCopyFromUser}>
                      <SelectTrigger className="w-full h-9 bg-white dark:bg-slate-900 rounded-xl text-xs">
                        <SelectValue placeholder="Select user to copy permissions from..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="none">None (Custom Permissions)</SelectItem>
                        {effectiveUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id} className="text-xs">
                            {u.name} {u.email ? `(${u.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Group Checkboxes */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">System Role Groups</Label>
                  <div className="space-y-2">
                    {DEFAULT_PERMISSION_GROUPS.map((group) => {
                      const isChecked = formData.groupIds.includes(group.id);
                      return (
                        <div
                          key={group.id}
                          onClick={() => handleGroupToggle(group.id)}
                          className={cn(
                            "p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3",
                            isChecked
                              ? "bg-blue-50/60 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800"
                              : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent onClick
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Shield className={cn("h-3.5 w-3.5", isChecked ? "text-blue-600" : "text-slate-400")} />
                              <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100">{group.name}</span>
                            </div>
                            {group.description && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{group.description}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              {/* TAB 4: CAMERA / RESOURCE ACCESS RIGHTS */}
              <TabsContent value="cameras" className="space-y-3 mt-0">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Camera Specific Access</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelectAllDevices(true)}
                      className="h-7 text-[11px] text-blue-600 hover:bg-blue-50"
                    >
                      Select All
                    </Button>
                    <span className="text-slate-300">|</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelectAllDevices(false)}
                      className="h-7 text-[11px] text-slate-500 hover:bg-slate-100"
                    >
                      Clear All
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search camera by name..."
                    value={resourceSearchTerm}
                    onChange={(e) => setResourceSearchTerm(e.target.value)}
                    className="pl-9 h-9 rounded-xl text-xs bg-slate-50 dark:bg-slate-950"
                  />
                  {resourceSearchTerm && (
                    <button onClick={() => setResourceSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <ScrollArea className="h-[260px] border border-slate-200/80 dark:border-slate-800 rounded-xl p-2 bg-slate-50/40 dark:bg-slate-950/40">
                  {devicesLoading ? (
                    <div className="flex items-center justify-center py-12 text-xs text-slate-400">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2 text-blue-500" /> Loading camera inventory...
                    </div>
                  ) : (
                    (() => {
                      const filteredDevs = devices.filter((d) =>
                        (d.name || "").toLowerCase().includes(resourceSearchTerm.toLowerCase()) ||
                        (d.id || "").toLowerCase().includes(resourceSearchTerm.toLowerCase())
                      );

                      if (filteredDevs.length === 0) {
                        return (
                          <div className="text-center py-10 text-xs text-slate-400">
                            {devices.length === 0 ? "No cameras available in selected system." : "No cameras match search."}
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-1">
                          {filteredDevs.map((dev) => {
                            const normalizeId = (id: string) => id.replace(/[{}]/g, "");
                            const normDevId = normalizeId(dev.id);

                            let hasAccess = false;
                            if (formData.resourceAccessRights) {
                              for (const k of Object.keys(formData.resourceAccessRights)) {
                                if (normalizeId(k) === normDevId) {
                                  hasAccess = true;
                                  break;
                                }
                              }
                            }

                            return (
                              <div
                                key={dev.id}
                                className={cn(
                                  "flex items-center justify-between p-2.5 rounded-xl border transition-colors",
                                  hasAccess
                                    ? "bg-blue-50/80 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800"
                                    : "bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800 hover:border-slate-300"
                                )}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    id={`dev-${dev.id}`}
                                    checked={hasAccess}
                                    onChange={() => handleToggleDevice(dev.id)}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <Label htmlFor={`dev-${dev.id}`} className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate cursor-pointer">
                                    {dev.name}
                                  </Label>
                                </div>

                                {hasAccess && (
                                  <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-0 font-bold uppercase">
                                    Full Access
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {/* Submit Error */}
            {formErrors.submit && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formErrors.submit}</span>
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setShowEditDialog(false);
                resetForm();
              }}
              disabled={isSubmitting}
              className="h-9 px-4 rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={showEditDialog ? handleUpdate : handleCreate}
              disabled={isSubmitting}
              className="h-9 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : showEditDialog ? (
                "Save Changes"
              ) : (
                "Create Account"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION ALERT DIALOG */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="rounded-2xl border border-slate-200 dark:border-slate-800">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <AlertDialogTitle className="text-lg font-bold">Confirm Account Deletion</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2">
              Are you sure you want to permanently delete user account <strong className="text-slate-900 dark:text-slate-100">{selectedUser?.name}</strong>? All privileges and access tokens associated with this user will be revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={isSubmitting} className="rounded-xl text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Deleting...
                </>
              ) : (
                "Delete Account"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CLOUD LOGIN DIALOG */}
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
