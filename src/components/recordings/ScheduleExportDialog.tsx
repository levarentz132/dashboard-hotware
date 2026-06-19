"use client";

import React, { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { 
  Download, FileText, FileSpreadsheet, FileJson, Printer, Eye, Settings2, Trash2, Upload, AlertCircle, CheckCircle2 
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Checkbox } from "@/components/ui/checkbox";

interface ScheduledRecording {
  id: string;
  cameraId: string;
  cameraName: string;
  systemId: string;
  systemName: string;
  date: Date;
  startTime: string;
  endTime: string;
  startMs: number;
  endMs: number;
  type: "video" | "screenshot";
  screenshotTime?: string;
  status: string;
  recurrence?: "none" | "weekday" | "monthday";
  recurrenceDay?: number;
  scheduledBy?: string;
  inactive?: boolean;
}

interface ScheduleExportDialogProps {
  schedules: ScheduledRecording[];
  systemName: string;
}

const COLUMNS = [
  { id: "cameraName", label: "Camera Name" },
  { id: "systemName", label: "System Name" },
  { id: "type", label: "Type" },
  { id: "recurrence", label: "Recurrence" },
  { id: "details", label: "Details" },
  { id: "time", label: "Execution Time" },
  { id: "scheduledBy", label: "Scheduled By" },
  { id: "status", label: "Status" }
];

export function ScheduleExportDialog({ schedules, systemName }: ScheduleExportDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [formatType, setFormatType] = useState<"pdf" | "xlsx" | "csv">("pdf");
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    ["cameraName", "systemName", "type", "recurrence", "details", "time", "scheduledBy", "status"]
  );
  
  const [selectedLogoUrl, setSelectedLogoUrl] = useState<string | null>(null);
  const [availableLogos, setAvailableLogos] = useState<{ name: string, url: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch saved logos
  const fetchLogos = async () => {
    try {
      const res = await fetch("/api/settings/logos");
      if (res.ok) {
        const data = await res.json();
        setAvailableLogos(data);
      }
    } catch (error) {
      console.error("Error fetching logos:", error);
    }
  };

  useEffect(() => {
    if (open) {
      fetchLogos();
    }
  }, [open]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("logo", file);

    try {
      const res = await fetch("/api/settings/logos", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        await fetchLogos();
        setSelectedLogoUrl(data.url);
      }
    } catch (error) {
      console.error("Error uploading logo:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteLogo = async (name: string) => {
    try {
      const res = await fetch(`/api/settings/logos?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (selectedLogoUrl?.includes(name)) {
          setSelectedLogoUrl(null);
        }
        await fetchLogos();
      }
    } catch (error) {
      console.error("Error deleting logo:", error);
    }
  };

  const getScheduleRecurrenceDetails = (rec: ScheduledRecording) => {
    if (rec.recurrence === "none") {
      return `One-time: ${format(new Date(rec.date), "MMM d, yyyy")}`;
    }
    if (rec.recurrence === "monthday") {
      return `Monthly on Day ${rec.recurrenceDay}`;
    }
    if (rec.recurrence === "weekday") {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayIndex = new Date(rec.date).getDay();
      return `Weekly on ${dayNames[dayIndex]}`;
    }
    return "One-time";
  };

  const toggleColumn = (id: string) => {
    setSelectedColumns(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const generatePDF = async (preview = false) => {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Load Logo
    let logoData: { dataUrl: string, finalW: number, finalH: number } | null = null;
    if (selectedLogoUrl) {
      try {
        const loadImage = (url: string): Promise<{ dataUrl: string, width: number, height: number }> => {
          return new Promise((resolve, reject) => {
            const img = new (window as any).Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0);
              resolve({
                dataUrl: canvas.toDataURL('image/png'),
                width: img.width,
                height: img.height
              });
            };
            img.onerror = () => reject('Could not load image');
            img.src = url;
          });
        };

        const { dataUrl, width, height } = await loadImage(selectedLogoUrl);
        const maxW = 40;
        const maxH = 15;
        let finalW = width;
        let finalH = height;
        const ratio = width / height;

        if (finalH > maxH) {
          finalH = maxH;
          finalW = finalH * ratio;
        }
        if (finalW > maxW) {
          finalW = maxW;
          finalH = finalW / ratio;
        }

        logoData = { dataUrl, finalW, finalH };
      } catch (e) {
        console.error("Failed to load logo for PDF:", e);
      }
    }

    // Initial Logo Drawing
    if (logoData) {
      doc.addImage(logoData.dataUrl, 'PNG', 15, 6, logoData.finalW, logoData.finalH);
    }

    // Header Details
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("System Information", 20, 32);

    doc.setFont("helvetica", "normal");
    const sysInfo = [
      { label: "System Name", value: systemName || "All Systems" },
      { label: "Report Type", value: "Recording Schedule Log" },
      { label: "Total Tasks", value: `${schedules.length}` },
      { label: "Generated On", value: format(new Date(), "dd MMMM yyyy - HH:mm") },
      { label: "Generated By", value: user?.username || "Administrator" }
    ];

    let y = 38;
    sysInfo.forEach(info => {
      doc.setFont("helvetica", "bold");
      doc.text(`${info.label}:`, 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(info.value, 50, y);
      y += 5;
    });

    const tableHeaders = COLUMNS.filter(c => selectedColumns.includes(c.id)).map(c => c.label);
    const tableData = schedules.map(rec => {
      const row: string[] = [];
      COLUMNS.forEach(col => {
        if (!selectedColumns.includes(col.id)) return;
        if (col.id === "cameraName") row.push(rec.cameraName);
        else if (col.id === "systemName") row.push(rec.systemName);
        else if (col.id === "type") row.push(rec.type === "screenshot" ? "Snapshot" : "Video");
        else if (col.id === "recurrence") row.push(rec.recurrence === "none" ? "One-time" : rec.recurrence === "weekday" ? "Weekly" : "Monthly");
        else if (col.id === "details") row.push(getScheduleRecurrenceDetails(rec));
        else if (col.id === "time") row.push(rec.type === "screenshot" ? rec.startTime : `${rec.startTime} - ${rec.endTime}`);
        else if (col.id === "scheduledBy") row.push(rec.scheduledBy || "N/A");
        else if (col.id === "status") row.push(rec.inactive ? "Disabled" : "Active");
      });
      return row;
    });

    autoTable(doc, {
      startY: 72,
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
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { top: 30, left: 10, right: 10 },
      didDrawPage: (data) => {
        if (logoData) {
          doc.addImage(logoData.dataUrl, 'PNG', 15, 6, logoData.finalW, logoData.finalH);
        }
        doc.setFontSize(16);
        doc.setTextColor(40);
        const orgName = user?.organization?.name ? `${user.organization.name} ` : "";
        doc.text(`${orgName}Recording Schedule Report`, pageWidth / 2, 15, { align: "center" });

        doc.setDrawColor(200);
        doc.line(20, 24, pageWidth - 20, 24);

        doc.setFontSize(8);
        doc.text(`Page ${data.pageNumber}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
      }
    });

    if (preview) {
      window.open(doc.output("bloburl"), "_blank");
    } else {
      doc.save(`Recording_Schedules_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
    }
  };

  const generateExcel = () => {
    const data = schedules.map(rec => {
      const obj: any = {};
      COLUMNS.forEach(col => {
        if (!selectedColumns.includes(col.id)) return;
        if (col.id === "cameraName") obj[col.label] = rec.cameraName;
        else if (col.id === "systemName") obj[col.label] = rec.systemName;
        else if (col.id === "type") obj[col.label] = rec.type === "screenshot" ? "Snapshot" : "Video";
        else if (col.id === "recurrence") obj[col.label] = rec.recurrence === "none" ? "One-time" : rec.recurrence === "weekday" ? "Weekly" : "Monthly";
        else if (col.id === "details") obj[col.label] = getScheduleRecurrenceDetails(rec);
        else if (col.id === "time") obj[col.label] = rec.type === "screenshot" ? rec.startTime : `${rec.startTime} - ${rec.endTime}`;
        else if (col.id === "scheduledBy") obj[col.label] = rec.scheduledBy || "N/A";
        else if (col.id === "status") obj[col.label] = rec.inactive ? "Disabled" : "Active";
      });
      return obj;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedules");
    XLSX.writeFile(wb, `Recording_Schedules_${format(new Date(), "yyyyMMdd_HHmm")}.${formatType === "csv" ? "csv" : "xlsx"}`);
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
      <DialogTrigger asChild>
        <Button variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest gap-1.5 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 hover:text-blue-600 transition-all rounded-lg">
          <Download className="h-3.5 w-3.5" />
          <span>Export Schedules</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl bg-white text-slate-900 border-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <Settings2 className="h-5 w-5 text-blue-500" />
            Export Schedules Settings
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-2">
          <div className="space-y-4">
            {/* 1. Format */}
            <div className="space-y-1">
              <Label className="text-sm font-bold flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px]">1</span>
                Export Format
              </Label>
              <div className="pl-7">
                <Select value={formatType} onValueChange={(v: any) => setFormatType(v)}>
                  <SelectTrigger className="h-9 w-full bg-slate-50 border-slate-200 text-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-800">
                    <SelectItem value="pdf">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-red-500" />
                        <span>PDF Document</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="xlsx">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-green-600" />
                        <span>Excel Spreadsheet</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4 text-gray-500" />
                        <span>CSV (Comma Separated)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 2. Logo */}
            <div className="space-y-1">
              <Label className="text-sm font-bold flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px]">2</span>
                Report Logo (Optional)
              </Label>
              <div className="pl-7 space-y-2">
                <Select
                  value={selectedLogoUrl || "none"}
                  onValueChange={(v) => {
                    if (v === "___upload___") return;
                    setSelectedLogoUrl(v === "none" ? null : v);
                  }}
                >
                  <SelectTrigger className="w-full h-9 select-none bg-slate-50 border-slate-200 text-slate-800">
                    <SelectValue placeholder="Choose Logo..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-800">
                    <SelectPrimitive.Item
                      value="none"
                      className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
                    >
                      <SelectPrimitive.ItemText>No Logo</SelectPrimitive.ItemText>
                    </SelectPrimitive.Item>

                    {availableLogos.map((logo) => (
                      <SelectPrimitive.Item
                        key={logo.name}
                        value={logo.url}
                        className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground group"
                      >
                        <SelectPrimitive.ItemText>{logo.name}</SelectPrimitive.ItemText>
                        <div
                          className="absolute right-2 flex items-center justify-center h-7 w-7 rounded-md hover:bg-red-100 text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer pointer-events-auto z-10"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleDeleteLogo(logo.name);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </div>
                      </SelectPrimitive.Item>
                    ))}
                    <SelectSeparator />
                    <SelectPrimitive.Item
                      value="___upload___"
                      className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground text-blue-600 focus:text-blue-700 focus:bg-blue-50 cursor-pointer"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        <span>Upload Logo</span>
                      </div>
                    </SelectPrimitive.Item>
                  </SelectContent>
                </Select>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleLogoUpload}
                />
              </div>
            </div>
          </div>

          {/* 3. Column Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-bold flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px]">3</span>
              Select Columns to Export
            </Label>
            <div className="pl-7 space-y-2 border border-slate-100 rounded-xl p-3 bg-slate-50/50 max-h-[180px] overflow-y-auto">
              {COLUMNS.map(col => {
                const checked = selectedColumns.includes(col.id);
                return (
                  <div key={col.id} className="flex items-center space-x-2.5 py-0.5">
                    <Checkbox 
                      id={`col-${col.id}`} 
                      checked={checked} 
                      onCheckedChange={() => toggleColumn(col.id)} 
                      className="border-slate-300 data-[state=checked]:bg-blue-600"
                    />
                    <Label 
                      htmlFor={`col-${col.id}`} 
                      className="text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      {col.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button
            variant="outline"
            className="border-blue-200 hover:border-blue-500 hover:bg-blue-50 gap-2 text-blue-600"
            onClick={() => generatePDF(true)}
            disabled={formatType !== 'pdf'}
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700 px-8 gap-2">
            <Printer className="h-4 w-4" />
            Generate Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
