"use client";

import { useState, useEffect } from "react";
import { Settings, Server, Globe, Save, CheckCircle2, X, Loader2 } from "lucide-react";
import { API_CONFIG } from "@/lib/config";
import { showNotification } from "@/lib/notifications";

export default function VmsSettingsPopover() {
    const [open, setOpen] = useState(false);
    const [host, setHost] = useState("localhost");
    const [port, setPort] = useState("7001");
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (open) {
            setHost(localStorage.getItem("nx-server-host") || "localhost");
            setPort(localStorage.getItem("nx-server-port") || "7001");
            setIsSaved(false);
        }
    }, [open]);

    const handleSave = () => {
        const trimmedHost = host.trim();
        const trimmedPort = port.trim();
        if (!trimmedHost || !trimmedPort) return;

        setIsSaving(true);
        localStorage.setItem("nx-server-host", trimmedHost);
        localStorage.setItem("nx-server-port", trimmedPort);
        API_CONFIG.serverHost = trimmedHost;
        API_CONFIG.serverPort = trimmedPort;

        setTimeout(() => {
            setIsSaving(false);
            setIsSaved(true);
            showNotification({
                title: "Settings Saved",
                message: `VMS connection set to ${trimmedHost}:${trimmedPort}`,
                type: "success",
            });
        }, 600);
    };

    return (
        <div className="relative">
            {/* Trigger Button */}
            <button
                onClick={() => setOpen((v) => !v)}
                title="VMS Connection Settings"
                className={`
          flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
          transition-all duration-200 border
          ${open
                        ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30"
                        : "bg-white/80 backdrop-blur-sm text-slate-600 border-slate-200 hover:bg-white hover:border-blue-300 hover:text-blue-600 shadow-sm"
                    }
        `}
            >
                <Settings className={`w-4 h-4 ${open ? "text-white" : ""} transition-transform duration-300 ${open ? "rotate-90" : ""}`} />
                <span className="hidden sm:inline">Server</span>
            </button>

            {/* Popover Panel */}
            {open && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setOpen(false)}
                    />

                    {/* Panel */}
                    <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-white rounded-2xl shadow-2xl shadow-slate-200/60 border border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70 rounded-t-2xl">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-blue-100 rounded-lg">
                                    <Server className="w-3.5 h-3.5 text-blue-600" />
                                </div>
                                <span className="text-sm font-semibold text-slate-800">VMS Connection</span>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-4">
                            {/* Host */}
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                    <Globe className="w-3.5 h-3.5" />
                                    Server IP / Hostname
                                </label>
                                <input
                                    type="text"
                                    value={host}
                                    onChange={(e) => { setHost(e.target.value); setIsSaved(false); }}
                                    placeholder="localhost or 192.168.1.10"
                                    className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                                />
                            </div>

                            {/* Port */}
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                    <Server className="w-3.5 h-3.5" />
                                    Port
                                </label>
                                <input
                                    type="text"
                                    value={port}
                                    onChange={(e) => { setPort(e.target.value); setIsSaved(false); }}
                                    placeholder="7001"
                                    className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                                />
                            </div>

                            {/* Current value preview */}
                            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
                                <div className="w-2 h-2 rounded-full bg-blue-500/70 shrink-0" />
                                <span className="text-xs text-blue-700 font-mono truncate">
                                    https://{host || "localhost"}:{port || "7001"}
                                </span>
                            </div>

                            {/* Save Button */}
                            <button
                                onClick={handleSave}
                                disabled={isSaving || isSaved || !host.trim() || !port.trim()}
                                className={`
                  w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold
                  transition-all duration-200
                  ${isSaved
                                        ? "bg-green-500 text-white"
                                        : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/30"
                                    }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
                            >
                                {isSaving ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                                ) : isSaved ? (
                                    <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                                ) : (
                                    <><Save className="w-4 h-4" /> Save Settings</>
                                )}
                            </button>

                            <p className="text-[10px] text-slate-400 text-center">
                                Settings are saved locally and apply on next connection.
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
