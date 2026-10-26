"use client";

import dynamic from "next/dynamic";

const LoginClient = dynamic(() => import("./login-client"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="text-center p-8">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-1">Hotware Dashboard</h2>
        <p className="text-slate-400 text-sm">Loading login...</p>
      </div>
    </div>
  ),
});

export default function LoginPage() {
  return <LoginClient />;
}

