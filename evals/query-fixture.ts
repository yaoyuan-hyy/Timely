import type { CalendarEvent, LedgerEntry, TimelyState } from "../lib/types";

export const queryNow = new Date("2026-09-06T10:00:00+08:00");
export function queryFixture(): TimelyState {
  const event = (id: string, startsAt: string, status: CalendarEvent["status"] = "active"): CalendarEvent => ({ id, title: "项目会议", startsAt, endsAt: null, status, location: null, notes: null, sourceText: "合成评测记录", createdAt: queryNow.toISOString(), updatedAt: queryNow.toISOString() });
  const ledger = (id: string, occurredAt: string, direction: LedgerEntry["direction"], amountCents: number): LedgerEntry => ({ id, occurredAt, direction, amountCents, currency: "CNY", category: "餐饮", counterparty: null, note: null, sourceText: "合成评测流水", createdAt: queryNow.toISOString(), updatedAt: queryNow.toISOString() });
  return {
    events: [event("morning", "2026-09-07T09:00:00+08:00"), event("afternoon", "2026-09-07T15:00:00+08:00"), event("cancelled", "2026-09-07T16:00:00+08:00", "cancelled"), event("utc", "2026-09-06T17:00:00Z"), event("today", "2026-09-06T12:00:00+08:00")],
    ledgerEntries: [ledger("expense", "2026-08-31T23:59:59+08:00", "expense", 3800), ledger("refund", "2026-08-12T10:00:00+08:00", "income", 500), ledger("september", "2026-09-01T00:00:00+08:00", "expense", 1000)],
    reminders: [], messages: [], pendingClarification: null
  };
}
