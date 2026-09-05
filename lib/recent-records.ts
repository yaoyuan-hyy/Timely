import type { CalendarEvent, LedgerEntry, TimelyState, RecordTarget } from "./types";
import { toShanghaiDayKey } from "./time";
export type RecentRecord = { kind: "event"; record: CalendarEvent } | { kind: "ledger"; record: LedgerEntry };
export function getRecentRecords(state: TimelyState, limit = 8): RecentRecord[] {
  const records: RecentRecord[] = [
    ...state.events.filter(e => e.status === "active").map(record => ({ kind: "event" as const, record })),
    ...state.ledgerEntries.map(record => ({ kind: "ledger" as const, record }))
  ];
  return records.sort((a, b) => Date.parse(b.record.createdAt) - Date.parse(a.record.createdAt) || a.record.id.localeCompare(b.record.id)).slice(0, Math.max(0, limit));
}
export function searchRecords(state: TimelyState, query: string): RecentRecord[] {
  const term = query.trim().toLocaleLowerCase();
  return getRecentRecords(state, Infinity).filter(({ record }) => {
    const fields = "startsAt" in record ? [record.title, record.location, record.notes] : [record.category, record.note, record.counterparty];
    return fields.some(field => field?.toLocaleLowerCase().includes(term));
  });
}
export function recordTarget(kind: "event" | "ledger", id: string, time: string): RecordTarget {
  const dayKey = toShanghaiDayKey(new Date(time));
  return kind === "event" ? { view: "calendar", recordId: id, dayKey } : { view: "ledger", recordId: id, monthKey: dayKey.slice(0, 7) };
}
