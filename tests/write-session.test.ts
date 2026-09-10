import assert from "node:assert/strict";
import test from "node:test";
import { runInputSession, stageInputSession } from "../lib/write-session";
import { confirmRecordDraft } from "../lib/record-draft";
import type { TimelyState } from "../lib/types";
import { normalizeTimelyState } from "../lib/state";
import { commitConfirmedRecord } from "../lib/tools/record-tools";
import { createRecordRepository } from "../lib/repository/record-repository";

const now = new Date("2026-09-07T10:00:00+08:00");
const empty = (): TimelyState => ({ events: [], ledgerEntries: [], reminders: [], messages: [], pendingClarification: null });
const field = <T>(value: T, evidence: string) => ({ value, evidence });
const create = { action: "write", operation: "create", kind: "ledger", patch: { amount: field("35", "35"), direction: field("expense", "花"), category: field("餐饮", "午饭") } };
test("explicit proposal commits once and preserves concurrent unrelated records", async () => {
  const base = empty();
  const result = await runInputSession(base, "午饭花35", { now, parse: async () => create });
  assert.equal(result.state.ledgerEntries.length, 0);
  assert.equal(result.state.pendingConfirmation?.kind, "ledger");
  const staged = stageInputSession(base, base, result.state);
  const saved = confirmRecordDraft(staged);
  assert.equal(saved.ledgerEntries[0].amountCents, 3500);
  assert.equal(confirmRecordDraft(saved).ledgerEntries.length, 1);
  assert.equal(saved.writeSession, null);
});
test("a ready draft can be corrected with no commit and no earlier field loss", async () => {
  const base = empty();
  const first = await runInputSession(base, "午饭花35", { now, parse: async () => create });
  const draft = first.state.writeSession!.draft!;
  const next = await runInputSession(first.state, "不是35，是45", { now, parse: async () => ({ action: "write", operation: "revise", kind: "ledger", base: { id: draft.id, revision: draft.revision }, patch: { amount: field("45", "是45") } }) });
  assert.equal(next.state.ledgerEntries.length, 0);
  assert.equal(next.state.pendingConfirmation?.kind === "ledger" && next.state.pendingConfirmation.record.amountCents, 4500);
  assert.equal(next.state.writeSession?.draft?.fields.category, "餐饮");
});
test("a malformed model decision preserves draft and is not counted as successful recognition", async () => {
  const first = await runInputSession(empty(), "午饭花35", { now, parse: async () => create });
  const next = await runInputSession(first.state, "明天开会", { now, parse: async () => ({ action: "write", patch: {} }) });
  assert.equal(next.source, "failed");
  assert.deepEqual(next.state.writeSession?.draft, first.state.writeSession?.draft);
  assert.equal(next.state.writeSession?.recovery?.turns[0].input, "明天开会");
  assert.deepEqual(next.state.pendingConfirmation, first.state.pendingConfirmation);
});
test("multiple operations produce clarification rather than silently staging one record", async () => {
  const result = await runInputSession(empty(), "吃饭35、打车26", { now, parse: async () => ({ action: "clarify", reason: "multiple_operations", question: "先记录哪一笔？" }) });
  assert.equal(result.state.pendingConfirmation, undefined);
  assert.equal(result.state.ledgerEntries.length, 0);
});
test("late parsing results cannot replace a newer or discarded draft", async () => {
  const base = empty();
  const first = await runInputSession(base, "午饭花35", { now, parse: async () => create });
  const newer = { ...base, writeSession: first.state.writeSession, pendingConfirmation: first.state.pendingConfirmation };
  const stale = stageInputSession(newer, base, { ...first.state, pendingConfirmation: null });
  assert.deepEqual(stale.pendingConfirmation, newer.pendingConfirmation);
});
test("an existing draft is not lost when the model targets a different saved record", async () => {
  const first = await runInputSession(empty(), "午饭花35", { now, parse: async () => create });
  const saved = confirmRecordDraft(first.state);
  const pending = await runInputSession(saved, "午饭花35", { now, parse: async () => create });
  const next = await runInputSession(pending.state, "上一笔改成45", { now, parse: async () => ({ action: "write", operation: "update", kind: "ledger", target: { reference: "recent" }, patch: { amount: field("45", "45") } }) });
  assert.deepEqual(next.state.writeSession, pending.state.writeSession);
});
test("conflicting confirmation preserves the user's proposal and never overwrites a newer record", async () => {
  const saved = confirmRecordDraft((await runInputSession(empty(), "午饭花35", { now, parse: async () => create })).state);
  const revised = await runInputSession(saved, "上一笔改成45", { now, parse: async () => ({ action: "write", operation: "update", kind: "ledger", target: { reference: "recent" }, patch: { amount: field("45", "45") } }) });
  const concurrent = { ...revised.state, ledgerEntries: saved.ledgerEntries.map(e => ({ ...e, amountCents: 5000 })) };
  const next = confirmRecordDraft(concurrent);
  assert.equal(next.ledgerEntries[0].amountCents, 5000);
  assert.deepEqual(next.pendingConfirmation, revised.state.pendingConfirmation);
});
test("ambiguous targets are selected locally and keep expectedBefore through confirmation", async () => {
  const one = confirmRecordDraft((await runInputSession(empty(), "午饭花35", { now, parse: async () => create })).state);
  const two = confirmRecordDraft((await runInputSession(one, "午饭花35", { now, parse: async () => create })).state);
  const asking = await runInputSession(two, "餐饮改成45", { now, parse: async () => ({ action: "write", operation: "update", kind: "ledger", target: { reference: "matching", category: "餐饮" }, patch: { amount: field("45", "45") } }) });
  assert.equal(asking.state.writeSession?.selection?.candidates.length, 2);
  assert.equal(asking.state.pendingConfirmation, null);
  const selected = await runInputSession(asking.state, "第二条", { now, parse: async () => ({ action: "write", operation: "update", kind: "ledger", target: { reference: "selection", ordinal: 2 }, patch: {} }) });
  assert.equal(selected.state.pendingConfirmation?.record.id, asking.state.writeSession!.selection!.candidates[1].record.id);
  assert.equal(confirmRecordDraft(selected.state).ledgerEntries.filter(e => e.amountCents === 4500).length, 1);
});
test("provider outage only permits a scalar answer to a single known amount slot", async () => {
  const first = await runInputSession(empty(), "昨天打车", { now, parse: async () => ({ action: "write", operation: "create", kind: "ledger", patch: { direction: field("expense", "打车") } }) });
  const failed = await runInputSession(first.state, "35和26", { now, parse: async () => { throw Error("offline"); } });
  assert.equal(failed.source, "failed");
  assert.deepEqual(failed.state.writeSession?.draft, first.state.writeSession?.draft);
  assert.equal(failed.state.writeSession?.recovery?.turns[0].input, "35和26");
  const scalar = await runInputSession(first.state, "三十五", { now, parse: async () => { throw Error("offline"); } });
  assert.equal(scalar.source, "local");
  assert.equal(scalar.state.pendingConfirmation?.kind === "ledger" && scalar.state.pendingConfirmation.record.amountCents, 3500);
});

