"use client";

import DraggableDashboard from "@/components/dashboard/DraggableDashboard";
import { LicenseGuard } from "@/components/auth/LicenseGuard";

export default function DashboardFullViewPage() {
  return (
    <LicenseGuard>
      <DraggableDashboard />
    </LicenseGuard>
  );
}
