"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Key,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Calendar,
  Package,
  Mail,
  RefreshCw,
  User,
  Hash,
} from "lucide-react";

interface LicenseInfo {
  isValid: boolean;
  id?: string;
  licenseKey?: string;
  productName?: string;
  userEmail?: string | null;
  userName?: string | null;
  status?: string;
  type?: string;
  maxActivations?: number;
  currentActivations?: number;
  expiresAt?: string;
  activatedAt?: string;
  message?: string;
}

export default function SettingsPage() {
  const [licenseKey, setLicenseKey] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check license status on mount
  useEffect(() => {
    checkLicenseStatus();
  }, []);

  // Check current license status
  const checkLicenseStatus = async () => {
    setIsChecking(true);
    setError(null);

    try {
      const response = await fetch("/api/licenses/validate?action=status");
      const data = await response.json();

      if (data.success) {
        setLicenseInfo(data.license);
      } else {
        setLicenseInfo({ isValid: false, message: data.message || "No active license found" });
      }
    } catch (err) {
      console.error("Error checking license:", err);
      setError("Failed to check license status");
    } finally {
      setIsChecking(false);
    }
  };

  // Activate license
  const activateLicense = async () => {
    if (!licenseKey.trim()) {
      setError("Please enter a license key");
      return;
    }

    setIsActivating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/licenses/validate?action=activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess("License activated successfully!");
        setLicenseInfo(data.license);
        setLicenseKey("");
      } else {
        setError(data.message || "Failed to activate license");
      }
    } catch (err) {
      console.error("Error activating license:", err);
      setError("Failed to activate license. Please try again.");
    } finally {
      setIsActivating(false);
    }
  };

  // Deactivate license
  const deactivateLicense = async () => {
    if (!confirm("Are you sure you want to deactivate this license?")) {
      return;
    }

    setIsActivating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/licenses/validate?action=deactivate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.success) {
        setSuccess("License deactivated successfully");
        setLicenseInfo(null);
      } else {
        setError(data.message || "Failed to deactivate license");
      }
    } catch (err) {
      console.error("Error deactivating license:", err);
      setError("Failed to deactivate license");
    } finally {
      setIsActivating(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const isExpiringSoon = (expiresAt?: string) => {
    if (!expiresAt) return false;
    const expDate = new Date(expiresAt);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your application settings and license</p>
        </div>
      </div>

      {/* License Activation Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            License Activation
          </CardTitle>
          <CardDescription>Enter your license key to activate premium features</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-600">Success</AlertTitle>
              <AlertDescription className="text-green-600">{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="licenseKey">License Key</Label>
            <div className="flex gap-2">
              <Input
                id="licenseKey"
                type="text"
                placeholder="LIC-XXXXX-XXXXX-XXXXX-XXXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                className="font-mono"
                disabled={isActivating}
              />
              <Button onClick={activateLicense} disabled={isActivating || !licenseKey.trim()}>
                {isActivating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Activating...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Activate
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the license key provided to you. Format: LIC-XXXXX-XXXXX-XXXXX-XXXXX
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={checkLicenseStatus} disabled={isChecking}>
              {isChecking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Check License Status
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current License Info */}
      {licenseInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                License Information
              </span>
              {licenseInfo.isValid ? (
                isExpired(licenseInfo.expiresAt) ? (
                  <Badge variant="destructive">Expired</Badge>
                ) : isExpiringSoon(licenseInfo.expiresAt) ? (
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                    Expiring Soon
                  </Badge>
                ) : (
                  <Badge variant="default" className="bg-green-600">
                    Active
                  </Badge>
                )
              ) : (
                <Badge variant="destructive">Invalid</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {licenseInfo.isValid ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground flex items-center gap-1">
                      <Key className="h-3 w-3" />
                      License Key
                    </Label>
                    <p className="font-mono text-sm">{licenseInfo.licenseKey || "N/A"}</p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      Product
                    </Label>
                    <p className="text-sm">{licenseInfo.productName || "N/A"}</p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      User
                    </Label>
                    <p className="text-sm">{licenseInfo.userName || "N/A"}</p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      Email
                    </Label>
                    <p className="text-sm">{licenseInfo.userEmail || "N/A"}</p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      License Type
                    </Label>
                    <Badge variant="outline" className="capitalize">
                      {licenseInfo.type || "N/A"}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Expires
                    </Label>
                    <p className="text-sm">
                      {formatDate(licenseInfo.expiresAt)}
                      {isExpiringSoon(licenseInfo.expiresAt) && (
                        <span className="ml-2 text-yellow-600">
                          <AlertTriangle className="inline h-3 w-3 mr-1" />
                          Expiring soon
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Activated On</Label>
                    <p className="text-sm">{formatDate(licenseInfo.activatedAt)}</p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Activations</Label>
                    <p className="text-sm">
                      {licenseInfo.currentActivations || 0} / {licenseInfo.maxActivations || "Unlimited"}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button variant="destructive" size="sm" onClick={deactivateLicense} disabled={isActivating}>
                    {isActivating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-2 h-4 w-4" />
                        Deactivate License
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <XCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{licenseInfo.message || "No active license found"}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Enter a valid license key above to activate premium features
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
