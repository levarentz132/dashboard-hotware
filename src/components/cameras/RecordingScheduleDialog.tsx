"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Clock } from "lucide-react";
import nxAPI from "@/lib/nxapi";

interface RecordingScheduleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    camera: any;
    onSuccess: () => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function RecordingScheduleDialog({
    open,
    onOpenChange,
    camera,
    onSuccess,
}: RecordingScheduleDialogProps) {
    const [isEnabled, setIsEnabled] = useState(false);
    const [schedule, setSchedule] = useState<boolean[][]>(
        Array.from({ length: 7 }, () => Array(24).fill(false))
    );
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Selection state
    const [dragStart, setDragStart] = useState<{ d: number; h: number } | null>(null);
    const [dragCurrent, setDragCurrent] = useState<{ d: number; h: number } | null>(null);
    const [dragValue, setDragValue] = useState(false);

    // Stop dragging when mouse is released anywhere
    useEffect(() => {
        const handleMouseUp = () => {
            if (dragStart && dragCurrent) {
                // Commit selection
                const minD = Math.min(dragStart.d, dragCurrent.d);
                const maxD = Math.max(dragStart.d, dragCurrent.d);
                const minH = Math.min(dragStart.h, dragCurrent.h);
                const maxH = Math.max(dragStart.h, dragCurrent.h);

                setSchedule(prev => {
                    const next = prev.map(row => [...row]);
                    for (let d = minD; d <= maxD; d++) {
                        for (let h = minH; h <= maxH; h++) {
                            next[d][h] = dragValue;
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
    }, [dragStart, dragCurrent, dragValue]);

    // Fetch full camera details with schedule on open
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
                        const newSchedule = Array.from({ length: 7 }, () => Array(24).fill(false));

                        const tasks = details.schedule?.tasks || [];
                        tasks.forEach((task: any) => {
                            if (task.recordingType === "always" || task.recordingType === "alwaysRecord") {
                                const rawDay = Number(task.dayOfWeek);
                                const isSun = rawDay === 0 || rawDay === 7;
                                const dIdx = isSun ? 0 : rawDay;

                                if (dIdx >= 0 && dIdx < 7) {
                                    for (let h = 0; h < 24; h++) {
                                        const hStart = h * 3600;
                                        const hEnd = (h + 1) * 3600;

                                        if (task.startTime < hEnd && task.endTime > hStart) {
                                            newSchedule[dIdx][h] = true;
                                        }
                                    }
                                }
                            }
                        });
                        setSchedule(newSchedule);
                    }
                } catch (err) {
                    console.error("Failed to fetch camera details:", err);
                    setError("Could not load camera settings.");
                } finally {
                    setLoading(false);
                }
            };
            fetchDetails();
        }
    }, [camera, open]);

    const onMouseDown = (day: number, hour: number) => {
        const newValue = !schedule[day][hour];
        setDragValue(newValue);
        setDragStart({ d: day, h: hour });
        setDragCurrent({ d: day, h: hour });
    };

    const onMouseEnter = (day: number, hour: number) => {
        if (dragStart) {
            setDragCurrent({ d: day, h: hour });
        }
    };

    const isInDragRange = (day: number, hour: number) => {
        if (!dragStart || !dragCurrent) return false;
        const minD = Math.min(dragStart.d, dragCurrent.d);
        const maxD = Math.max(dragStart.d, dragCurrent.d);
        const minH = Math.min(dragStart.h, dragCurrent.h);
        const maxH = Math.max(dragStart.h, dragCurrent.h);
        return day >= minD && day <= maxD && hour >= minH && hour <= maxH;
    };

    const toggleDay = (day: number) => {
        const allOn = schedule[day].every(v => v);
        setSchedule(prev => {
            const next = [...prev];
            next[day] = Array(24).fill(!allOn);
            return next;
        });
    };

    const toggleHour = (hour: number) => {
        const allOn = schedule.every(row => row[hour]);
        setSchedule(prev => prev.map(row => {
            const nextRow = [...row];
            nextRow[hour] = !allOn;
            return nextRow;
        }));
    };

    const toggleAll = () => {
        const anyOff = schedule.some(row => row.some(v => !v));
        setSchedule(Array.from({ length: 7 }, () => Array(24).fill(anyOff)));
    };

    const handleSave = async () => {
        if (!camera) return;
        setIsSaving(true);
        setError(null);

        const tasks: any[] = [];
        schedule.forEach((dayRow, dayIndex) => {
            let start: number | null = null;
            dayRow.forEach((isOn, hourIndex) => {
                if (isOn && start === null) start = hourIndex;
                else if (!isOn && start !== null) {
                    tasks.push({
                        startTime: (start * 3600) + (dayIndex === 0 ? -3600 : 0),
                        endTime: (hourIndex * 3600) + (dayIndex === 0 ? -3600 : 0),
                        dayOfWeek: dayIndex,
                        recordingType: "always",
                        streamQuality: "high",
                        fps: 15
                    });
                    start = null;
                }
            });
            if (start !== null) {
                tasks.push({
                    startTime: (start * 3600) + (dayIndex === 0 ? -3600 : 0),
                    endTime: (dayIndex === 0 ? 86400 - 3600 : 86400),
                    dayOfWeek: dayIndex,
                    recordingType: "always",
                    streamQuality: "high",
                    fps: 15
                });
            }
        });

        try {
            const originalSystemId = nxAPI.getSystemId();
            if (camera.systemId) nxAPI.setSystemId(camera.systemId);

            await nxAPI.updateDevice(camera.id, {
                schedule: { isEnabled, tasks }
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
            <DialogContent className="max-w-[80%] bg-[#0d1117] text-white border-[#30363d] p-0 overflow-hidden select-none">
                <style dangerouslySetInnerHTML={{
                    __html: `
          .dark-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
          .dark-scrollbar::-webkit-scrollbar-track { background: #0d1117; }
          .dark-scrollbar::-webkit-scrollbar-thumb { background: #30363d; border-radius: 5px; }
          .dark-scrollbar::-webkit-scrollbar-thumb:hover { background: #484f58; }
        `}} />

                <DialogHeader className="p-6 pb-2 border-b border-[#30363d]">
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

                <div className="p-6 max-h-[75vh] overflow-y-auto dark-scrollbar">
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

                            {/* Toggle Section */}
                            <div className="flex items-center justify-between mb-4 px-1">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${isEnabled ? "bg-green-500 animate-pulse" : "bg-gray-500"}`} />
                                    <span className="text-sm font-medium text-gray-300">Recording Status</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-gray-400">Recording Enable</span>
                                    <button
                                        onClick={() => setIsEnabled(!isEnabled)}
                                        className={`w-14 h-7 rounded-full relative transition-colors duration-300 shadow-inner outline-none focus:ring-2 focus:ring-blue-500/20 border-2 ${isEnabled ? "bg-green-500 border-green-400/50" : "bg-[#2d333b] border-[#484f58]"}`}
                                    >
                                        <div
                                            className="absolute left-[2px] top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300"
                                            style={{ transform: `translateY(-50%) translateX(${isEnabled ? '28px' : '0px'})` }}
                                        />
                                    </button>
                                </div>
                            </div>

                            {/* Grid Section */}
                            <div className="bg-[#161b22] border border-[#30363d] rounded overflow-hidden">
                                <div className="overflow-x-auto dark-scrollbar">
                                    <div className="grid grid-cols-[80px_repeat(24,minmax(32px,1fr))] bg-[#30363d] gap-x-px min-w-[900px]">
                                        {/* Header Row */}
                                        <button
                                            onClick={toggleAll}
                                            className="bg-[#0d1117] p-2 text-[10px] text-gray-500 font-bold text-center hover:bg-gray-800 border-b border-[#30363d] z-10 sticky top-0"
                                        >
                                            ALL
                                        </button>
                                        {HOURS.map(h => (
                                            <button
                                                key={`h-head-${h}`}
                                                onClick={() => toggleHour(h)}
                                                className="bg-[#0d1117] p-2 text-[10px] text-gray-500 font-bold hover:text-white border-b border-[#30363d] sticky top-0 z-10"
                                            >
                                                {h}
                                            </button>
                                        ))}

                                        {/* Day Rows */}
                                        {DAYS.map((day, dIdx) => (
                                            <>
                                                <button
                                                    key={`day-${day}`}
                                                    onClick={() => toggleDay(dIdx)}
                                                    className={`bg-[#0d1117] p-2 text-xs font-bold text-left border-r border-[#30363d] border-b border-b-[#30363d] hover:bg-gray-800 transition-colors sticky left-0 z-10 ${day === "Sun" || day === "Sat" ? "text-red-400" : "text-gray-400"}`}
                                                >
                                                    {day}
                                                </button>
                                                {HOURS.map(h => {
                                                    const isHighlighted = isInDragRange(dIdx, h);
                                                    const isActive = isHighlighted ? dragValue : schedule[dIdx][h];

                                                    // Selection box borders
                                                    let borderClasses = "";
                                                    if (dragStart && dragCurrent && isHighlighted) {
                                                        const minD = Math.min(dragStart.d, dragCurrent.d);
                                                        const maxD = Math.max(dragStart.d, dragCurrent.d);
                                                        const minH = Math.min(dragStart.h, dragCurrent.h);
                                                        const maxH = Math.max(dragStart.h, dragCurrent.h);

                                                        if (dIdx === minD) borderClasses += " border-t-blue-400 border-t-2";
                                                        if (dIdx === maxD) borderClasses += " border-b-blue-400 border-b-2";
                                                        if (h === minH) borderClasses += " border-l-blue-400 border-l-2";
                                                        if (h === maxH) borderClasses += " border-r-blue-400 border-r-2";
                                                    } else {
                                                        borderClasses = "border-r border-[#30363d]/30 border-b border-b-[#30363d]/20";
                                                    }

                                                    return (
                                                        <div
                                                            key={`${dIdx}-${h}`}
                                                            onMouseDown={() => onMouseDown(dIdx, h)}
                                                            onMouseEnter={() => onMouseEnter(dIdx, h)}
                                                            className={`aspect-[1.5/1] cursor-pointer transition-all duration-75 relative z-0 ${borderClasses} ${schedule[dIdx][h] ? "bg-green-600 shadow-inner" : "bg-[#0d1117] hover:bg-[#1c2128]"}`}
                                                        >
                                                            {isHighlighted && (
                                                                <div className={`absolute inset-0 z-10 pointer-events-none border ${dragValue ? "bg-green-400/30 border-green-400" : "bg-gray-400/30 border-gray-400"}`} />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 flex justify-center gap-12">
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 bg-green-600 rounded border border-blue-400/50" />
                                    <span className="text-xs text-gray-400">Record Always</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 bg-[#0d1117] border border-[#30363d] rounded" />
                                    <span className="text-xs text-gray-400">Do Not Record</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="p-6 pt-2 border-t border-[#30363d] bg-[#0d1117]">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-gray-400 hover:text-white">Cancel</Button>
                    <Button onClick={handleSave} disabled={isSaving || loading} className="bg-blue-600 hover:bg-blue-500 text-white min-w-[140px]">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
