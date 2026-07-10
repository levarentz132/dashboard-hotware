"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, LogIn, User, Lock, AlertCircle, ShieldCheck } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Cookies from "js-cookie";
import { useNxConfig } from "@/hooks/use-nx-config";


const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LicenseLogin() {
    const [showPassword, setShowPassword] = useState(false);
    const { login, isLoading, error, clearError, user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors, isSubmitted },
    } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            username: process.env.NEXT_PUBLIC_LICENSE_USERNAME || "",
            password: process.env.NEXT_PUBLIC_LICENSE_PASSWORD || "",
        },
    });

    const { config, saveConfig } = useNxConfig();
    const [isSaved, setIsSaved] = useState(false);
    const [hasSaved, setHasSaved] = useState(false);

    // Pre-fill from saved cookies or config (optional override of defaults)
    useEffect(() => {
        if (!config) return;

        const { NEXT_PUBLIC_LICENSE_USERNAME, NEXT_PUBLIC_LICENSE_PASSWORD } = config;
        
        if (NEXT_PUBLIC_LICENSE_USERNAME && NEXT_PUBLIC_LICENSE_PASSWORD) {
            setHasSaved(true);
            setValue("username", NEXT_PUBLIC_LICENSE_USERNAME);
            setValue("password", NEXT_PUBLIC_LICENSE_PASSWORD); // Will be "******" (masked) from secure server config
            
            // Sync username to cookies for persistence
            Cookies.set("license_saved_user", NEXT_PUBLIC_LICENSE_USERNAME, { expires: 365, path: '/' });
            return;
        }

        // Priority 2: Check saved cookies (username only)
        const savedUser = Cookies.get("license_saved_user");
        if (savedUser) {
            setHasSaved(true);
            setValue("username", savedUser);
            return;
        }

        // Priority 3: Check Electron config
        const extConfig = typeof window !== 'undefined' ? (window as any).electronConfig : null;
        if (extConfig) {
            if (extConfig.NEXT_PUBLIC_LICENSE_USERNAME && extConfig.NEXT_PUBLIC_LICENSE_PASSWORD) {
                setValue("username", extConfig.NEXT_PUBLIC_LICENSE_USERNAME);
                setValue("password", extConfig.NEXT_PUBLIC_LICENSE_PASSWORD);
            }
        }
    }, [config, setValue]);

    const showErrorMessage = !!error || (isSubmitted && (!!errors.username || !!errors.password));

    const handleSaveCredentials = async (data: LoginFormData) => {
        // Save username locally for immediate feedback
        Cookies.set("license_saved_user", data.username, { expires: 365, path: '/' });
        
        // Save to server for all network users using our reusable hook
        await saveConfig({
            NEXT_PUBLIC_LICENSE_USERNAME: data.username,
            NEXT_PUBLIC_LICENSE_PASSWORD: data.password
        });

        setIsSaved(true);
        setHasSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
        
        // Also clear any existing auth error when saving new ones
        clearError();
    };

    return (
        <div className="fixed top-6 left-6 z-50 select-none">
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        className="h-16 w-80 px-5 bg-white/80 backdrop-blur-xl border-slate-200/60 hover:bg-white hover:border-blue-400/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all group rounded-2xl border-2"
                    >
                        <div className="flex items-center gap-3 w-full">
                            <div className={`p-2 rounded-xl transition-all duration-300 ${
                                user ? "bg-blue-50 text-blue-600 shadow-sm" : "bg-slate-50 text-slate-400"
                            }`}>
                                <ShieldCheck className={`w-4 h-4 ${user ? "animate-pulse" : ""}`} />
                            </div>
                            <div className="flex flex-col items-start gap-0.5 flex-1 overflow-hidden">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                                    {user ? "Authenticated" : "License Config"}
                                </span>
                                <span className="text-sm font-bold leading-tight truncate w-full text-left text-slate-700">
                                    {user ? user.username : hasSaved ? "Credentials Active" : "Manage Credentials"}
                                </span>
                            </div>
                            <div className="relative flex h-2.5 w-2.5 ml-2 mr-1">
                                <div className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                    user ? "bg-blue-400" : hasSaved ? "bg-green-400" : "bg-slate-300"
                                }`}></div>
                                <div className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                                    user ? "bg-blue-500" : hasSaved ? "bg-green-500" : "bg-slate-400"
                                }`}></div>
                            </div>
                        </div>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[380px] p-6 rounded-3xl border-slate-100 shadow-[0_20px_50px_rgba(8,_112,_184,_0.15)] animate-in fade-in zoom-in-95 duration-200 mt-2">
                    <div className="space-y-6">
                        <div className="text-center mb-2">
                            <h3 className="text-xl font-bold text-slate-800">License Credentials</h3>
                        </div>

                        <form onSubmit={handleSubmit(handleSaveCredentials)} className="space-y-5">
                            {showErrorMessage && (
                                <div className="flex items-center p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                                    <div className="ml-3 text-xs font-medium text-red-600">
                                        {error || errors.username?.message || errors.password?.message || "Invalid credentials"}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="license-username" className="text-slate-700 font-bold text-xs uppercase tracking-widest ml-1">
                                    Username
                                </Label>
                                <div className="relative">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                                        <User className="w-4 h-4" />
                                    </div>
                                    <Input
                                        id="license-username"
                                        type="text"
                                        placeholder="Enter license username"
                                        className="pl-10 h-11 bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded-xl transition-all"
                                        {...register("username")}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                document.getElementById("license-password")?.focus();
                                            }
                                        }}
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="license-password" className="text-slate-700 font-bold text-xs uppercase tracking-widest ml-1">
                                    Password
                                </Label>
                                <div className="relative">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                    <Input
                                        id="license-password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        className="pl-10 pr-10 h-11 bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded-xl transition-all"
                                        {...register("password")}
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-100/80 z-20"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className={`w-full h-12 font-bold rounded-xl shadow-lg transition-all duration-200 ${
                                    isSaved ? "bg-green-500 hover:bg-green-600 shadow-green-500/30" : 
                                    hasSaved ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/30" : "bg-slate-800 hover:bg-slate-900 shadow-slate-800/30"
                                } text-white`}
                                disabled={isLoading}
                            >
                                {isSaved ? (
                                    <>
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        Credentials Saved
                                    </>
                                ) : hasSaved ? (
                                    <>
                                        <LogIn className="mr-2 h-4 w-4" />
                                        Edit Credentials
                                    </>
                                ) : (
                                    <>
                                        <LogIn className="mr-2 h-4 w-4" />
                                        Save Credentials
                                    </>
                                )}
                            </Button>
                        </form>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