test("cancel command is not reported as provider fallback", async () => {
  const { proposeRecordInput } = await import("../lib/record-session");
  const first = await runInputSession(empty(), "午饭花35", { now, parse: async () => create });
  const result = await proposeRecordInput(first.state, "取消", { now, parseInputDecision: async () => { throw Error("must not call"); } });
  assert.equal(result.usedFallback, false);
  assert.equal(result.state.writeSession, null);
});

test("selection with a new correction applies both turns without dropping the latest patch", async () => {
  const one = confirmRecordDraft((await runInputSession(empty(), "午饭花35", { now, parse: async () => create })).state);
  const two = confirmRecordDraft((await runInputSession(one, "午饭花35", { now, parse: async () => create })).state);
  const asking = await runInputSession(two, "餐饮改成45", { now, parse: async () => ({ action: "write", operation: "update", kind: "ledger", target: { reference: "matching", category: "餐饮" }, patch: { amount: field("45", "45") } }) });
  const selected = await runInputSession(asking.state, "第二条，改成昨天", { now, parse: async () => ({ action: "write", operation: "update", kind: "ledger", target: { reference: "selection", ordinal: 2 }, patch: { date: field({ type: "relative_day", offset: -1 }, "昨天") } }) });
  assert.equal(selected.state.writeSession?.draft?.fields.amountCents, 4500);
  assert.equal(selected.state.writeSession?.draft?.fields.date, "2026-09-06");
  assert.deepEqual(selected.state.ledgerEntries, two.ledgerEntries);
});

