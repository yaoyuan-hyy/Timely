import type { CalendarEvent, LedgerEntry, PendingConfirmation, TimelyState } from "../types";
import type { OperationResult, QueryPlan, QueryPlanV2 } from "../query-contract";
import { queryPlanSchema, queryPlanV2Schema } from "../query-contract";
import { eventSchema, ledgerSchema } from "../record-validation";
export type RecordSnapshot = Pick<TimelyState, "events" | "ledgerEntries">;
export type RecordCandidate = Pick<PendingConfirmation, "kind" | "record">;
export interface RecordRepository {
  snapshot(): RecordSnapshot;
  query(plan: QueryPlan | QueryPlanV2): RecordSnapshot;
  commit(candidate: RecordCandidate, expectedBefore?: CalendarEvent | LedgerEntry): OperationResult<RecordSnapshot>;
}
export function createRecordRepository(state: RecordSnapshot): RecordRepository {
  let data = structuredClone({ events: state.events, ledgerEntries: state.ledgerEntries });
  const snapshot = () => structuredClone(data);
  return {
    snapshot,
    query(input) {
      const parsed = input.version === 2 ? queryPlanV2Schema.parse(input) : queryPlanSchema.parse(input);
      const plan = parsed.version === 2 ? { ...parsed, ...parsed.filters } : parsed;
      const from = Date.parse(plan.timeRange.from), to = Date.parse(plan.timeRange.to);
      const inRange = (time: string) => Date.parse(time) >= from && Date.parse(time) <= to;
      if (plan.kind === "task") return { events: [], ledgerEntries: [] };
      const events = plan.kind !== "schedule" ? [] : data.events.filter(e => e.status === "active" && inRange(e.startsAt) && (!plan.title || e.title.includes(plan.title))).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
      const ledgerEntries = plan.kind !== "ledger" ? [] : data.ledgerEntries.filter(e => inRange(e.occurredAt) && (!plan.direction || e.direction === plan.direction) && (!plan.category || e.category === plan.category || e.note?.includes(plan.category))).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id));
      return structuredClone({ events, ledgerEntries });
    },
    commit(candidate, expectedBefore) {
      const parsed = candidate.kind === "event" ? eventSchema.safeParse(candidate.record) : ledgerSchema.safeParse(candidate.record);
      if (!parsed.success) return { ok: false, code: "invalid", message: "记录内容无效。" };
      const record = parsed.data;
      const records = candidate.kind === "event" ? data.events : data.ledgerEntries;
      const existing = records.find(e => e.id === record.id);
      if (existing && sameRecord(existing, record)) return { ok: true, value: snapshot() };
      if (expectedBefore ? expectedBefore.id !== record.id || !sameRecord(existing, expectedBefore) : existing && !sameRecord(existing, record)) {
        return { ok: false, code: "conflict", message: "这条记录已发生变化，请重新修改。" };
      }
      if (candidate.kind === "event") {
        const event = record as CalendarEvent;
        data = { ...data, events: existing ? data.events.map(e => e.id === record.id ? event : e) : [event, ...data.events] };
      } else {
        const entry = record as LedgerEntry;
        data = { ...data, ledgerEntries: existing ? data.ledgerEntries.map(e => e.id === record.id ? entry : e) : [entry, ...data.ledgerEntries] };
      }
      return { ok: true, value: snapshot() };
    }
  };
}

function sameRecord(a: unknown, b: unknown) {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return a === b;
  return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
}
