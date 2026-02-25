// Login Page
// User authentication entry point

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Camera, LogIn, User, Lock, AlertCircle } from "lucide-react";
import { NxAuthentication } from "@/components/auth/nx-authentication";
import Cookies from "js-cookie";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error, clearError } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitted },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    clearError();
    await login(data);
  };

  const showErrorMessage = !!error || (isSubmitted && (!!errors.username || !!errors.password));

  const checkLocalSession = () => {
    const stored = Cookies.get("local_nx_user");
    return !!stored;
  };

  const handleMainSubmit = async (data: LoginFormData) => {
    const cloudStored = Cookies.get("nx_cloud_session");
    const hasCloudLogin = !!cloudStored;

    // 1. Determine base IDs from storage or sessions
    let storedSystemId = Cookies.get("nx_system_id") || "";
    let storedServerId = Cookies.get("nx_server_id") || "";

    // Fallback: parse system_id from cloud session cookie if dedicated key is missing
    if (!storedSystemId && cloudStored) {
      try {
        const cloud = JSON.parse(cloudStored);
        storedSystemId = cloud.ownerSystemId || "";
      } catch (e) { }
    }

    // 2. Mutually exclusive routing:
    //    Cloud connected  → use system_id only  (server_id is a local concept)
    //    Local only       → use server_id only  (promote system_id → server_id if needed)
    let system_id: string;
    let server_id: string;

    if (hasCloudLogin) {
      system_id = storedSystemId;
      server_id = "";           // never send server_id when cloud is connected
    } else {
      system_id = "";
      // If no server_id stored but we have a system_id, treat it as server_id
      server_id = storedServerId || storedSystemId;
    }

    if (!system_id && !server_id) {
      clearError();
      alert("Please provide a System ID or Server ID, or connect to NX first.");
      return;
    }

    console.log(`[Form Submission] Mode: ${hasCloudLogin ? 'Cloud' : 'Local'}, System: ${system_id || 'None'}, Server: ${server_id || 'None'}`);

    await login({
      username: data.username,
      password: data.password,
      system_id,
      server_id
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6 relative overflow-hidden">      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-100/30 rounded-full blur-[120px] pointer-events-none" />

      <NxAuthentication />

      <div className="w-full max-w-md relative z-10 transition-all duration-500 animate-in fade-in slide-in-from-bottom-5">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-800">Welcome</h2>
            <p className="text-slate-500 mt-2">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit(handleMainSubmit)} className="space-y-5">
            {showErrorMessage && (
              <div className="flex items-center p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 animate-in fade-in slide-in-from-top-1 duration-200">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <div className="ml-3 text-sm font-medium text-red-600">
                  {error || errors.username?.message || errors.password?.message || "Invalid username or password"}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-700 font-medium">
                Username
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter username"
                  className={`pl-11 h-12 bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all ${showErrorMessage ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""
                    }`}
                  {...register("username")}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      document.getElementById("password")?.focus();
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-medium">
                Password
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  className={`pl-11 pr-11 h-12 bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all ${showErrorMessage ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""
                    }`}
                  {...register("password")}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all duration-200"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  Login
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-sm text-slate-500 text-center">
              Need help? <span className="text-blue-600 font-medium">Contact Administrator</span>
            </p>
          </div>
        </div>

        <p className="text-center text-slate-400 text-sm mt-8">© 2026 Hotware Technology</p>
      </div>
    </div>
  );
}
