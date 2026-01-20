"use client";

import { useLicense } from "@/contexts/license-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Key, Loader2, ShieldX, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ReactNode, useState, useEffect } from "react";

interface LicenseGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function LicenseGuard({ children, fallback }: LicenseGuardProps) {
  // Track if we're mounted (client-side)
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Don't render anything during SSR - will render on client
  if (!isMounted) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Now we're mounted, safe to use context
  return <LicenseGuardContent fallback={fallback}>{children}</LicenseGuardContent>;
}

// Inner component that uses the context
function LicenseGuardContent({ children, fallback }: LicenseGuardProps) {
  const { isLicensed, isLoading } = useLicense();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Verifying license...</p>
        </div>
      </div>
    );
  }

  if (!isLicensed) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return <LicenseRequiredOverlay />;
  }

  return <>{children}</>;
}

export function LicenseRequiredOverlay() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
            <ShieldX className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl">License Required</CardTitle>
          <CardDescription>
            You need an active license to access this feature. Please activate your license to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span>All features are locked</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span>Enter your license key to unlock</span>
            </div>
          </div>

          <Button asChild className="w-full">
            <Link href="/settings">
              <Key className="mr-2 h-4 w-4" />
              Activate License
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Don&apos;t have a license?{" "}
            <a href="mailto:sales@hotware.com" className="text-primary hover:underline">
              Contact sales
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// HOC for wrapping entire pages
export function withLicenseGuard<P extends object>(Component: React.ComponentType<P>) {
  return function LicenseGuardedComponent(props: P) {
    return (
      <LicenseGuard>
        <Component {...props} />
      </LicenseGuard>
    );
  };
}
