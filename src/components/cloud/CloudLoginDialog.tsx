"use client";

import { useState } from "react";
import { Cloud, Eye, EyeOff, Loader2, LogIn, AlertCircle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CloudLoginDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    systemId: string;
    systemName: string;
    onLoginSuccess: () => void;
}

export function CloudLoginDialog({ open, onOpenChange, systemId, systemName, onLoginSuccess }: CloudLoginDialogProps) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!username || !password) {
            setError("Username and password are required");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/cloud/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    systemId,
                    username,
                    password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Login failed");
            }

            // Success - clear form and close dialog
            setUsername("");
            setPassword("");
            onOpenChange(false);
            onLoginSuccess();
        } catch (err) {
            console.error("Login error:", err);
            setError(err instanceof Error ? err.message : "Login failed. Check username and password.");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            setUsername("");
            setPassword("");
            setError(null);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Cloud className="h-5 w-5 text-blue-500" />
                        Login to Cloud System
                    </DialogTitle>
                    <DialogDescription>
                        Enter credentials to access <strong>{systemName}</strong>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleLogin}>
                    <div className="space-y-4 py-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="username">Username / Email</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="user@example.com"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={loading}
                                autoComplete="username"
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                    autoComplete="current-password"
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <p className="text-xs text-gray-500">Use NX Cloud credentials or local system account for {systemName}</p>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading} className="gap-2">
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Logging in...
                                </>
                            ) : (
                                <>
                                    <LogIn className="h-4 w-4" />
                                    Login
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog >
    );
}
