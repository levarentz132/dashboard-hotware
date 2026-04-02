"use client";

import { useState, useEffect } from "react";
import { Settings, Globe, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import Cookies from "js-cookie";

export function NxLocationSettings() {
    const [ip, setIp] = useState("localhost");
    const [port, setPort] = useState("7001");
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const savedIp = Cookies.get("nx_location_ip");
        const savedPort = Cookies.get("nx_location_port");
        if (savedIp) setIp(savedIp);
        if (savedPort) setPort(savedPort);
    }, []);

    const handleSave = () => {
        Cookies.set("nx_location_ip", ip, { expires: 365, path: "/" });
        Cookies.set("nx_location_port", port, { expires: 365, path: "/" });
        setIsOpen(false);
        // Refresh page to ensure all components/routes pick up the change
        window.location.reload();
    };

    return (
        <div className="fixed top-10 right-10 z-[60]">
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="h-12 px-4 bg-white/80 backdrop-blur-xl border-slate-200/60 hover:bg-white shadow-sm rounded-xl flex items-center gap-2 group"
                    >
                        <Globe className="w-4 h-4 text-slate-500 group-hover:text-blue-500 transition-colors" />
                        <div className="flex flex-col items-start leading-none gap-0.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NX Location</span>
                            <span className="text-xs font-bold text-slate-700">{ip}:{port}</span>
                        </div>
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-5 rounded-2xl border-slate-100 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-slate-800">NX Server Location</h4>
                            <Settings className="w-4 h-4 text-slate-400" />
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Set the IP and port for the local NX Witness server. This will be used for all local API requests.
                        </p>
                        
                        <div className="space-y-3 pt-2">
                            <div className="grid gap-2">
                                <Label htmlFor="nx-ip" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Server IP / Host</Label>
                                <Input
                                    id="nx-ip"
                                    value={ip}
                                    onChange={(e) => setIp(e.target.value)}
                                    placeholder="localhost or 192.168.1.100"
                                    className="h-10 rounded-lg border-slate-200 bg-slate-50 focus:bg-white transition-all"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="nx-port" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Server Port</Label>
                                <Input
                                    id="nx-port"
                                    value={port}
                                    onChange={(e) => setPort(e.target.value)}
                                    placeholder="7001"
                                    className="h-10 rounded-lg border-slate-200 bg-slate-50 focus:bg-white transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setIsOpen(false)}
                                className="flex-1 h-10 rounded-lg border-slate-200 text-slate-600 font-bold"
                            >
                                <X className="w-4 h-4 mr-2" />
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/20"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Save
                            </Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
