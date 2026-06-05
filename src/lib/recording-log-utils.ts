export interface RecordingLogEntry {
  timestamp: string;
  message: string;
}

const MONTH_INDEX: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** Parses audit log timestamps like "04 Jun 2026 16:52:19" */
export function parseRecordingLogTimestamp(timestamp: string): number {
  const match = timestamp.match(
    /^(\d{2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return 0;
  const month = MONTH_INDEX[match[2]];
  if (month === undefined) return 0;
  return new Date(
    Number(match[3]),
    month,
    Number(match[1]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ).getTime();
}

export function sortRecordingLogsNewestFirst(
  entries: RecordingLogEntry[],
): RecordingLogEntry[] {
  return [...entries].sort(
    (a, b) =>
      parseRecordingLogTimestamp(b.timestamp) -
      parseRecordingLogTimestamp(a.timestamp),
  );
}

export function mergeRecordingLogEntries(
  ...lists: RecordingLogEntry[][]
): RecordingLogEntry[] {
  const seen = new Set<string>();
  const merged: RecordingLogEntry[] = [];
  for (const list of lists) {
    for (const entry of list) {
      const key = `${entry.timestamp}|${entry.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }
  }
  return sortRecordingLogsNewestFirst(merged);
}
