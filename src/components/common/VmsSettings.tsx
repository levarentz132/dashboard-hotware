"use client";

import { useState, useEffect } from "react";
import { Settings, Server, Globe, Save, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { API_CONFIG } from "@/lib/config";
import { showNotification } from "@/lib/notifications";

export default function VmsSettings() {
    const [host, setHost] = useState("");
    const [port, setPort] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        // Load current values
        setHost(localStorage.getItem("nx-server-host") || "localhost");
        setPort(localStorage.getItem("nx-server-port") || "7001");
    }, []);

    const handleSave = () => {
        setIsSaving(true);

        localStorage.setItem("nx-server-host", host);
        localStorage.setItem("nx-server-port", port);

        // Update API_CONFIG in-memory for any code that still references it directly
        API_CONFIG.serverHost = host;
        API_CONFIG.serverPort = port;

        setTimeout(() => {
            setIsSaving(false);
            setIsSaved(true);
            showNotification({
                title: "Settings Saved",
                message: `VMS connection set to ${host}:${port}`,
                type: "success",
            });
        }, 600);
    };

    return (
        <Card className="w-full max-w-2xl mx-auto shadow-md border-slate-200">
            <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <Settings className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <CardTitle>VMS Connection Settings</CardTitle>
                        <CardDescription>
                            Configure the IP address and port for the local Nx Witness server.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="vms-host" className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-slate-500" />
                            Server IP / Hostname
                        </Label>
                        <Input
                            id="vms-host"
                            placeholder="localhost or 192.168.1.10"
                            value={host}
                            onChange={(e) => {
                                setHost(e.target.value);
                                setIsSaved(false);
                            }}
                            className="font-mono"
                        />
                        <p className="text-xs text-slate-500">
                            The address of the Nx Witness server (default: localhost).
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="vms-port" className="flex items-center gap-2">
                            <Server className="w-4 h-4 text-slate-500" />
                            Server Port
                        </Label>
                        <Input
                            id="vms-port"
                            placeholder="7001"
                            value={port}
                            onChange={(e) => {
                                setPort(e.target.value);
                                setIsSaved(false);
                            }}
                            className="font-mono"
                        />
                        <p className="text-xs text-slate-500">
                            The port used by the server (default: 7001).
                        </p>
                    </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
                    <RefreshCw className="w-5 h-5 shrink-0 text-blue-500" />
                    <p>
                        Changing these settings will update how the dashboard connects to your local system.
                        The page will reload after saving to apply the changes.
                    </p>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t bg-slate-50/30 py-4">
                <Button
                    onClick={handleSave}
                    disabled={isSaving || isSaved}
                    className="min-w-[120px]"
                >
                    {isSaving ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : isSaved ? (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                    ) : (
                        <Save className="w-4 h-4 mr-2" />
                    )}
                    {isSaving ? "Saving..." : isSaved ? "Saved" : "Save Changes"}
                </Button>
            </CardFooter>
        </Card>
    );
}
