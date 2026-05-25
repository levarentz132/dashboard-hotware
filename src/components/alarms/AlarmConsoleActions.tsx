"use client";

import type { ComponentProps } from "react";
import { RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlarmExportDialog } from "./AlarmExportDialog";

type AlarmExportDialogProps = ComponentProps<typeof AlarmExportDialog>;

interface AlarmConsoleActionsProps {
  events: AlarmExportDialogProps["events"];
  stats: AlarmExportDialogProps["stats"];
  systemName: string;
  filterDateFrom: string;
  filterDateTo: string;
  onRefresh: () => void;
  onCloudLogout: () => void;
  refreshDisabled: boolean;
  refreshSpinning: boolean;
  showCloudLogout: boolean;
  loggingOut: boolean;
}

/**
 * Alarm console toolbar actions (refresh, export, cloud logout).
 */
export function AlarmConsoleActions({
  events,
  stats,
  systemName,
  filterDateFrom,
  filterDateTo,
  onRefresh,
  onCloudLogout,
  refreshDisabled,
  refreshSpinning,
  showCloudLogout,
  loggingOut,
}: AlarmConsoleActionsProps) {
  return (
    <>
      {showCloudLogout && (
        <Button
          variant="ghost"
          size="default"
          className="h-10 text-xs text-muted-foreground hover:text-red-500 gap-1"
          onClick={onCloudLogout}
          disabled={loggingOut}
        >
          {loggingOut ? <RefreshCw className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
          <span className="hidden sm:inline">Logout</span>
        </Button>
      )}

      <AlarmExportDialog
        events={events}
        stats={stats}
        systemName={systemName}
        period={{ from: filterDateFrom, to: filterDateTo }}
      />

      <button
        onClick={onRefresh}
        disabled={refreshDisabled}
        className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm h-10 transition-colors shadow-sm"
      >
        <RefreshCw className={`w-4 h-4 ${refreshSpinning ? "animate-spin" : ""}`} />
        <span className="font-medium">Refresh</span>
      </button>
    </>
  );
}
