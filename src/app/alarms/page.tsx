"use client";

import dynamic from "next/dynamic";

const AlarmConsole = dynamic(
  () => import("@/components/alarms/AlarmConsole"),
  { ssr: false }
);

export default function AlarmsPage() {
  return <AlarmConsole />;
}
