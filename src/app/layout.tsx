import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/contexts/auth-context";
import { LicenseProvider } from "@/contexts/license-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hotware Dashboard",
  description: "Professional camera management and monitoring dashboard by Hotware",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <LicenseProvider>{children}</LicenseProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
