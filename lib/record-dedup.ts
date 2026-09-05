import type { TimelyState } from "./types";
import type { RecentRecord } from "./recent-records";
const normalized = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();
const minute = (value: string) => Math.floor(Date.parse(value) / 60000);
export function findPossibleDuplicate(state: TimelyState, candidate: RecentRecord) {
  if (candidate.kind === "event") {
    const record = candidate.record;
    return state.events.find(e => e.id !== record.id && e.status === "active" && normalized(e.title) === normalized(record.title) && minute(e.startsAt) === minute(record.startsAt)) ?? null;
  }
  const record = candidate.record;
  return state.ledgerEntries.find(e => e.id !== record.id && e.direction === record.direction && e.amountCents === record.amountCents && normalized(e.category) === normalized(record.category) && minute(e.occurredAt) === minute(record.occurredAt)) ?? null;
}
