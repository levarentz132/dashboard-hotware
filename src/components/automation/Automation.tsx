"use client";

import { useState, useEffect } from "react";
import {
    Plus,
    Search,
    Thermometer,
    Droplets,
    Lightbulb,
    Fan,
    Wind,
    Battery,
    LayoutGrid,
    Loader2,
    ChevronRight,
    ArrowLeft,
    Box
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Device {
    id: string;
    name: string;
    type: 'temperature' | 'humidity' | 'light' | 'fan' | 'other';
    value: string | number;
    unit?: string;
    status: 'online' | 'offline';
    battery?: number;
    room: string;
    humidity?: number;
    wind?: number;
    co2?: number;
    temperature?: number;
    api_url?: string;
}

export default function Automation() {
    const [rooms, setRooms] = useState<string[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeRoom, setActiveRoom] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");

    // Form States
    const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
    const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
    const [newRoomName, setNewRoomName] = useState("");
    const [newDevice, setNewDevice] = useState({
        name: "",
        type: "temperature" as Device['type'],
        room: "",
        unit: "",
        api_url: ""
    });
    const [addDeviceStep, setAddDeviceStep] = useState(1);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            const res = await fetch("/api/automation");
            const data = await res.json();
            if (data.success) {
                setRooms(["All", ...data.data.rooms]);
                setDevices(data.data.devices);
            }
        } catch (error) {
            console.error("Failed to fetch automation data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleAddRoom = async () => {
        if (!newRoomName.trim()) return;
        try {
            const res = await fetch("/api/automation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "add_room", payload: { name: newRoomName } })
            });
            const data = await res.json();
            if (data.success) {
                setNewRoomName("");
                setIsAddRoomOpen(false);
                fetchData();
            }
        } catch (error) {
            console.error("Failed to add room:", error);
        }
    };

    const handleAddDevice = async () => {
        if (!newDevice.name || !newDevice.room) return;
        try {
            const res = await fetch("/api/automation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "add_device", payload: newDevice })
            });
            const data = await res.json();
            if (data.success) {
                setNewDevice({ name: "", type: "temperature", room: "", unit: "", api_url: "" });
                setAddDeviceStep(1);
                setSelectedModel(null);
                setIsAddDeviceOpen(false);
                fetchData();
            }
        } catch (error) {
            console.error("Failed to add device:", error);
        }
    };

    const filteredDevices = devices.filter(device => {
        const matchesRoom = activeRoom === "All" || device.room === activeRoom;
        const matchesSearch = device.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesRoom && matchesSearch;
    });

    const groupedDevices = {
        temperature: filteredDevices.filter(d => d.type === 'temperature'),
        humidity: filteredDevices.filter(d => d.type === 'humidity'),
        lights: filteredDevices.filter(d => d.type === 'light'),
        fans: filteredDevices.filter(d => d.type === 'fan'),
        others: filteredDevices.filter(d => d.type === 'other'),
    };

    const DeviceCard = ({ device }: { device: Device }) => {
        const getIcon = () => {
            switch (device.type) {
                case 'temperature': return <Thermometer className="w-5 h-5 text-orange-500" />;
                case 'humidity': return <Droplets className="w-5 h-5 text-blue-500" />;
                case 'light': return <Lightbulb className="w-5 h-5 text-yellow-500" />;
                case 'fan': return <Fan className="w-5 h-5 text-cyan-500" />;
                default: return <Wind className="w-5 h-5 text-slate-500" />;
            }
        };

        return (
            <Card className="group hover:shadow-xl transition-all duration-500 border-slate-200/60 overflow-hidden bg-white hover:border-blue-500/30">
                <CardContent className="p-0 relative">
                    {/* Status Gradient Indicator (Corner Blend Style) */}
                    <div className={cn(
                        "absolute top-0 right-0 w-14 h-14 rounded-bl-full transition-all duration-700 pointer-events-none",
                        device.status === 'online'
                            ? "bg-gradient-to-bl from-emerald-500/20 via-emerald-500/5 to-transparent"
                            : "bg-gradient-to-bl from-red-500/20 via-red-500/5 to-transparent"
                    )} />

                    <div className="p-5 flex justify-between items-start relative z-10">
                        <div className="flex gap-4">
                            <div className={cn(
                                "p-3 rounded-2xl transition-all duration-500 shadow-sm",
                                device.status === 'online' ? "bg-slate-50 group-hover:bg-blue-50 group-hover:scale-110" : "bg-slate-100 opacity-60"
                            )}>
                                {getIcon()}
                            </div>
                            <div className="space-y-0.5">
                                <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">{device.name}</h3>
                                <div className="flex items-center gap-2">
                                    {device.battery !== undefined && (
                                        <>
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                                <Battery className="w-3 h-3" />
                                                {device.battery}%
                                            </div>
                                            <span className="text-[10px] text-slate-300">•</span>
                                        </>
                                    )}
                                    <span className={cn(
                                        "text-[10px] font-bold uppercase tracking-tighter",
                                        device.status === 'online' ? "text-emerald-500" : "text-red-400"
                                    )}>
                                        {device.status === 'online' ? 'Online' : 'Disconnected'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Dynamic Stats Grid */}
                    {(() => {
                        const showTemp = device.type === 'temperature' || device.temperature !== undefined;
                        const showHum = device.type === 'humidity' || device.humidity !== undefined;
                        const showWind = device.wind !== undefined;
                        const showCo2 = device.co2 !== undefined;
                        const visibleCount = [showTemp, showHum, showWind, showCo2].filter(Boolean).length;

                        if (visibleCount === 0) return null;

                        return (
                            <div className={cn(
                                "grid border-t border-slate-100 bg-slate-50/30 w-full",
                                visibleCount === 2 ? "grid-cols-2" :
                                    visibleCount === 3 ? "grid-cols-3" :
                                        visibleCount === 4 ? "grid-cols-4" :
                                            "flex justify-center" // Use flex for 1 item to keep it left-aligned
                            )}>
                                {showTemp && (
                                    <div className={cn(
                                        "p-3 flex flex-col items-center justify-center gap-1 min-w-[100px]",
                                        visibleCount > 1 && "border-r border-slate-100"
                                    )}>
                                        <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                                        <div className="flex flex-col items-center">
                                            <span className="text-[11px] font-bold text-slate-900">
                                                {device.status === 'offline' || device.value === 'unavailable' || device.value === 'unknown'
                                                    ? '-'
                                                    : (device.type === 'temperature' ? `${device.value}${device.unit || '°C'}` : `${device.temperature}°C`)}
                                            </span>
                                            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-tighter">Temp</span>
                                        </div>
                                    </div>
                                )}
                                {showHum && (
                                    <div className={cn(
                                        "p-3 flex flex-col items-center justify-center gap-1 min-w-[100px]",
                                        visibleCount > 2 && "border-r border-slate-100"
                                    )}>
                                        <Droplets className="w-3.5 h-3.5 text-blue-400" />
                                        <div className="flex flex-col items-center">
                                            <span className="text-[11px] font-bold text-slate-900">
                                                {device.status === 'offline' || device.value === 'unavailable' || device.value === 'unknown'
                                                    ? '-'
                                                    : (device.type === 'humidity' ? `${device.value}%` : `${device.humidity}%`)}
                                            </span>
                                            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-tighter">Hum</span>
                                        </div>
                                    </div>
                                )}
                                {showWind && (
                                    <div className={cn(
                                        "p-3 flex flex-col items-center justify-center gap-1 min-w-[100px]",
                                        visibleCount > 3 && "border-r border-slate-100"
                                    )}>
                                        <Wind className="w-3.5 h-3.5 text-cyan-400" />
                                        <div className="flex flex-col items-center">
                                            <span className="text-[11px] font-bold text-slate-900">{device.wind}</span>
                                            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-tighter">Wind</span>
                                        </div>
                                    </div>
                                )}
                                {showCo2 && (
                                    <div className="p-3 flex flex-col items-center justify-center gap-1 min-w-[100px]">
                                        <Badge variant="outline" className="h-4 p-0 px-1 border-slate-200 text-[8px]">CO2</Badge>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[11px] font-bold text-slate-900">{device.co2}</span>
                                            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-tighter">PPM</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </CardContent>
            </Card>
        );
    };

    const DeviceGroup = ({ title, devices, icon: Icon }: { title: string, devices: Device[], icon: any }) => {
        if (devices.length === 0) return null;
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <div className="p-1.5 bg-slate-900 rounded-lg text-white">
                        <Icon className="w-4 h-4" />
                    </div>
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">
                        {title} <span className="text-slate-400 font-medium lowercase ml-1">({devices.length})</span>
                    </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {devices.map(device => (
                        <DeviceCard key={device.id} device={device} />
                    ))}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col lg:flex-row gap-8">
                {/* Sidebar/Navigation for Rooms */}
                <div className="w-full lg:w-72 shrink-0 space-y-6">
                    <div className="bg-white p-4 rounded-3xl border border-slate-200/60 shadow-sm space-y-4">
                        <div className="relative group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            <Input
                                placeholder="Search devices..."
                                className="pl-10 h-11 bg-slate-50 border-transparent focus:bg-white focus:border-blue-500/20 transition-all rounded-2xl text-sm font-medium"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] px-3 mb-3">Location Groups</p>
                            {rooms.map(room => (
                                <button
                                    key={room}
                                    onClick={() => setActiveRoom(room)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 group",
                                        activeRoom === room
                                            ? "bg-slate-900 text-white shadow-xl shadow-slate-200"
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                >
                                    <span className="text-sm font-semibold">{room}</span>
                                    <div className={cn(
                                        "w-1.5 h-1.5 rounded-full transition-colors",
                                        activeRoom === room ? "bg-white" : "bg-slate-200 group-hover:bg-blue-400"
                                    )} />
                                </button>
                            ))}
                            <Dialog open={isAddRoomOpen} onOpenChange={setIsAddRoomOpen}>
                                <DialogTrigger asChild>
                                    <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-blue-600 hover:bg-blue-50 transition-all border-2 border-dashed border-transparent hover:border-blue-100 mt-2 group">
                                        <div className="p-1 bg-blue-100 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-all">
                                            <Plus className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="text-sm font-bold">Add New Room</span>
                                    </button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md rounded-3xl">
                                    <DialogHeader>
                                        <DialogTitle className="text-xl font-bold">Add New Room</DialogTitle>
                                        <DialogDescription className="text-slate-500">Create a new location group for your devices.</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="room-name" className="text-sm font-bold ml-1">Room Name</Label>
                                            <Input
                                                id="room-name"
                                                placeholder="e.g. Master Bedroom"
                                                value={newRoomName}
                                                onChange={(e) => setNewRoomName(e.target.value)}
                                                className="rounded-2xl h-12 border-slate-200/60"
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl h-12 font-bold shadow-lg shadow-slate-200"
                                            onClick={handleAddRoom}
                                        >
                                            Create Room
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>

                {/* Device Grid Area */}
                <div className="flex-1 space-y-10 pb-10">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{activeRoom} Overview</h2>
                            <p className="text-sm text-slate-500 font-medium mt-0.5">Showing {filteredDevices.length} devices found</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Dialog open={isAddDeviceOpen} onOpenChange={(open) => {
                                setIsAddDeviceOpen(open);
                                if (!open) {
                                    setAddDeviceStep(1);
                                    setSelectedModel(null);
                                }
                            }}>
                                <DialogTrigger asChild>
                                    <Button className="bg-slate-900 hover:bg-slate-800 text-white rounded-2xl h-12 px-6 gap-2 shadow-lg shadow-slate-200 transition-all font-semibold">
                                        <Plus className="w-5 h-5" />
                                        <span className="hidden sm:inline">Add Device</span>
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-lg rounded-3xl">
                                    <DialogHeader>
                                        <DialogTitle className="text-xl font-bold">
                                            {addDeviceStep === 1 ? "Select Device Model" : "Configure Device"}
                                        </DialogTitle>
                                        <DialogDescription className="text-slate-500">
                                            {addDeviceStep === 1
                                                ? "Choose a compatible model for your new device."
                                                : `Registering your ${selectedModel} device.`}
                                        </DialogDescription>
                                    </DialogHeader>

                                    {addDeviceStep === 1 ? (
                                        <div className="grid grid-cols-1 gap-3 py-6">
                                            <button
                                                onClick={() => {
                                                    setSelectedModel("Tuya");
                                                    setAddDeviceStep(2);
                                                }}
                                                className="flex items-center justify-between p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50/30 transition-all group text-left"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-blue-100 transition-colors">
                                                        <Box className="w-6 h-6 text-slate-600 group-hover:text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900">Tuya Smart</p>
                                                        <p className="text-xs text-slate-400 font-medium">Cloud integration support</p>
                                                    </div>
                                                </div>
                                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="grid gap-6 py-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="device-name" className="text-sm font-bold ml-1">Device Name</Label>
                                                    <Input
                                                        id="device-name"
                                                        placeholder="e.g. Ceiling Fan"
                                                        value={newDevice.name}
                                                        onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                                                        className="rounded-2xl h-12 border-slate-200/60"
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <Label htmlFor="api-url" className="text-sm font-bold ml-1">API URL (Home Assistant)</Label>
                                                    <Input
                                                        id="api-url"
                                                        placeholder="https://.../api/states/sensor.name"
                                                        value={newDevice.api_url}
                                                        onChange={(e) => setNewDevice({ ...newDevice, api_url: e.target.value })}
                                                        className="rounded-2xl h-12 border-slate-200/60 font-mono text-xs"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-sm font-bold ml-1">Room / Location</Label>
                                                        <Select
                                                            value={newDevice.room}
                                                            onValueChange={(val) => setNewDevice({ ...newDevice, room: val })}
                                                        >
                                                            <SelectTrigger className="rounded-2xl h-12 border-slate-200/60">
                                                                <SelectValue placeholder="Select room" />
                                                            </SelectTrigger>
                                                            <SelectContent className="rounded-2xl">
                                                                {rooms.filter(r => r !== "All").map(room => (
                                                                    <SelectItem key={room} value={room}>{room}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="text-sm font-bold ml-1">Device Type</Label>
                                                        <Select
                                                            value={newDevice.type}
                                                            onValueChange={(val: any) => setNewDevice({ ...newDevice, type: val })}
                                                        >
                                                            <SelectTrigger className="rounded-2xl h-12 border-slate-200/60">
                                                                <SelectValue placeholder="Type" />
                                                            </SelectTrigger>
                                                            <SelectContent className="rounded-2xl">
                                                                <SelectItem value="temperature">Temperature</SelectItem>
                                                                <SelectItem value="humidity">Humidity</SelectItem>
                                                                <SelectItem value="light">Lighting</SelectItem>
                                                                <SelectItem value="fan">Air System</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label htmlFor="device-unit" className="text-sm font-bold ml-1">
                                                        {newDevice.type === 'temperature' ? 'Temperature Unit' : 'Unit (optional)'}
                                                    </Label>
                                                    {newDevice.type === 'temperature' ? (
                                                        <Select
                                                            value={newDevice.unit}
                                                            onValueChange={(val) => setNewDevice({ ...newDevice, unit: val })}
                                                        >
                                                            <SelectTrigger id="device-unit" className="rounded-2xl h-12 border-slate-200/60 font-bold">
                                                                <SelectValue placeholder="Select Unit" />
                                                            </SelectTrigger>
                                                            <SelectContent className="rounded-2xl">
                                                                <SelectItem value="°C">Celsius (°C)</SelectItem>
                                                                <SelectItem value="°F">Fahrenheit (°F)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <Input
                                                            id="device-unit"
                                                            placeholder="e.g. %, lx, etc."
                                                            value={newDevice.unit}
                                                            onChange={(e) => setNewDevice({ ...newDevice, unit: e.target.value })}
                                                            className="rounded-2xl h-12 border-slate-200/60"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            <DialogFooter className="gap-2 sm:gap-0">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setAddDeviceStep(1)}
                                                    className="rounded-2xl h-12 font-bold border-slate-200"
                                                >
                                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                                    Back
                                                </Button>
                                                <Button
                                                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl h-12 font-bold shadow-lg shadow-slate-200"
                                                    onClick={handleAddDevice}
                                                >
                                                    Create Device
                                                </Button>
                                            </DialogFooter>
                                        </>
                                    )}
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    <div className="space-y-12">
                        <DeviceGroup title="Temperature Sensors" devices={groupedDevices.temperature} icon={Thermometer} />
                        <DeviceGroup title="Humidity Sensors" devices={groupedDevices.humidity} icon={Droplets} />
                        <DeviceGroup title="Lighting Systems" devices={groupedDevices.lights} icon={Lightbulb} />
                        <DeviceGroup title="Air Systems" devices={groupedDevices.fans} icon={Wind} />
                    </div>

                    {filteredDevices.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="p-6 bg-slate-50 rounded-full mb-4">
                                <LayoutGrid className="w-12 h-12 text-slate-200" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">No devices found</h3>
                            <p className="text-sm text-slate-500 max-w-xs mt-2">
                                We couldn't find any devices matching your search or current room selection.
                            </p>
                            <Button
                                variant="outline"
                                className="mt-6 rounded-2xl px-6 border-slate-200"
                                onClick={() => { setSearchQuery(""); setActiveRoom("All") }}
                            >
                                Clear Filters
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
