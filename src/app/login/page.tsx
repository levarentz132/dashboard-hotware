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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Loader2, Camera, LogIn, User, Lock, AlertCircle, Settings } from "lucide-react";
import { ConnectionSettingsDialog } from "@/components/settings/ConnectionSettingsDialog";
import { getNxCloudConfig } from "@/lib/connection-settings";

const loginSchema = z.object({
  username: z.string().min(1, "Username harus diisi"),
  password: z.string().min(1, "Password harus diisi"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
    // Read system_id from connection settings and pass it with login
    const cloudConfig = getNxCloudConfig();
    const loginData = {
      ...data,
      ...(cloudConfig.systemId ? { system_id: cloudConfig.systemId } : {}),
    };
    await login(loginData);
  };

  // Only show error if we have an explicit auth error OR a validation error AFTER submission
  const showErrorMessage = !!error || (isSubmitted && (!!errors.username || !!errors.password));

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4 py-6 sm:p-6">
      <div className="w-full max-w-[90vw] sm:max-w-md">
        {/* Form Card */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-5 sm:p-8 relative">
          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="Konfigurasi Koneksi"
          >
            <Settings className="w-5 h-5" />
          </button>

          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Selamat Datang</h2>
            <p className="text-sm sm:text-base text-slate-500 mt-1.5 sm:mt-2">Masuk ke akun Anda untuk melanjutkan</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-5">
            {/* Error Alert */}
            {showErrorMessage && (
              <Alert className="bg-red-50 border-red-200 text-red-700">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-600 ml-2">
                  {error || errors.username?.message || errors.password?.message || "Username atau password salah"}
                </AlertDescription>
              </Alert>
            )}

            {/* Username Field */}
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
                  placeholder="Masukkan username"
                  className={`pl-10 sm:pl-11 h-10 sm:h-12 text-sm sm:text-base bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg sm:rounded-xl transition-all ${
                    showErrorMessage ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""
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

            {/* Password Field */}
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
                  placeholder="Masukkan password"
                  className={`pl-10 sm:pl-11 pr-10 sm:pr-11 h-10 sm:h-12 text-sm sm:text-base bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg sm:rounded-xl transition-all ${
                    showErrorMessage ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""
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

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-10 sm:h-12 text-sm sm:text-base bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg sm:rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all duration-200"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  Masuk
                </>
              )}
            </Button>
          </form>

          {/* Help Text */}
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-100">
            <p className="text-xs sm:text-sm text-slate-500 text-center">
              Butuh bantuan? <span className="text-blue-600 font-medium">Hubungi Administrator</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-xs sm:text-sm mt-6 sm:mt-8">© 2026 Hotware Technology</p>
      </div>
      {/* Connection Settings Dialog */}
      <ConnectionSettingsDialog open={showSettings} onOpenChange={setShowSettings} />{" "}
    </div>
  );
}