test("failed initial input is recoverable without trusting its invalid model fields", async () => {
  const first = await runInputSession(empty(), "昨天午饭", { now, parse: async () => ({ ...create, patch: { amount: field("午饭", "午饭") } }) });
  assert.equal(first.state.writeSession?.draft, null);
  let called = false;
  const next = await runInputSession(first.state, "花35元", { now, parse: async (_input, context) => {
    const recovery = (context.pending as any).recovery;
    assert.equal(recovery?.turns[0].input, "昨天午饭");
    assert.equal(JSON.stringify(recovery).includes("amount"), false);
    called = true;
    return { ...create, recovery: { id: recovery.id, revision: recovery.revision, mode: "continue" }, patch: { amount: field("35元", "35元"), direction: field("expense", "花"), date: { ...field({ type: "relative_day", offset: -1 }, "昨天"), turnId: recovery.turns[0].id } } };
  } });
  assert.equal(called, true);
  assert.equal(next.state.writeSession?.draft?.fields.date, "2026-09-06");
  assert.equal(next.state.ledgerEntries.length, 0);
  assert.ok(next.state.pendingConfirmation);
  assert.equal((next.state.writeSession as any)?.recovery, undefined);
});

test("recovery anchors each quoted date to its own turn across midnight", async () => {
  const beforeMidnight = new Date("2026-09-07T23:59:00+08:00");
  const failed = await runInputSession(empty(), "昨天午饭", { now: beforeMidnight, parse: async () => { throw Error("offline"); } });
  const next = await runInputSession(failed.state, "花35元", { now: new Date("2026-09-08T00:01:00+08:00"), parse: async (_input, context) => {
    const recovery = (context.pending as any).recovery;
    assert.ok(recovery);
    return { ...create, recovery: { id: recovery.id, revision: recovery.revision, mode: "continue" }, patch: { amount: field("35元", "35元"), direction: field("expense", "花"), date: { ...field({ type: "relative_day", offset: -1 }, "昨天"), turnId: recovery.turns[0].id } } };
  } });
  assert.equal(next.state.writeSession?.draft?.fields.date, "2026-09-06");
});

test("unacknowledged or stale recovery cannot silently create a fresh record", async () => {
  const first = await runInputSession(empty(), "昨天午饭", { now, parse: async () => { throw Error("offline"); } });
  for (const recovery of [undefined, { id: "old", revision: 1, mode: "continue" }]) {
    const next = await runInputSession(first.state, "午饭花35", { now, parse: async () => ({ ...create, ...(recovery ? { recovery } : {}) }) });
    assert.equal(Boolean(next.state.pendingConfirmation), false);
    assert.equal(next.state.ledgerEntries.length, 0);
  }
});

test("explicit topic replacement cannot cite the abandoned input", async () => {
  const first = await runInputSession(empty(), "昨天午饭", { now, parse: async () => { throw Error("offline"); } });
  const next = await runInputSession(first.state, "咖啡花35", { now, parse: async (_input, context) => {
    const recovery = (context.pending as any).recovery;
    assert.ok(recovery);
    return { ...create, recovery: { id: recovery.id, revision: recovery.revision, mode: "replace" }, patch: { amount: field("35", "35"), direction: field("expense", "花"), date: { ...field({ type: "relative_day", offset: -1 }, "昨天"), turnId: recovery.turns[0].id } } };
  } });
  assert.equal(Boolean(next.state.pendingConfirmation), false);
});

test("clarification stores bounded unresolved input and expires before unrelated input", async () => {
  const first = await runInputSession(empty(), "昨天午饭", { now, parse: async () => ({ action: "clarify", reason: "ambiguous_intent", question: "是要记账还是查询？" }) });
  assert.ok((first.state.writeSession as any)?.recovery);
  const next = await runInputSession(first.state, "午饭花35", { now: new Date(now.getTime() + 16 * 60 * 1000), parse: async (_input, context) => {
    assert.equal((context.pending as any).recovery ?? null, null);
    return create;
  } });
  assert.ok(next.state.pendingConfirmation);
  assert.equal((normalizeTimelyState(first.state, empty()).writeSession as any)?.recovery, undefined);
});

test("failed correction blocks confirmation of the old proposal until resolved", async () => {
  const first = await runInputSession(empty(), "午饭花35", { now, parse: async () => create });
  const failed = await runInputSession(first.state, "改成昨天", { now, parse: async () => { throw Error("offline"); } });
  assert.deepEqual(failed.state.pendingConfirmation, first.state.pendingConfirmation);
  assert.equal(confirmRecordDraft(failed.state).ledgerEntries.length, 0);
  assert.equal(commitConfirmedRecord(failed.state).ok, false);
});

