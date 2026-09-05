import type { TimelyState } from "./types";
import { z } from "zod";
import { eventSchema, ledgerSchema, recordDateTime } from "./record-validation";
const backupSchema = z.object({
  format: z.literal("timely-records"), version: z.literal(1), exportedAt: recordDateTime,
  events: z.array(eventSchema).max(50000), ledgerEntries: z.array(ledgerSchema).max(50000)
});
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

// Only durable records are exported; chat, credentials and pending operations are excluded.
export function exportTimelyState(state: TimelyState): string {
  const data = backupSchema.parse({ format: "timely-records", version: 1, exportedAt: new Date().toISOString(), events: state.events, ledgerEntries: state.ledgerEntries });
  const text = JSON.stringify(data, null, 2);
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error("备份超过 10 MB，无法导出。");
  return text;
}
export function parseTimelyExport(text: string): TimelyState {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error("备份不能超过 10 MB。");
  const result = backupSchema.safeParse(JSON.parse(text));
  if (!result.success) throw new Error("备份格式、版本或记录内容无效。");
  const { events, ledgerEntries } = result.data;
  for (const records of [events, ledgerEntries]) {
    if (new Set(records.map(r => r.id)).size !== records.length) throw new Error("备份包含重复的记录编号。");
  }
  return { events, ledgerEntries, messages: [], reminders: [], pendingClarification: null };
}
export function mergeTimelyImport(state: TimelyState, imported: TimelyState) {
  let added = 0, skipped = 0, conflicts = 0;
  function merge<T extends { id: string }>(current: T[], incoming: T[]) {
    const ids = new Map(current.map(r => [r.id, r]));
    const additions = incoming.filter(record => {
      const existing = ids.get(record.id);
      if (!existing) { ids.set(record.id, record); added++; return true; }
      if (JSON.stringify(existing, Object.keys(existing).sort()) === JSON.stringify(record, Object.keys(record).sort())) skipped++;
      else conflicts++;
      return false;
    });
    return [...additions, ...current];
  }
  const events = merge(state.events, imported.events);
  const ledgerEntries = merge(state.ledgerEntries, imported.ledgerEntries);
  return { state: { ...state, events, ledgerEntries }, added, skipped, conflicts };
}
