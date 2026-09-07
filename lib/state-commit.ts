import type { TimelyState } from "./types";

// Commit only this workflow's changes; concurrent manual edits win conflicts.
export function applyWorkflowState(current: TimelyState, base: TimelyState, next: TimelyState): TimelyState {
  return {
    ...current,
    events: mergeRecords(current.events, base.events, next.events),
    ledgerEntries: mergeRecords(current.ledgerEntries, base.ledgerEntries, next.ledgerEntries),
    messages: mergeRecords(current.messages, base.messages, next.messages, true),
    pendingClarification: equal(current.pendingClarification, base.pendingClarification)
      ? next.pendingClarification : current.pendingClarification,
    ...(next.pendingQueryClarification !== undefined || current.pendingQueryClarification !== undefined ? { pendingQueryClarification: equal(current.pendingQueryClarification, base.pendingQueryClarification) ? next.pendingQueryClarification : current.pendingQueryClarification } : {})
  };
}

function mergeRecords<T extends { id: string }>(current: T[], base: T[], next: T[], append = false): T[] {
  const previous = new Map(base.map(record => [record.id, record]));
  const proposed = new Map(next.map(record => [record.id, record]));
  const existing = new Set(current.map(record => record.id));
  const additions = next.filter(record => !previous.has(record.id) && !existing.has(record.id));
  const retained = current.flatMap(record => {
    const before = previous.get(record.id);
    if (!before || !equal(record, before)) return [record];
    const after = proposed.get(record.id);
    return after ? [after] : [];
  });
  return append ? [...retained, ...additions] : [...additions, ...retained];
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
