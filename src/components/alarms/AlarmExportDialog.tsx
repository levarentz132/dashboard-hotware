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
    GripVertical
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
        level: string;
        timestamp: string;
        sourceName: string;
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
    { id: "timestamp", label: "Timestamp" },
    { id: "severity", label: "Severity" },
    { id: "event", label: "Event Type" },
    { id: "caption", label: "Caption" },
    { id: "description", label: "Description" },
    { id: "source", label: "Source" },
    { id: "status", label: "Status" },
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
    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "severity">("newest");
    const [columnOrder, setColumnOrder] = useState<string[]>(COLUMNS.map(c => c.id));
    const [selectedColumns, setSelectedColumns] = useState<string[]>(
        ["timestamp", "severity", "event", "caption", "description", "status"]
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

    const processedEvents = useMemo(() => {
        let result = [...events];

        // Apply Date Range Filter
        if (exportPeriod.from || exportPeriod.to) {
            result = result.filter(event => {
                const eventTime = parseInt(event.actionData?.timestamp || event.eventData?.timestamp || "0") / 1000;
                if (exportPeriod.from) {
                    const fromTime = new Date(exportPeriod.from).getTime();
                    if (eventTime < fromTime) return false;
                }
                if (exportPeriod.to) {
                    // end of day logic
                    const toTime = new Date(exportPeriod.to).getTime() + 86400000;
                    if (eventTime > toTime) return false;
                }
                return true;
            });
        }

        // Apply Sorting
        if (sortBy === "newest") {
            result.sort((a, b) => parseInt(b.actionData?.timestamp || "0") - parseInt(a.actionData?.timestamp || "0"));
        } else if (sortBy === "oldest") {
            result.sort((a, b) => parseInt(a.actionData?.timestamp || "0") - parseInt(b.actionData?.timestamp || "0"));
        } else if (sortBy === "severity") {
            const priority: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };
            result.sort((a, b) => (priority[a.actionData?.level?.toLowerCase()] ?? 4) - (priority[b.actionData?.level?.toLowerCase()] ?? 4));
        }
        return result;
    }, [events, sortBy, exportPeriod]);

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
        const sysInfo = [
            { label: "System Name", value: systemName || "all" },
            { label: "Report Type", value: "Alarm Report" },
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
        const summaryX = pageWidth / 2 + 10;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("Executive Summary", summaryX, 30);

        doc.setFont("helvetica", "normal");

        const counts = {
            critical: processedEvents.filter(e => e.actionData?.level?.toLowerCase() === "critical").length,
            error: processedEvents.filter(e => e.actionData?.level?.toLowerCase() === "error").length,
            warning: processedEvents.filter(e => e.actionData?.level?.toLowerCase() === "warning").length,
            info: processedEvents.filter(e => e.actionData?.level?.toLowerCase() === "info" || !e.actionData?.level).length,
            acked: processedEvents.filter(e => e.actionData?.acknowledge).length,
            unacked: processedEvents.filter(e => !e.actionData?.acknowledge).length,
        };

        const summaryPart1 = [
            { label: "Total Alarms", value: processedEvents.length.toString() },
            { label: "Acknowledged", value: counts.acked.toString() },
            { label: "Unacknowledged", value: counts.unacked.toString() },
        ];

        const summaryPart2 = [
            { label: "Critical", value: counts.critical.toString() },
            { label: "High / Error", value: counts.error.toString() },
            { label: "Medium / Warning", value: counts.warning.toString() },
            { label: "Low / Info", value: counts.info.toString() },
        ];

        const summaryX1 = pageWidth / 2 + 10;
        const summaryX2 = pageWidth / 2 + 75;

        summaryPart1.forEach((item, i) => {
            const y = 36 + (i * 4);
            doc.text(item.label, summaryX1, y);
            doc.text(":", summaryX1 + 35, y);
            doc.text(item.value, summaryX1 + 38, y);
        });

        summaryPart2.forEach((item, i) => {
            const y = 36 + (i * 4); // Same starting Y as Part 1
            doc.text(item.label, summaryX2, y);
            doc.text(":", summaryX2 + 35, y);
            doc.text(item.value, summaryX2 + 38, y);
        });

        // Alarms Log Table
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);

        const orderedSelectedColumns = columnOrder.filter(id => selectedColumns.includes(id));
        const tableHeaders = orderedSelectedColumns.map(id => COLUMNS.find(c => c.id === id)?.label || "");
        const tableData = processedEvents.map(event => {
            const row: string[] = [];
            orderedSelectedColumns.forEach(id => {
                if (id === "timestamp") {
                    row.push(new Date(parseInt(event.actionData?.timestamp || event.eventData?.timestamp) / 1000).toLocaleString());
                } else if (id === "severity") {
                    row.push(event.actionData?.level?.toUpperCase() || "INFO");
                } else if (id === "event") {
                    row.push(event.eventData?.type || "Unknown");
                } else if (id === "caption") {
                    row.push(event.actionData?.caption || "");
                } else if (id === "description") {
                    const desc = event.actionData?.description || "";
                    row.push(desc.length > 50 ? desc.substring(0, 47) + "..." : desc);
                } else if (id === "source") {
                    row.push(event.actionData?.sourceName || "");
                } else if (id === "status") {
                    row.push(event.actionData?.acknowledge ? "Acknowledged" : "Not Acknowledged");
                } else if (id === "occurrences") {
                    row.push(event.aggregatedInfo?.total?.toString() || "1");
                }
            });
            return row;
        });

        autoTable(doc, {
            startY: 68,
            head: [tableHeaders],
            body: tableData,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255] }, // Black header with white text
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { top: 30 },
            didDrawPage: (data) => {
                // Footer
                doc.setFontSize(8);
                doc.text(
                    `Page ${data.pageNumber}`,
                    pageWidth / 2,
                    doc.internal.pageSize.getHeight() - 10,
                    { align: "center" }
                );
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
        const data = processedEvents.map(event => {
            const obj: any = {};
            orderedSelectedColumns.forEach(id => {
                const colLabel = COLUMNS.find(c => c.id === id)?.label || id;
                if (id === "timestamp") obj[colLabel] = new Date(parseInt(event.actionData?.timestamp || event.eventData?.timestamp) / 1000).toLocaleString();
                else if (id === "severity") obj[colLabel] = event.actionData?.level?.toUpperCase() || "INFO";
                else if (id === "event") obj[colLabel] = event.eventData?.type;
                else if (id === "caption") obj[colLabel] = event.actionData?.caption;
                else if (id === "description") obj[colLabel] = event.actionData?.description;
                else if (id === "source") obj[colLabel] = event.actionData?.sourceName;
                else if (id === "status") obj[colLabel] = event.actionData?.acknowledge ? "Acknowledged" : "Not Acknowledged";
                else if (id === "occurrences") obj[colLabel] = event.aggregatedInfo?.total || 1;
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
                        {/* 1. Configuration */}
                        <div className="space-y-4">
                            <Label className="text-sm font-bold flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px]">1</span>
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

                        {/* 2. Format Selection - Moved to Last */}
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
                                    Open Preview PDF
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Label className="text-sm font-bold flex items-center gap-2">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px]">2</span>
                            Column Settings
                        </Label>
                        <p className="text-[10px] text-gray-400 pl-7 leading-tight mb-2">
                            Toggle checkboxes to include columns. Drag handles to change their order in the report.
                        </p>

                        <div className="pl-7 pr-2 max-h-[380px] overflow-y-auto custom-scrollbar">
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
