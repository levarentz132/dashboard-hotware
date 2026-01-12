"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getStatusVariant,
  getStatusDotColor,
  getStatusColor,
  getOnlineOfflineBadgeClass,
  getRoleBadgeClass,
} from "@/lib/status-utils";
import { Wifi, WifiOff, Circle, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

/**
 * Status badge with consistent styling
 */
interface StatusBadgeProps {
  status: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StatusBadge({ status, showIcon = false, size = "md", className }: StatusBadgeProps) {
  const variant = getStatusVariant(status);
  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-1",
    lg: "text-sm px-3 py-1.5",
  };

  return (
    <Badge variant={variant} className={cn(sizeClasses[size], className)}>
      {showIcon && <StatusIcon status={status} className="w-3 h-3 mr-1" />}
      {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
    </Badge>
  );
}

/**
 * Status dot indicator
 */
interface StatusDotProps {
  status: string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ status, size = "md", pulse = false, className }: StatusDotProps) {
  const sizeClasses = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-3 h-3",
  };

  return (
    <span
      className={cn(
        "rounded-full inline-block",
        getStatusDotColor(status),
        sizeClasses[size],
        pulse && "animate-pulse",
        className
      )}
    />
  );
}

/**
 * Status icon based on status type
 */
interface StatusIconProps {
  status: string;
  className?: string;
}

export function StatusIcon({ status, className }: StatusIconProps) {
  const normalizedStatus = status?.toLowerCase() || "unknown";

  switch (normalizedStatus) {
    case "online":
    case "recording":
    case "connected":
      return <Wifi className={cn("text-green-500", className)} />;
    case "offline":
    case "disconnected":
      return <WifiOff className={cn("text-red-500", className)} />;
    case "warning":
    case "degraded":
      return <AlertTriangle className={cn("text-yellow-500", className)} />;
    case "healthy":
    case "ok":
      return <CheckCircle className={cn("text-green-500", className)} />;
    case "critical":
    case "error":
      return <XCircle className={cn("text-red-500", className)} />;
    default:
      return <Circle className={cn("text-gray-400", className)} />;
  }
}

/**
 * Online/Offline badge
 */
interface OnlineOfflineBadgeProps {
  isOnline: boolean;
  className?: string;
}

export function OnlineOfflineBadge({ isOnline, className }: OnlineOfflineBadgeProps) {
  return (
    <span className={cn("px-2 py-1 rounded-full text-xs font-medium", getOnlineOfflineBadgeClass(isOnline), className)}>
      {isOnline ? "Online" : "Offline"}
    </span>
  );
}

/**
 * Role badge (owner, admin, viewer)
 */
interface RoleBadgeProps {
  role: string;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  return (
    <span className={cn("px-2 py-1 rounded-full text-xs font-medium", getRoleBadgeClass(role), className)}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

/**
 * Status card with icon, label, and value
 */
interface StatusCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  status: string;
  className?: string;
}

export function StatusCard({ icon, label, value, status, className }: StatusCardProps) {
  return (
    <div className={cn("flex items-center justify-between p-3 rounded-lg", getStatusColor(status), className)}>
      <div className="flex items-center space-x-2">
        <div className="p-1.5 rounded-lg">{icon}</div>
        <div>
          <div className="text-xs font-medium">{label}</div>
          <div className="text-[10px] text-muted-foreground">{value}</div>
        </div>
      </div>
      <StatusDot status={status} size="md" />
    </div>
  );
}
