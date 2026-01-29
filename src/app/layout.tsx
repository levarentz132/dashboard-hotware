import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/contexts/auth-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hotware Dashboard",
  description: "Professional camera management and monitoring dashboard by Hotware",
  icons: {
    icon: process.env.NEXT_PUBLIC_BRAND_LOGO,
    apple: process.env.NEXT_PUBLIC_BRAND_LOGO,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
