"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

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
}

interface LicenseContextType {
  license: LicenseInfo | null;
  isLoading: boolean;
  isLicensed: boolean;
  checkLicense: () => Promise<void>;
  error: string | null;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkLicense = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/licenses/validate?action=status");
      const data = await response.json();

      if (data.success && data.license?.isValid) {
        setLicense(data.license);
      } else {
        setLicense({ isValid: false });
      }
    } catch (err) {
      console.error("Error checking license:", err);
      setError("Failed to verify license");
      setLicense({ isValid: false });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkLicense();
  }, [checkLicense]);

  const isLicensed = license?.isValid === true;

  return (
    <LicenseContext.Provider value={{ license, isLoading, isLicensed, checkLicense, error }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const context = useContext(LicenseContext);
  if (context === undefined) {
    throw new Error("useLicense must be used within a LicenseProvider");
  }
  return context;
}
