/**
 * Canonical Event Metrics & Audit Verdict Helper
 * Single source of truth for unified event counts, severity distribution, and audit statements.
 */

export interface CanonicalEventItem {
  id: string;
  eventType?: string;
  severity?: string;
  [key: string]: any;
}

export interface CanonicalMetricsInput {
  events: CanonicalEventItem[];
  dateFrom: string;
  dateTo: string;
  selectedServerLabel: string;
  totalOfflineIncidents?: number;
  resolvedIncidents?: number;
  activeIncidents?: number;
  periodCameraUptimeRate?: number;
  totalDowntimeFormatted?: string;
}

export interface CanonicalMetricsResult {
  totalEvents: number;
  criticalEvents: number;
  criticalPct: string;
  warningEvents: number;
  warningPct: string;
  infoEvents: number;
  infoPct: string;
  auditVerdict: string;
}

export function computeCanonicalEventMetrics(input: CanonicalMetricsInput): CanonicalMetricsResult {
  const {
    events = [],
    dateFrom,
    dateTo,
    selectedServerLabel,
    totalOfflineIncidents = 0,
    resolvedIncidents = 0,
    activeIncidents = 0,
    periodCameraUptimeRate = 100,
    totalDowntimeFormatted = "0s",
  } = input;

  const totalEvents = events.length;
  let criticalEvents = 0;
  let warningEvents = 0;
  let infoEvents = 0;

  events.forEach((ev) => {
    const rawSev = String(ev.severity || "").toUpperCase();
    if (rawSev === "CRITICAL" || rawSev.includes("CRIT") || rawSev === "ERROR" || rawSev === "FATAL") {
      criticalEvents++;
    } else if (rawSev === "WARNING" || rawSev.includes("WARN")) {
      warningEvents++;
    } else {
      infoEvents++;
    }
  });

  const criticalPct = totalEvents > 0 ? `${Math.round((criticalEvents / totalEvents) * 100)}%` : "0%";
  const warningPct = totalEvents > 0 ? `${Math.round((warningEvents / totalEvents) * 100)}%` : "0%";
  const infoPct = totalEvents > 0 ? `${Math.round((infoEvents / totalEvents) * 100)}%` : "0%";

  const auditVerdict = `During the period (${dateFrom} to ${dateTo}), ${totalEvents} total alarm event(s) were recorded for ${selectedServerLabel}. ${criticalEvents} critical event(s) (${criticalPct}) and ${warningEvents} warning(s) (${warningPct}) were logged. A total of ${totalOfflineIncidents} camera disconnection incident(s) occurred: ${resolvedIncidents} successfully restored upon reconnection, and ${activeIncidents} active outage(s). Overall camera uptime index calculated from alarm logs is ${periodCameraUptimeRate}% with ${totalDowntimeFormatted} total recorded downtime.`;

  return {
    totalEvents,
    criticalEvents,
    criticalPct,
    warningEvents,
    warningPct,
    infoEvents,
    infoPct,
    auditVerdict,
  };
}
