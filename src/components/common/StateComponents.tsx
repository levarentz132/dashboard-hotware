"use client";

import { AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Props for EmptyState component
 */
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Reusable empty state component
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mb-4 max-w-md">{description}</p>}
      {action && (
        <Button onClick={action.onClick} variant="outline">
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * Props for ErrorState component
 */
interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Reusable error state component
 */
export function ErrorState({ title = "Error", message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
      <AlertCircle className="w-12 h-12 text-destructive mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );
}

/**
 * Props for LoadingState component
 */
interface LoadingStateProps {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Reusable loading state component
 */
export function LoadingState({ message = "Loading...", className, size = "md" }: LoadingStateProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div className={cn("flex flex-col items-center justify-center p-8", className)}>
      <Loader2 className={cn("animate-spin text-primary mb-4", sizeClasses[size])} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/**
 * Props for LoadingSpinner component
 */
interface LoadingSpinnerProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

/**
 * Simple loading spinner
 */
export function LoadingSpinner({ className, size = "md" }: LoadingSpinnerProps) {
  const sizeClasses = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return <Loader2 className={cn("animate-spin", sizeClasses[size], className)} />;
}

/**
 * Refreshing indicator with animation
 */
interface RefreshingIndicatorProps {
  isRefreshing: boolean;
  className?: string;
}

export function RefreshingIndicator({ isRefreshing, className }: RefreshingIndicatorProps) {
  if (!isRefreshing) return null;

  return (
    <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
      <RefreshCw className="w-4 h-4 animate-spin" />
      <span className="text-xs">Refreshing...</span>
    </div>
  );
}