test("complete restatement can correct an invalid date using current-turn evidence", async () => {
  const first = await runInputSession(empty(), "6月31日10点开会", { now, parse: async () => ({ action: "write", operation: "create", kind: "event", patch: { date: field({ type: "absolute", month: 6, day: 31 }, "6月31日"), title: field("开会", "开会"), time: field({ hour: 10, minute: 0 }, "10点") } }) });
  const next = await runInputSession(first.state, "改为6月30日10点开会", { now, parse: async (_input, context) => {
    const recovery = context.pending.recovery!;
    return { action: "write", operation: "create", kind: "event", recovery: { id: recovery.id, revision: recovery.revision, mode: "continue" }, patch: { date: field({ type: "absolute", month: 6, day: 30 }, "6月30日"), title: field("开会", "开会"), time: field({ hour: 10, minute: 0 }, "10点") } };
  } });
  assert.equal(next.state.pendingConfirmation?.kind, "event");
  assert.equal(next.state.writeSession?.draft?.fields.date, "2026-06-30");
});

test("a new topic explicitly replaces unresolved input and does not inherit its date", async () => {
  const first = await runInputSession(empty(), "昨天午饭", { now, parse: async () => { throw Error("offline"); } });
  const next = await runInputSession(first.state, "咖啡花35", { now, parse: async (_input, context) => {
    const recovery = context.pending.recovery!;
    return { ...create, recovery: { id: recovery.id, revision: recovery.revision, mode: "replace" }, patch: { amount: field("35", "35"), direction: field("expense", "花") } };
  } });
  assert.equal(next.state.writeSession?.draft?.fields.date, "2026-09-07");
  assert.equal(next.state.writeSession?.recovery, undefined);
  assert.ok(next.state.pendingConfirmation);
});

test("recovery cancellation and stale async staging cannot resurrect an abandoned input", async () => {
  const first = await runInputSession(empty(), "昨天午饭", { now, parse: async () => { throw Error("offline"); } });
  const cancelled = await runInputSession(first.state, "取消", { now });
  assert.equal(cancelled.source, "command");
  assert.equal(cancelled.state.writeSession, null);
  assert.equal(stageInputSession(cancelled.state, first.state, first.state).writeSession, null);
});

test("recovery history is bounded and repeated failures never turn into validated fields", async () => {
  let state = empty();
  for (let index = 0; index < 7; index++) {
    state = (await runInputSession(state, `补充${index}`, { now, parse: async () => { throw Error("offline"); } })).state;
  }
  assert.equal(state.writeSession?.recovery?.turns.length, 4);
  assert.equal(state.writeSession?.draft, null);
  assert.equal(Boolean(state.pendingConfirmation), false);
  assert.match(state.writeSession!.recovery!.question, /完整重述/);
});

test("oversized input cannot poison the bounded recovery context", async () => {
  const result = await runInputSession(empty(), "字".repeat(4001), { now, parse: async () => { throw Error("must not parse"); } });
  assert.equal(Boolean(result.state.writeSession?.recovery), false);
  assert.equal(Boolean(result.state.pendingConfirmation), false);
});

test("canonical category queries include legacy labels without matching unrelated notes", async () => {
  const saved = confirmRecordDraft((await runInputSession(empty(), "午饭花35", { now, parse: async () => create })).state);
  const record = saved.ledgerEntries[0];
  const state = { ...saved, ledgerEntries: [{ ...record, category: "午饭" }, { ...record, id: "other", category: "交通", note: "去餐饮公司" }] };
  const found = createRecordRepository(state).query({ version: 2, kind: "ledger", timeRange: { label: "今天", from: "2026-09-07T00:00:00+08:00", to: "2026-09-07T23:59:59+08:00" }, filters: { title: null, category: "餐饮", direction: "expense" }, aggregation: { op: "none" } });
  assert.deepEqual(found.ledgerEntries.map(entry => entry.id), [record.id]);
  assert.equal(state.ledgerEntries[0].category, "午饭");
});

test("recovery resolves an unsuccessful correction before confirmation", async () => {
  const first = await runInputSession(empty(), "午饭花35", { now, parse: async () => create });
  const failed = await runInputSession(first.state, "改成昨天", { now, parse: async () => { throw Error("offline"); } });
  const restored = await runInputSession(failed.state, "金额也改45", { now, parse: async (_input, context) => {
    const recovery = context.pending.recovery!;
    return { action: "write", kind: "ledger", operation: "revise", base: { id: context.pending.draft!.id, revision: context.pending.draft!.revision }, recovery: { id: recovery.id, revision: recovery.revision, mode: "continue" }, patch: { amount: field("45", "45"), date: { ...field({ type: "relative_day", offset: -1 }, "昨天"), turnId: recovery.turns[0].id } } };
  } });
  const saved = confirmRecordDraft(restored.state);
  assert.equal(saved.ledgerEntries[0].amountCents, 4500);
  assert.match(saved.ledgerEntries[0].occurredAt, /^2026-09-06/);
  assert.equal(saved.writeSession, null);
});
