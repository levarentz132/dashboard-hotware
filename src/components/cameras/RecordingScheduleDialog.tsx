"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertCircle, Clock, Video, Activity, Zap } from "lucide-react";
import nxAPI from "@/lib/nxapi";

interface RecordingScheduleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    camera: any;
    onSuccess: () => void;
}

type RecordingType = "always" | "motion" | "motionLow";

interface ScheduleCell {
    type: RecordingType;
    fps: string;
    quality: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const RECORDING_TYPES = [
    { id: "always", label: "Always", color: "bg-green-600", border: "border-green-400" },
    { id: "motion", label: "Motion", color: "bg-yellow-500", border: "border-yellow-300" },
    { id: "motionLow", label: "Motion + LowRes", color: "bg-orange-500", border: "border-orange-300" },
];


export default function RecordingScheduleDialog({
    open,
    onOpenChange,
    camera,
    onSuccess,
}: RecordingScheduleDialogProps) {
    const [isEnabled, setIsEnabled] = useState(false);
    const [schedule, setSchedule] = useState<(ScheduleCell | null)[][]>(
        Array.from({ length: 7 }, () => Array(24).fill(null))
    );

    // Brush settings
    const [activeType, setActiveType] = useState<RecordingType>("always");
    const [globalFps, setGlobalFps] = useState("15");
    const [globalQuality, setGlobalQuality] = useState("high");

    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Archive & Motion Settings
    const [minArchive, setMinArchive] = useState({ value: 30, unit: "Day", auto: true });
    const [maxArchive, setMaxArchive] = useState({ value: 30, unit: "Day", auto: true });
    const [preRecording, setPreRecording] = useState(5);
    const [postRecording, setPostRecording] = useState(5);

    const units = ["Minute", "Hour", "Day"];
    const unitSpeeds = { "Minute": 60, "Hour": 3600, "Day": 86400 };

    const toValueUnit = (seconds: number) => {
        if (seconds <= 0) return { value: 1, unit: "Day", auto: true };
        if (seconds % 86400 === 0) return { value: seconds / 86400, unit: "Day", auto: false };
        if (seconds % 3600 === 0) return { value: seconds / 3600, unit: "Hour", auto: false };
        return { value: Math.ceil(seconds / 60), unit: "Minute", auto: false };
    };

    const toSeconds = (val: number, unit: string, auto: boolean) => {
        if (auto) return 0;
        return val * (unitSpeeds[unit as keyof typeof unitSpeeds] || 1);
    };

    // Selection state
    const [dragStart, setDragStart] = useState<{ d: number; h: number } | null>(null);
    const [dragCurrent, setDragCurrent] = useState<{ d: number; h: number } | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    // Commit selection
    useEffect(() => {
        const handleMouseUp = () => {
            if (dragStart && dragCurrent) {
                const minD = Math.min(dragStart.d, dragCurrent.d);
                const maxD = Math.max(dragStart.d, dragCurrent.d);
                const minH = Math.min(dragStart.h, dragCurrent.h);
                const maxH = Math.max(dragStart.h, dragCurrent.h);

                setSchedule(prev => {
                    const next = prev.map(row => [...row]);
                    for (let d = minD; d <= maxD; d++) {
                        for (let h = minH; h <= maxH; h++) {
                            next[d][h] = isRemoving ? null : {
                                type: activeType,
                                fps: globalFps,
                                quality: globalQuality
                            };
                        }
                    }
                    return next;
                });
            }
            setDragStart(null);
            setDragCurrent(null);
        };

        if (dragStart) {
            window.addEventListener("mouseup", handleMouseUp);
            return () => window.removeEventListener("mouseup", handleMouseUp);
        }
    }, [dragStart, dragCurrent, isRemoving, activeType, globalFps, globalQuality]);

    // Load from VMS
    useEffect(() => {
        if (camera && open) {
            const fetchDetails = async () => {
                setLoading(true);
                setError(null);
                try {
                    const originalSystemId = nxAPI.getSystemId();
                    if (camera.systemId) nxAPI.setSystemId(camera.systemId);
                    const details = await nxAPI.getCameraById(camera.id);
                    if (camera.systemId) nxAPI.setSystemId(originalSystemId);

                    if (details) {
                        setIsEnabled(details.schedule?.isEnabled ?? false);
                        const newSchedule = Array.from({ length: 7 }, () => Array<ScheduleCell | null>(24).fill(null));
                        const tasks = details.schedule?.tasks || [];

                        tasks.forEach((task: any) => {
                            let type: RecordingType | null = null;
                            if (task.recordingType === "always" || task.recordingType === "alwaysRecord") {
                                type = "always";
                            } else if (task.recordingType === "motionOnly" || (task.recordingType === "metadataOnly" && task.metadataTypes?.includes("motion"))) {
                                type = "motion";
                            } else if (task.recordingType === "motionAndLowRes" || (task.recordingType === "metadataAndLowQuality" && task.metadataTypes?.includes("motion"))) {
                                type = "motionLow";
                            }

                            if (type) {
                                const day = (task.dayOfWeek === 0 || task.dayOfWeek === 7) ? 0 : task.dayOfWeek;
                                const cell: ScheduleCell = {
                                    type,
                                    fps: (task.fps || 15).toString(),
                                    quality: task.streamQuality || "high"
                                };

                                const isSun = day === 0;
                                for (let h = 0; h < 24; h++) {
                                    const hStart = isSun ? (h * 3600) - 3600 : h * 3600;
                                    const hEnd = isSun ? ((h + 1) * 3600) - 3600 : (h + 1) * 3600;
                                    if (task.startTime < hEnd && task.endTime > hStart) {
                                        newSchedule[day][h] = cell;
                                    }
                                }
                            }
                        });
                        setSchedule(newSchedule);

                        // Load Archive & Motion
                        if (details.schedule) {
                            setMinArchive(toValueUnit(details.schedule.minArchivePeriodS || 0));
                            setMaxArchive(toValueUnit(details.schedule.maxArchivePeriodS || 0));
                        }
                        if (details.motion) {
                            setPreRecording(details.motion.recordBeforeS || 0);
                            setPostRecording(details.motion.recordAfterS || 0);
                        }
                    }
                } catch (err) {
                    setError("Could not load camera settings.");
                } finally {
                    setLoading(false);
                }
            };
            fetchDetails();
        }
    }, [camera, open]);

    const toggleDay = (day: number) => {
        const anyOff = schedule[day].some(v => v?.type !== activeType);
        setSchedule(prev => {
            const next = [...prev];
            next[day] = Array(24).fill(anyOff ? { type: activeType, fps: globalFps, quality: globalQuality } : null);
            return next;
        });
    };

    const toggleHour = (hour: number) => {
        const anyOff = schedule.some(row => row[hour]?.type !== activeType);
        setSchedule(prev => prev.map(row => {
            const nextRow = [...row];
            nextRow[hour] = anyOff ? { type: activeType, fps: globalFps, quality: globalQuality } : null;
            return nextRow;
        }));
    };

    const toggleAll = () => {
        const anyEmpty = schedule.some(row => row.some(v => v === null));
        setSchedule(Array.from({ length: 7 }, () => Array(24).fill(anyEmpty ? { type: activeType, fps: globalFps, quality: globalQuality } : null)));
    };

    const onMouseDown = (day: number, hour: number) => {
        const clickingCurrent = schedule[day][hour]?.type === activeType;
        setIsRemoving(clickingCurrent);
        setDragStart({ d: day, h: hour });
        setDragCurrent({ d: day, h: hour });
    };

    const onMouseEnter = (day: number, hour: number) => {
        if (dragStart) setDragCurrent({ d: day, h: hour });
    };

    const isInDragRange = (day: number, hour: number) => {
        if (!dragStart || !dragCurrent) return false;
        const minD = Math.min(dragStart.d, dragCurrent.d);
        const maxD = Math.max(dragStart.d, dragCurrent.d);
        const minH = Math.min(dragStart.h, dragCurrent.h);
        const maxH = Math.max(dragStart.h, dragCurrent.h);
        return day >= minD && day <= maxD && hour >= minH && hour <= maxH;
    };

    const handleSave = async () => {
        if (!camera) return;
        setIsSaving(true);
        setError(null);

        const tasks: any[] = [];

        schedule.forEach((dayRow, dayIndex) => {
            let start: number | null = null;
            let currentProps: string | null = null; // Stringified cell properties to detect changes

            const finishTask = (endHour: number, props: string) => {
                if (start === null) return;
                const cell = JSON.parse(props) as ScheduleCell;

                let vmsType = "always";
                let metadata = "none";
                if (cell.type === "motion") { vmsType = "metadataOnly"; metadata = "motion"; }
                else if (cell.type === "motionLow") { vmsType = "metadataAndLowQuality"; metadata = "motion"; }

                const isSun = dayIndex === 0;
                tasks.push({
                    startTime: isSun ? (start * 3600) - 3600 : start * 3600,
                    endTime: isSun ? (endHour * 3600) - 3600 : endHour * 3600,
                    dayOfWeek: dayIndex,
                    recordingType: vmsType,
                    metadataTypes: metadata,
                    streamQuality: cell.quality,
                    fps: parseInt(cell.fps),
                });
            };

            dayRow.forEach((cell, hourIndex) => {
                const props = cell ? JSON.stringify(cell) : null;
                if (props !== currentProps) {
                    if (currentProps !== null) finishTask(hourIndex, currentProps);
                    start = cell !== null ? hourIndex : null;
                    currentProps = props;
                }
            });
            if (currentProps !== null) finishTask(24, currentProps);
        });

        try {
            const originalSystemId = nxAPI.getSystemId();
            if (camera.systemId) nxAPI.setSystemId(camera.systemId);

            await nxAPI.updateDevice(camera.id, {
                schedule: {
                    isEnabled,
                    tasks,
                    minArchivePeriodS: toSeconds(minArchive.value, minArchive.unit, minArchive.auto),
                    maxArchivePeriodS: toSeconds(maxArchive.value, maxArchive.unit, maxArchive.auto),
                },
                motion: {
                    recordBeforeS: Math.max(3, preRecording),
                    recordAfterS: Math.max(3, postRecording),
                }
            });

            if (camera.systemId) nxAPI.setSystemId(originalSystemId);
            onSuccess();
            onOpenChange(false);
        } catch (err) {
            setError("Failed to save schedule.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[80%] bg-[#0d1117] text-white border-[#30363d] p-0 overflow-hidden select-none flex flex-col">
                <style dangerouslySetInnerHTML={{
                    __html: `
          .dark-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
          .dark-scrollbar::-webkit-scrollbar-track { background: #0d1117; }
          .dark-scrollbar::-webkit-scrollbar-thumb { background: #30363d; border-radius: 5px; }
          .dark-scrollbar::-webkit-scrollbar-thumb:hover { background: #484f58; }
        `}} />

                <DialogHeader className="p-6 pb-2 border-b border-[#30363d] shrink-0">
                    <DialogTitle className="flex items-center justify-between text-xl">
                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-blue-400" />
                            <span>{camera?.name || "Recording Schedule"}</span>
                        </div>
                    </DialogTitle>
                    <div className="text-xs text-gray-400 mt-2 flex gap-4">
                        <span>Model: <span className="text-gray-300">{camera?.model || "-"}</span></span>
                        <span>MAC: <span className="text-gray-300">{camera?.mac || "-"}</span></span>
                    </div>
                </DialogHeader>

                <div className="p-6 overflow-y-auto dark-scrollbar flex-grow space-y-8">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                            <span className="text-sm text-gray-500">Fetching camera settings...</span>
                        </div>
                    ) : (
                        <>
                            {error && (
                                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded text-sm flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    {error}
                                </div>
                            )}

                            {/* Status & Toggle */}
                            <div className="flex items-center justify-between mb-4 px-1">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${isEnabled ? "bg-green-500 animate-pulse" : "bg-gray-500"}`} />
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-tighter">Recording Status</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-semibold text-gray-400 tracking-tighter uppercase">Recording Enable</span>
                                    <button
                                        onClick={() => setIsEnabled(!isEnabled)}
                                        className={`w-14 h-7 rounded-full relative transition-colors duration-300 border-2 ${isEnabled ? "bg-green-500 border-green-400/50" : "bg-[#2d333b] border-[#484f58]"}`}
                                    >
                                        <div
                                            className="absolute left-[2px] top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full transition-transform duration-300 shadow"
                                            style={{ transform: `translateY(-50%) translateX(${isEnabled ? '28px' : '0px'})` }}
                                        />
                                    </button>
                                </div>
                            </div>

                            {/* Grid */}
                            <div className="bg-[#161b22] border border-[#30363d] rounded overflow-hidden">
                                <div className="overflow-x-auto dark-scrollbar">
                                    <div className="grid grid-cols-[80px_repeat(24,minmax(40px,1fr))] bg-[#30363d] gap-px min-w-[1000px]">
                                        <button onClick={toggleAll} className="bg-[#0d1117] p-2 text-[10px] text-gray-500 font-bold border-b border-[#30363d] z-10 sticky top-0">ALL</button>
                                        {HOURS.map(h => (
                                            <button key={`h-${h}`} onClick={() => toggleHour(h)} className="bg-[#0d1117] p-2 text-[10px] text-gray-500 font-bold border-b border-[#30363d] sticky top-0 z-10">{h}</button>
                                        ))}

                                        {DAYS.map((day, dIdx) => (
                                            <>
                                                <button key={`day-${day}`} onClick={() => toggleDay(dIdx)} className={`bg-[#0d1117] p-2 text-xs font-bold text-left border-r border-[#30363d] border-b border-b-[#30363d] hover:bg-gray-800 transition-colors sticky left-0 z-10 ${day === "Sun" || day === "Sat" ? "text-red-400" : "text-gray-400"}`}>{day}</button>
                                                {HOURS.map(h => {
                                                    const isHighlighted = isInDragRange(dIdx, h);
                                                    const cell = schedule[dIdx][h];

                                                    let bgClass = "bg-[#0d1117]";
                                                    if (cell) {
                                                        if (cell.type === "always") bgClass = "bg-green-600";
                                                        else if (cell.type === "motion") bgClass = "bg-yellow-500";
                                                        else bgClass = "bg-orange-500";
                                                    }

                                                    let lassoClass = "";
                                                    if (isHighlighted) {
                                                        if (isRemoving) lassoClass = "bg-gray-400/30 border-gray-400";
                                                        else {
                                                            const mode = RECORDING_TYPES.find(t => t.id === activeType);
                                                            lassoClass = `${mode?.color}/40 ${mode?.border}`;
                                                        }
                                                    }

                                                    return (
                                                        <div
                                                            key={`${dIdx}-${h}`}
                                                            onMouseDown={() => onMouseDown(dIdx, h)}
                                                            onMouseEnter={() => onMouseEnter(dIdx, h)}
                                                            className={`aspect-[1/1] cursor-pointer transition-all duration-75 relative z-0 border-r border-[#30363d]/10 border-b border-b-[#30363d]/10 flex flex-col items-center justify-center gap-0.5 ${bgClass}`}
                                                        >
                                                            {cell && (
                                                                <>
                                                                    <span className="text-[10px] font-bold leading-none">{cell.fps}</span>
                                                                    <span className="text-[7px] font-bold leading-none uppercase opacity-90">{cell.quality}</span>
                                                                </>
                                                            )}
                                                            {isHighlighted && (
                                                                <div className={`absolute inset-0 z-10 pointer-events-none border-2 ${lassoClass}`} />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Settings Section */}
                            <div className="space-y-12">
                                <div className="flex flex-col md:flex-row gap-8 items-start justify-between px-1">
                                    <div className="space-y-4">
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recording Mode</label>
                                        <div className="flex gap-2 flex-col w-48">
                                            {RECORDING_TYPES.map((type) => (
                                                <button
                                                    key={type.id}
                                                    onClick={() => setActiveType(type.id as RecordingType)}
                                                    className={`flex items-center justify-between px-4 py-1.5 rounded-lg border-2 transition-all gap-4 ${activeType === type.id ? `border-blue-400 bg-[#161b22] text-white shadow-lg` : "border-[#30363d] bg-[#0d1117] text-gray-400 hover:bg-gray-800"}`}
                                                >
                                                    <span className="text-sm font-medium">{type.label}</span>
                                                    <div className={`w-2.5 h-2.5 rounded-full ${type.color}`} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 px-1">
                                        <div className="space-y-6 pr-6">
                                            <div className="space-y-1">
                                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Keep Archive For...</label>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex items-center gap-4">
                                                    <span className="text-sm text-gray-400">Min</span>
                                                    <div className="flex items-center gap-2 w-48">
                                                        <input
                                                            type="number"
                                                            disabled={minArchive.auto}
                                                            value={minArchive.auto ? "--" : minArchive.value}
                                                            onChange={(e) => setMinArchive(p => ({ ...p, value: parseInt(e.target.value) || 0 }))}
                                                            className="w-full bg-[#0d1117] border border-[#30363d] rounded h-9 px-3 text-sm focus:border-blue-500/50 outline-none disabled:opacity-50"
                                                        />
                                                        <Select
                                                            disabled={minArchive.auto}
                                                            value={minArchive.unit}
                                                            onValueChange={(v) => setMinArchive(p => ({ ...p, unit: v }))}
                                                        >
                                                            <SelectTrigger className="w-[85px] bg-[#0d1117] border-[#30363d] h-9 text-xs">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-[#161b22] border-[#30363d] text-white">
                                                                {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <label className="flex items-center gap-2 cursor-pointer group">
                                                        <input
                                                            type="checkbox"
                                                            checked={minArchive.auto}
                                                            onChange={(e) => setMinArchive(p => ({ ...p, auto: e.target.checked }))}
                                                            className="w-4 h-4 rounded border-[#30363d] bg-transparent text-blue-500 focus:ring-0 cursor-pointer"
                                                        />
                                                        <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors">Auto</span>
                                                    </label>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <span className="text-sm text-gray-400">Max</span>
                                                    <div className="flex items-center gap-2 w-48">
                                                        <input
                                                            type="number"
                                                            disabled={maxArchive.auto}
                                                            value={maxArchive.auto ? "--" : maxArchive.value}
                                                            onChange={(e) => setMaxArchive(p => ({ ...p, value: parseInt(e.target.value) || 0 }))}
                                                            className="w-full bg-[#0d1117] border border-[#30363d] rounded h-9 px-3 text-sm focus:border-blue-500/50 outline-none disabled:opacity-50"
                                                        />
                                                        <Select
                                                            disabled={maxArchive.auto}
                                                            value={maxArchive.unit}
                                                            onValueChange={(v) => setMaxArchive(p => ({ ...p, unit: v }))}
                                                        >
                                                            <SelectTrigger className="w-[85px] bg-[#0d1117] border-[#30363d] h-9 text-xs">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-[#161b22] border-[#30363d] text-white">
                                                                {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <label className="flex items-center gap-2 cursor-pointer group">
                                                        <input
                                                            type="checkbox"
                                                            checked={maxArchive.auto}
                                                            onChange={(e) => setMaxArchive(p => ({ ...p, auto: e.target.checked }))}
                                                            className="w-4 h-4 rounded border-[#30363d] bg-transparent text-blue-500 focus:ring-0 cursor-pointer"
                                                        />
                                                        <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors">Auto</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6 pl-6">
                                            <div className="space-y-1">
                                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Motion & Objects Recording</label>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex items-center gap-4">
                                                    <span className="w-28 text-sm text-gray-400">Pre-Recording</span>
                                                    <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded h-9 px-3 gap-2 w-48">
                                                        <input
                                                            type="number"
                                                            value={preRecording}
                                                            onChange={(e) => setPreRecording(parseInt(e.target.value) || 0)}
                                                            className="w-full bg-transparent outline-none text-sm"
                                                        />
                                                        <span className="text-xs text-gray-500">s</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <span className="w-28 text-sm text-gray-400">Post-Recording</span>
                                                    <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded h-9 px-3 gap-2 w-48">
                                                        <input
                                                            type="number"
                                                            value={postRecording}
                                                            onChange={(e) => setPostRecording(parseInt(e.target.value) || 0)}
                                                            className="w-full bg-transparent outline-none text-sm"
                                                        />
                                                        <span className="text-xs text-gray-500">s</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-6">
                                        <div className="w-[120px] space-y-3">
                                            <label className="text-[11px] font-bold text-gray-500 uppercase">Quality</label>
                                            <Select value={globalQuality} onValueChange={setGlobalQuality}>
                                                <SelectTrigger className="bg-[#0d1117] border-[#30363d] text-xs h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#161b22] border-[#30363d] text-white">
                                                    <SelectItem value="low">Low</SelectItem>
                                                    <SelectItem value="medium">Medium</SelectItem>
                                                    <SelectItem value="high">High</SelectItem>
                                                    <SelectItem value="best">Best</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="w-[120px] space-y-3">
                                            <label className="text-[11px] font-bold text-gray-500 uppercase">FPS</label>
                                            <Select value={globalFps} onValueChange={setGlobalFps}>
                                                <SelectTrigger className="bg-[#0d1117] border-[#30363d] text-xs h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#161b22] border-[#30363d] text-white">
                                                    {[1, 5, 10, 15, 20, 25, 30].map(f => (
                                                        <SelectItem key={f} value={f.toString()}>{f} FPS</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            </div>


                        </>
                    )}
                </div>

                <DialogFooter className="p-6 pt-4 border-t border-[#30363d] bg-[#0d1117] shrink-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-gray-400 hover:text-white">Cancel</Button>
                    <Button onClick={handleSave} disabled={isSaving || loading} className="bg-blue-600 hover:bg-blue-500 text-white min-w-[140px]">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Save Changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
