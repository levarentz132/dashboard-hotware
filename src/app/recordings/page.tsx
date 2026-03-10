"use client";

import dynamic from "next/dynamic";

const CloudRecordings = dynamic(
  () => import("@/components/recordings/CloudRecordings"),
  { ssr: false }
);

export default function RecordingsPage() {
  return <CloudRecordings />;
}
