// Login Page
// Unified entry point with License Login (Top-Left) and NxVMS Login (Center)

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { LicenseLogin } from "@/components/auth/license-login";
import { NxVmsLogin } from "@/components/auth/nx-vms-login";
import { NxLocationSettings } from "@/components/auth/nx-location-settings";

export default function LoginPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-100/30 rounded-full blur-[120px] pointer-events-none" />

      {/* Floating UI Elements */}
      <LicenseLogin />
      <NxLocationSettings />

      {/* Main Centered Card */}
      <div className="w-full max-w-md relative z-10">
        <NxVmsLogin />
      </div>
    </div>
  );
}
