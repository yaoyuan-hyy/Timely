import assert from "node:assert/strict";
import test from "node:test";
import { applyWorkflowState } from "../lib/state-commit";
import type { TimelyState } from "../lib/types";
const base: TimelyState = { events: [{ id: "old", title: "开会", startsAt: "2026-09-05T15:00:00+08:00", endsAt: null, location: null, notes: null, status: "active", sourceText: "开会", createdAt: "", updatedAt: "" }], ledgerEntries: [], reminders: [], messages: [], pendingClarification: null };
test("async result preserves cancellation performed during parsing", () => {
  const current: TimelyState = { ...base, events: [{ ...base.events[0], status: "cancelled" }] };
  const next: TimelyState = { ...base, events: [{ ...base.events[0], id: "new" }, ...base.events] };
  const committed = applyWorkflowState(current, base, next);
  assert.equal(committed.events.find(e => e.id === "old")?.status, "cancelled");
  assert.equal(committed.events.length, 2);
  assert.deepEqual(applyWorkflowState(committed, base, next), committed, "reapplying a result is idempotent");
});
test("async cancellation cannot resurrect an event already permanently removed", () => {
  const current: TimelyState = { ...base, events: [] };
  const next: TimelyState = { ...base, events: [{ ...base.events[0], status: "cancelled" }] };
  assert.equal(applyWorkflowState(current, base, next).events.length, 0);
});
