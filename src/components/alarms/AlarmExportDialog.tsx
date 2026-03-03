"use client";

import { useState, useMemo } from "react";
import {
    Download,
    FileText,
    FileSpreadsheet,
    FileJson,
    Settings2,
    Eye,
    Check,
    X,
    Printer,
    Info,
    Calendar,
    GripVertical,
    ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format, subDays } from "date-fns";
import { Input } from "@/components/ui/input";

interface Incident {
    id: string;
    failureEvent: EventLog;
    recoveryEvent: EventLog | null;
    status: "Open" | "Closed";
    downtime: string;
    downtimeSeconds?: number;
    category: "Camera" | "Server" | "Other";
}

interface EventLog {
    timestampMs: number;
    eventData: {
        reason: string;
        serverId: string;
        state: string;
        timestamp: string;
        type: string;
    };
    actionData: {
        acknowledge: boolean;
        attributes: any[];
        caption: string;
        description: string;
        extendedCaption?: string;
        level: string;
        timestamp: string;
        sourceName: string;
        serverId?: string;
        deviceIds?: string[];
        type?: string;
    };
    aggregatedInfo: {
        total: number;
    };
    systemId?: string;
}

interface AlarmExportDialogProps {
    events: EventLog[];
    stats: {
        total: number;
        errors: number;
        warnings: number;
        info: number;
    };
    systemName: string;
    period: { from: string; to: string };
    userName?: string;
}

const COLUMNS = [
    { id: "incidentId", label: "Incident ID" },
    { id: "failureTime", label: "Failure Time" },
    { id: "recoveryTime", label: "Recovery Time" },
    { id: "downtime", label: "Downtime" },
    { id: "severity", label: "Severity" },
    { id: "status", label: "Status" },
    { id: "source", label: "Source" },
    { id: "description", label: "Description" },
    { id: "event", label: "Event Type" },
    { id: "occurrences", label: "Count" },
];

interface SortableColumnProps {
    id: string;
    label: string;
    index: number;
}

function SortableColumn({ id, label, index, isSelected, onToggle }: SortableColumnProps & { isSelected: boolean, onToggle: (id: string) => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center justify-between p-2.5 bg-white border rounded-lg transition-all group",
                isDragging ? "shadow-lg border-blue-500 bg-blue-50/30 z-10 relative" : "hover:border-gray-300"
            )}
        >
            <div className="flex items-center gap-3">
                <Checkbox
                    id={`col-${id}`}
                    checked={isSelected}
                    onCheckedChange={() => onToggle(id)}
                />
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Position {index + 1}</span>
                    <label
                        htmlFor={`col-${id}`}
                        className="text-xs font-semibold text-gray-700 cursor-pointer"
                    >
                        {label}
                    </label>
                </div>
            </div>
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-gray-100 rounded text-gray-300 group-hover:text-gray-500 transition-colors"
                title="Drag to rearrange"
            >
                <GripVertical className="h-4 w-4" />
            </div>
        </div>
    );
}

