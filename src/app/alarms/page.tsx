"use client";

import AlarmConsole from "@/components/alarms/AlarmConsole";
import { LicenseGuard } from "@/components/auth/LicenseGuard";

export default function AlarmsPage() {
  return (
    <LicenseGuard>
      <AlarmConsole />
    </LicenseGuard>
  );
}
