import assert from "node:assert/strict";
import test from "node:test";
import { resolveRecordInput } from "../lib/record-input";
import { confirmRecordDraft, stageRecordResult } from "../lib/record-draft";
import { proposeRecordInput } from "../lib/record-session";
import { getRecentRecords, searchRecords, recordTarget } from "../lib/recent-records";
import { findPossibleDuplicate } from "../lib/record-dedup";
import { exportTimelyState, parseTimelyExport, mergeTimelyImport } from "../lib/data-export";
import type { TimelyState } from "../lib/types";
const empty = (): TimelyState => ({ events: [], ledgerEntries: [], reminders: [], messages: [], pendingClarification: null });
const now = new Date("2026-09-06T10:00:00+08:00");
function sample() {
  const event = resolveRecordInput(empty(), "明天下午三点看牙", { now });
  return resolveRecordInput(event, "午饭花了38", { now: new Date(now.getTime() + 60000) });
}
test("recent search mixes records, excludes cancelled events and builds Shanghai targets", () => {
  const state = sample();
  assert.equal(getRecentRecords(state, 5)[0].kind, "ledger");
  assert.equal(searchRecords(state, "看牙")[0].record.id, state.events[0].id);
  assert.equal(searchRecords(state, "餐饮")[0].kind, "ledger");
  assert.deepEqual(recordTarget("event", state.events[0].id, "2026-09-06T17:00:00Z"), { view: "calendar", recordId: state.events[0].id, dayKey: "2026-09-07" });
  state.events[0].status = "cancelled";
  assert.equal(getRecentRecords(state).length, 1);
});
test("duplicate detection compares minute, title, category and amount without suppressing intentional records", () => {
  const state = sample();
  const event = { ...state.events[0], id: "new", title: " 看牙 " };
  assert.ok(findPossibleDuplicate(state, { kind: "event", record: event }));
  assert.equal(findPossibleDuplicate(state, { kind: "event", record: { ...event, startsAt: "2026-09-07T16:00:00+08:00" } }), null);
  const entry = { ...state.ledgerEntries[0], id: "new-ledger" };
  assert.ok(findPossibleDuplicate(state, { kind: "ledger", record: entry }));
  assert.equal(findPossibleDuplicate(state, { kind: "ledger", record: { ...entry, amountCents: 3900 } }), null);
  const proposed = { ...state, events: [event, ...state.events] };
  const staged = stageRecordResult(state, state, proposed, "明天下午三点看牙");
  assert.equal(staged.events.length, 1);
  assert.equal(confirmRecordDraft(staged).events.length, 2);
});
test("AI failure remains visible, local result only previews and edit routing avoids provider", async () => {
  const base = empty();
  const failed = await proposeRecordInput(base, "明天下午三点看牙", { now, parseRecordInput: async () => { throw new Error("timeout"); } });
  assert.equal(failed.usedFallback, true);
  const staged = stageRecordResult(base, base, failed.state, "明天下午三点看牙");
  assert.equal(staged.events.length, 0);
  assert.equal(staged.pendingConfirmation?.input, "明天下午三点看牙");
  const saved = confirmRecordDraft(staged);
  const changed = await proposeRecordInput(saved, "刚才那条改到下午四点", { now, parseRecordInput: async () => { assert.fail("edit must not create through provider"); } });
  assert.equal(changed.state.events[0].id, saved.events[0].id);
  assert.match(changed.state.events[0].startsAt, /16:00/);
});
test("versioned backup roundtrips records, excludes transient state and refuses malformed imports", () => {
  const state = sample();
  const encoded = exportTimelyState({ ...state, pendingEdit: { input: "secret draft", candidates: [], createdAt: 1 } });
  assert.doesNotMatch(encoded, /pendingEdit|secret draft|DEEPSEEK/);
  const imported = parseTimelyExport(encoded);
  assert.deepEqual(imported.events, state.events);
  assert.deepEqual(imported.ledgerEntries, state.ledgerEntries);
  assert.throws(() => parseTimelyExport("{}"));
  assert.throws(() => parseTimelyExport(encoded.replace('"version": 1', '"version": 999')));
  assert.throws(() => parseTimelyExport(encoded.replace('"amountCents": 3800', '"amountCents": -1')));
  assert.throws(() => parseTimelyExport(encoded.replace("2026-09-07T15:00", "2026-06-31T15:00")));
  assert.equal(mergeTimelyImport(state, imported).state.events.length, 1);
  const concurrent = { ...state, events: state.events.map(e => ({ ...e, title: "已手动修改" })) };
  const merged = mergeTimelyImport(concurrent, imported);
  assert.equal(merged.conflicts, 1);
  assert.equal(merged.state.events[0].title, "已手动修改");
});