export function AlarmExportDialog({
    events,
    stats,
    systemName,
    period,
    userName = "Administrator"
}: AlarmExportDialogProps) {
    const [open, setOpen] = useState(false);

    // Add CSS to hide native date icon and fix layout
    const dateInputStyles = `
        input[type="date"]::-webkit-calendar-picker-indicator {
            background: transparent;
            bottom: 0;
            color: transparent;
            cursor: pointer;
            height: auto;
            left: 0;
            position: absolute;
            right: 0;
            top: 0;
            width: auto;
            opacity: 0;
        }
    `;

    const [formatType, setFormatType] = useState<"pdf" | "xlsx" | "csv">("pdf");
    const [reportType, setReportType] = useState("availability_incident");
    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "severity">("newest");
    const [columnOrder, setColumnOrder] = useState<string[]>(COLUMNS.map(c => c.id));
    const [selectedColumns, setSelectedColumns] = useState<string[]>(
        ["incidentId", "failureTime", "recoveryTime", "downtime", "severity", "status", "source", "description"]
    );
    const [exportPeriod, setExportPeriod] = useState({
        from: period.from || format(subDays(new Date(), 30), "yyyy-MM-dd"),
        to: period.to || format(new Date(), "yyyy-MM-dd")
    });
    const [isPreviewing, setIsPreviewing] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const processedIncidents = useMemo(() => {
        // 1. Filter by Date Range
        let filtered = [...events];
        if (exportPeriod.from || exportPeriod.to) {
            filtered = filtered.filter(event => {
                const eventTime = parseInt(event.actionData?.timestamp || event.eventData?.timestamp || "0") / 1000;
                if (exportPeriod.from) {
                    const fromTime = new Date(exportPeriod.from).getTime();
                    if (eventTime < fromTime) return false;
                }
                if (exportPeriod.to) {
                    const toTime = new Date(exportPeriod.to).getTime() + 86400000;
                    if (eventTime > toTime) return false;
                }
                return true;
            });
        }

        // 2. Sort by Timestamp ASC for pairing logic
        filtered.sort((a, b) => parseInt(a.actionData?.timestamp || a.eventData?.timestamp || "0") - parseInt(b.actionData?.timestamp || b.eventData?.timestamp || "0"));

        const incidents: Incident[] = [];

        if (reportType === "standard") {
            // 3a. Standard Log - Just include everything raw
            filtered.forEach(event => {
                const type = (event.eventData?.type || event.actionData?.type || "").toLowerCase();
                const caption = (event.actionData?.caption || "").toLowerCase();
                const desc = (event.actionData?.description || "").toLowerCase();

                const category: "Camera" | "Server" | "Other" =
                    (type.includes("camera") || type.includes("device") || caption.includes("camera") || desc.includes("camera")) ? "Camera" :
                        (type.includes("server") || caption.includes("server") || desc.includes("server")) ? "Server" : "Other";

                incidents.push({
                    id: "",
                    failureEvent: event,
                    recoveryEvent: null,
                    status: event.actionData?.acknowledge ? "Closed" : "Open",
                    downtime: "N/A",
                    category
                });
            });
        } else {
            // 3b. Availability & Incident Report - Pairing Logic
            // Using a Map of arrays (stacks) to track all pending failures for each specific device/event type
            const activeIncidents = new Map<string, Incident[]>();

            filtered.forEach(event => {
                const type = (event.eventData?.type || event.actionData?.type || "").toLowerCase();
                const caption = (event.actionData?.caption || "").toLowerCase();
                const desc = (event.actionData?.description || "").toLowerCase();
                const serverId = event.eventData?.serverId || event.actionData?.serverId || "unknown";
                const sourceName = event.actionData?.sourceName || "";

                const category: "Camera" | "Server" | "Other" =
                    (type.includes("camera") || type.includes("device") || caption.includes("camera") || desc.includes("camera")) ? "Camera" :
                        (type.includes("server") || caption.includes("server") || desc.includes("server")) ? "Server" : "Other";

                const isFailure = type.includes('failure') || type.includes('disconnect') || type.includes('offline') ||
                    caption.includes('disconnected') || caption.includes('failure') || caption.includes('offline') ||
                    desc.includes('lost connection') || desc.includes('is now offline') || desc.includes('disconnected');

                const isRecovery = type.includes('start') || type.includes('online') || type.includes('connect') || type.includes('reconnect') || type.includes('finished') ||
                    caption.includes('reconnected') || caption.includes('online') || caption.includes('connected') ||
                    desc.includes('reconnected') || desc.includes('back online') || desc.includes('connection restored');

                // Create a highly specific pairing key to avoid mixing different event types
                // For cameras, we prioritize the unique deviceId to ensure monitor and server events pair correctly.
                // For servers, we use the serverId to ensure different "Down" and "Up" types can pair correctly.
                let pairingKey = "";
                if (category === "Camera") {
                    let cameraKey = sourceName;
                    const deviceId = event.actionData?.deviceIds?.[0];
                    if (deviceId) {
                        cameraKey = deviceId;
                    } else {
                        const genericSources = ["local server", "server", "vms server", "vms"];
                        if (genericSources.includes(sourceName.toLowerCase()) || !sourceName) {
                            const match = desc.match(/["'](.*?)["']/);
                            cameraKey = match ? match[1] : sourceName;
                        }
                    }
                    pairingKey = `Camera-${cameraKey}`;
                } else {
                    pairingKey = `${category}-${serverId}`;
                }

                if (isFailure) {
                    const newIncident: Incident = {
                        id: "",
                        failureEvent: event,
                        recoveryEvent: null,
                        status: "Open",
                        downtime: "Ongoing",
                        category
                    };
                    incidents.push(newIncident);

                    // Track all open incidents for this key in a list (don't overwrite)
                    if (!activeIncidents.has(pairingKey)) {
                        activeIncidents.set(pairingKey, []);
                    }
                    activeIncidents.get(pairingKey)!.push(newIncident);
                } else if (isRecovery) {
                    const queue = activeIncidents.get(pairingKey);
                    if (queue && queue.length > 0) {
                        // Use Nearest Down (last in stack) for the main downtime calculation
                        const incident = queue.pop()!;
                        incident.recoveryEvent = event;
                        incident.status = "Closed";

                        const failTime = parseInt(incident.failureEvent.actionData?.timestamp || incident.failureEvent.eventData?.timestamp || "0") / 1000;
                        const recTime = parseInt(event.actionData?.timestamp || event.eventData?.timestamp || "0") / 1000;
                        const diffSeconds = Math.floor((recTime - failTime) / 1000);

                        if (diffSeconds < 60) incident.downtime = `${diffSeconds} sec`;
                        else if (diffSeconds < 3600) incident.downtime = `${Math.floor(diffSeconds / 60)}m ${diffSeconds % 60}s`;
                        else incident.downtime = `${Math.floor(diffSeconds / 3600)}h ${Math.floor((diffSeconds % 3600) / 60)}m`;

                        incident.downtimeSeconds = diffSeconds;

                        // Also auto-close any older "orphaned" failures for this device that were logged before the nearest recovery
                        while (queue.length > 0) {
                            const oldInc = queue.pop()!;
                            oldInc.recoveryEvent = event;
                            oldInc.status = "Closed";
                            oldInc.downtime = "Redundant";
                        }
                        activeIncidents.delete(pairingKey);
                    }
                } else {
                    incidents.push({
                        id: "",
                        failureEvent: event,
                        recoveryEvent: null,
                        status: "Closed",
                        downtime: "N/A",
                        category
                    });
                }
            });
        }

        // 4. Filter by Report Template Requirement
        let result = incidents;
        if (reportType === "camera_incident") {
            result = result.filter(inc => inc.category === "Camera");
        } else if (reportType === "server_incident") {
            result = result.filter(inc => inc.category === "Server");
        }

        // 5. Apply Final Sorting and Assign IDs
        if (sortBy === "newest") {
            result.sort((a, b) => parseInt(b.failureEvent.actionData?.timestamp || b.failureEvent.eventData?.timestamp || "0") - parseInt(a.failureEvent.actionData?.timestamp || a.failureEvent.eventData?.timestamp || "0"));
        } else if (sortBy === "oldest") {
            result.sort((a, b) => parseInt(a.failureEvent.actionData?.timestamp || a.failureEvent.eventData?.timestamp || "0") - parseInt(b.failureEvent.actionData?.timestamp || b.failureEvent.eventData?.timestamp || "0"));
        } else if (sortBy === "severity") {
            const priority: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };
            result.sort((a, b) => (priority[a.failureEvent.actionData?.level?.toLowerCase()] ?? 4) - (priority[b.failureEvent.actionData?.level?.toLowerCase()] ?? 4));
        }

        // Assign Sequential IDs based on result order
        return result.map((inc, index) => {
            const prefix = inc.category === "Camera" ? "CAM" : inc.category === "Server" ? "SVR" : "OTH";
            const typePrefix = reportType === "standard" ? "LOG" : (reportType === "overview" ? "INC" : prefix);
            return {
                ...inc,
                id: typePrefix + "-" + (sortBy === "newest" ? result.length - index : index + 1).toString().padStart(3, '0')
            };
        });
    }, [events, sortBy, exportPeriod, reportType]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setColumnOrder((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over.id as string);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const toggleColumn = (id: string) => {
        setSelectedColumns(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    const formatDateTime = (ts: number | string | undefined, fallbackTsMs?: number) => {
        if (!ts || ts === 0) {
            if (fallbackTsMs && fallbackTsMs !== 0) return formatDateTime(fallbackTsMs);
            return "N/A";
        }
        // Nx Witness usually provides microseconds (16 digits)
        // JavaScript Date expects milliseconds (13 digits)
        let ms = typeof ts === "string" ? parseInt(ts) : ts;

        // If it's a huge number (microseconds), convert to milliseconds
        if (ms > 10000000000000) ms = ms / 1000;
        // If it's a small number (seconds), convert to milliseconds
        else if (ms < 10000000000) ms = ms * 1000;

        const d = new Date(ms);
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        const datePart = `${day}/${month}/${year}`;

        const timePart = d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        return `${datePart},\n${timePart}`;
    };

    const generatePDF = (preview = false) => {
        const doc = new jsPDF({ orientation: "landscape" });
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text("HOTWARE SYSTEM REPORT", pageWidth / 2, 15, { align: "center" });

        doc.setDrawColor(200);
        doc.line(20, 20, pageWidth - 20, 20);

        // System Info
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("System Information", 20, 30);

        doc.setFont("helvetica", "normal");
        const reportTitle = reportType === "standard" ? "Alarm Log" :
            reportType === "camera_incident" ? "Camera Incident Report" :
                reportType === "server_incident" ? "Server Incident Report" :
                    "Availability & Incident Report";

        const sysInfo = [
            { label: "System Name", value: systemName || "all" },
            { label: "Report Type", value: reportTitle },
            { label: "Reporting Period", value: `${format(new Date(exportPeriod.from), "dd MMMM yyyy")} to ${format(new Date(exportPeriod.to), "dd MMMM yyyy")}` },
            { label: "Generated On", value: format(new Date(), "dd MMMM yyyy - HH:mm") },
            { label: "Generated By", value: userName }
        ];

        sysInfo.forEach((item, i) => {
            const y = 36 + (i * 4);
            doc.text(item.label, 25, y);
            doc.text(":", 55, y);
            doc.text(item.value, 58, y);
        });

        // Executive Summary (Right Side)
        const counts = {
            critical: processedIncidents.filter(inc => inc.failureEvent.actionData?.level?.toLowerCase() === "critical").length,
            error: processedIncidents.filter(inc => inc.failureEvent.actionData?.level?.toLowerCase() === "error").length,
            warning: processedIncidents.filter(inc => inc.failureEvent.actionData?.level?.toLowerCase() === "warning").length,
            info: processedIncidents.filter(inc => inc.failureEvent.actionData?.level?.toLowerCase() === "info" || !inc.failureEvent.actionData?.level).length,
            acked: processedIncidents.filter(inc => inc.failureEvent.actionData?.acknowledge).length,
            unacked: processedIncidents.filter(inc => !inc.failureEvent.actionData?.acknowledge).length,
        };

        const summaryPart1 = [
            { label: "Total Incidents", value: processedIncidents.length.toString() },
            { label: "Closed Incidents", value: processedIncidents.filter(i => i.status === "Closed").length.toString() },
            { label: "Open Incidents", value: processedIncidents.filter(i => i.status === "Open").length.toString() },
        ];

        const closedIncidents = processedIncidents.filter(i => i.status === "Closed" && i.downtimeSeconds !== undefined);
        const totalSec = closedIncidents.reduce((acc, i) => acc + (i.downtimeSeconds || 0), 0);
        const avgSec = closedIncidents.length > 0 ? Math.floor(totalSec / closedIncidents.length) : 0;
        const maxSec = closedIncidents.length > 0 ? Math.max(...closedIncidents.map(i => i.downtimeSeconds || 0)) : 0;

        const formatDuration = (s: number) => {
            if (s === 0) return "0s";
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            let res = "";
            if (h > 0) res += `${h}h `;
            if (m > 0 || h > 0) res += `${m}m `;
            res += `${sec}s`;
            return res.trim();
            return res.trim();
        };

        const summaryPart2 = [
            { label: "Total Downtime", value: formatDuration(totalSec) },
            { label: "Average Downtime", value: formatDuration(avgSec) },
            { label: "Longest Downtime", value: formatDuration(maxSec) },
        ];

        const summaryX1 = pageWidth / 2 + 10;
        const summaryX2 = pageWidth / 2 + 75;

        doc.setFont("helvetica", "bold");
        doc.text("Executive Summary", summaryX1, 30);
        doc.setFont("helvetica", "normal");

        summaryPart1.forEach((item, i) => {
            const y = 36 + (i * 4);
            doc.text(item.label.toString(), summaryX1, y);
            doc.text(":", summaryX1 + 35, y);
            doc.text(item.value.toString(), summaryX1 + 38, y);
        });

        summaryPart2.forEach((item, i) => {
            const y = 36 + (i * 4);
            doc.text(item.label.toString(), summaryX2, y);
            doc.text(":", summaryX2 + 35, y);
            doc.text(item.value.toString(), summaryX2 + 38, y);
        });

        // Alarms Log Table
        const orderedSelectedColumns = columnOrder.filter(id => selectedColumns.includes(id));
        const tableHeaders = orderedSelectedColumns.map(id => COLUMNS.find(c => c.id === id)?.label || "");

        const tableData = processedIncidents.map(inc => {
            const row: string[] = [];
            const timestamp = parseInt(inc.failureEvent.actionData?.timestamp || inc.failureEvent.eventData?.timestamp || "0") / 1000;
            const eventType = inc.failureEvent.eventData?.type || "Unknown";

            orderedSelectedColumns.forEach(id => {
                if (id === "incidentId") row.push(inc.id);
                else if (id === "failureTime") row.push(formatDateTime(inc.failureEvent.actionData?.timestamp || inc.failureEvent.eventData?.timestamp, inc.failureEvent.timestampMs));
                else if (id === "recoveryTime") {
                    row.push(formatDateTime(inc.recoveryEvent?.actionData?.timestamp || inc.recoveryEvent?.eventData?.timestamp, inc.recoveryEvent?.timestampMs));
                }
                else if (id === "downtime") row.push(inc.downtime);
                else if (id === "severity") {
                    const level = (inc.failureEvent as any).effectiveLevel || inc.failureEvent.actionData?.level?.toLowerCase() || "info";
                    row.push(level.toUpperCase());
                }
                else if (id === "event") row.push(eventType);
                else if (id === "source") row.push(inc.failureEvent.actionData?.sourceName || "");
                else if (id === "status") row.push(inc.status);
                else if (id === "description") {
                    const desc = inc.failureEvent.actionData?.description;
                    const extended = inc.failureEvent.actionData?.extendedCaption;
                    row.push(desc || extended || "");
                }
                else if (id === "occurrences") row.push(inc.failureEvent.aggregatedInfo?.total?.toString() || "1");
            });
            return row;
        });

        autoTable(doc, {
            startY: 68,
            head: [tableHeaders],
            body: tableData,
            styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
            headStyles: {
                fillColor: [0, 0, 0],
                textColor: [255, 255, 255],
                fontSize: 7.5,
                halign: 'center',
                valign: 'middle',
                minCellHeight: 8,
                overflow: 'visible',
                cellWidth: 'wrap'
            },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { top: 30, left: 10, right: 10 },
            didDrawPage: (data) => {
                doc.setFontSize(8);
                doc.text(`Page ${data.pageNumber}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
            }
        });

        if (preview) {
            window.open(doc.output("bloburl"), "_blank");
        } else {
            doc.save(`Alarm_Report_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
        }
    };

    const generateExcel = () => {
        const orderedSelectedColumns = columnOrder.filter(id => selectedColumns.includes(id));
        const data = processedIncidents.map(inc => {
            const obj: any = {};
            const timestamp = parseInt(inc.failureEvent.actionData?.timestamp || inc.failureEvent.eventData?.timestamp || "0") / 1000;
            const eventType = inc.failureEvent.eventData?.type || "Unknown";

            orderedSelectedColumns.forEach(id => {
                const colLabel = COLUMNS.find(c => c.id === id)?.label || id;
                if (id === "incidentId") obj[colLabel] = inc.id;
                else if (id === "failureTime") obj[colLabel] = formatDateTime(inc.failureEvent.actionData?.timestamp || inc.failureEvent.eventData?.timestamp, inc.failureEvent.timestampMs);
                else if (id === "recoveryTime") {
                    obj[colLabel] = formatDateTime(inc.recoveryEvent?.actionData?.timestamp || inc.recoveryEvent?.eventData?.timestamp, inc.recoveryEvent?.timestampMs);
                }
                else if (id === "downtime") obj[colLabel] = inc.downtime;
                else if (id === "severity") {
                    const level = (inc.failureEvent as any).effectiveLevel || inc.failureEvent.actionData?.level?.toLowerCase() || "info";
                    obj[colLabel] = level.toUpperCase();
                }
                else if (id === "event") obj[colLabel] = eventType;
                else if (id === "source") obj[colLabel] = inc.failureEvent.actionData?.sourceName;
                else if (id === "status") obj[colLabel] = inc.status;
                else if (id === "description") {
                    const desc = inc.failureEvent.actionData?.description;
                    const extended = inc.failureEvent.actionData?.extendedCaption;
                    obj[colLabel] = desc || extended || "";
                }
                else if (id === "occurrences") obj[colLabel] = inc.failureEvent.aggregatedInfo?.total || 1;
            });
            return obj;
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Alarms");
        XLSX.writeFile(wb, `Alarm_Report_${format(new Date(), "yyyyMMdd_HHmm")}.${formatType === "csv" ? "csv" : "xlsx"}`);
    };

    const handleExport = () => {
        if (formatType === "pdf") {
            generatePDF();
        } else {
            generateExcel();
        }
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <style>{dateInputStyles}</style>
            <DialogTrigger asChild>
                <Button variant="outline" className="h-10 gap-2 border-dashed hover:border-blue-500 hover:bg-blue-50/50 transition-all">
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Export Report</span>
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings2 className="h-5 w-5 text-blue-500" />
                        Export Settings
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                    <div className="space-y-6">
                        {/* 1. Report Template */}
                        <div className="space-y-4">
                            <Label className="text-sm font-bold flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px]">1</span>
                                Report Template
                            </Label>
                            <div className="space-y-3 pl-7">
                                <div className="space-y-2">
                                    <Select value={reportType} onValueChange={setReportType}>
                                        <SelectTrigger className="h-10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="availability_incident">
                                                <div className="flex items-center gap-2">
                                                    <ClipboardList className="h-4 w-4 text-blue-500" />
                                                    <span>Availability & Incident Report (All)</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="camera_incident">
                                                <div className="flex items-center gap-2">
                                                    <ClipboardList className="h-4 w-4 text-green-500" />
                                                    <span>Camera Incident Report</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="server_incident">
                                                <div className="flex items-center gap-2">
                                                    <ClipboardList className="h-4 w-4 text-orange-500" />
                                                    <span>Server Incident Report</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="standard">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-gray-400" />
                                                    <span>Standard Alarm Log</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        {/* 2. Configuration */}
                        <div className="space-y-4 pt-2">
                            <Label className="text-sm font-bold flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px]">2</span>
                                General Configuration
                            </Label>

                            <div className="space-y-3 pl-7">
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-500 font-medium">Sort Alarms By</Label>
                                    <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                                        <SelectTrigger className="h-10">
                                            <SelectValue placeholder="Sort by..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="newest">Newest First</SelectItem>
                                            <SelectItem value="oldest">Oldest First</SelectItem>
                                            <SelectItem value="severity">High Severity First</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-500 font-medium">Reporting Period</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label htmlFor="export-from" className="text-[10px] uppercase text-gray-400 font-bold">From</Label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none z-10" />
                                                <Input
                                                    id="export-from"
                                                    type="date"
                                                    value={exportPeriod.from}
                                                    onChange={(e) => setExportPeriod({ ...exportPeriod, from: e.target.value })}
                                                    className="h-9 text-xs pl-8 pr-2 w-full bg-white appearance-none"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="export-to" className="text-[10px] uppercase text-gray-400 font-bold">To</Label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none z-10" />
                                                <Input
                                                    id="export-to"
                                                    type="date"
                                                    value={exportPeriod.to}
                                                    onChange={(e) => setExportPeriod({ ...exportPeriod, to: e.target.value })}
                                                    className="h-9 text-xs pl-8 pr-2 w-full bg-white appearance-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. Export Format & Preview */}
                        <div className="space-y-4 pt-2">
                            <Label className="text-sm font-bold flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px]">3</span>
                                Export Format & Preview
                            </Label>
                            <div className="space-y-3 pl-7">
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-500 font-medium">Final Output Format</Label>
                                    <Select value={formatType} onValueChange={(v: any) => setFormatType(v)}>
                                        <SelectTrigger className="h-10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="pdf">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-red-500" />
                                                    <span>PDF Document</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="xlsx">
                                                <div className="flex items-center gap-2">
                                                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                                                    <span>Excel Spreadhsheet</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="csv">
                                                <div className="flex items-center gap-2">
                                                    <FileJson className="h-4 w-4 text-gray-500" />
                                                    <span>CSV (Text)</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button
                                    variant="outline"
                                    className="w-full h-10 border-blue-200 hover:border-blue-500 hover:bg-blue-50 gap-2 text-blue-600"
                                    onClick={() => generatePDF(true)}
                                    disabled={formatType !== 'pdf'}
                                >
                                    <Eye className="h-4 w-4" />
                                    Preview
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-5 flex flex-col h-[400px]">
                        <div className="space-y-4 flex flex-col h-full">
                            <div>
                                <Label className="text-sm font-bold flex items-center gap-2 mb-1">
                                    <Settings2 className="h-4 w-4 text-blue-500" />
                                    Column Settings
                                </Label>
                                <p className="text-[10px] text-gray-400 leading-tight">
                                    Toggle checkboxes to include columns. Drag handles to change their order in the report.
                                </p>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                >
                                    <SortableContext
                                        items={columnOrder}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="space-y-2 py-1">
                                            {columnOrder.map((id, index) => (
                                                <SortableColumn
                                                    key={id}
                                                    id={id}
                                                    index={index}
                                                    label={COLUMNS.find(c => c.id === id)?.label || id}
                                                    isSelected={selectedColumns.includes(id)}
                                                    onToggle={toggleColumn}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700 px-8 gap-2">
                        <Printer className="h-4 w-4" />
                        Generate Report
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
