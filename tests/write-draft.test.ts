import assert from "node:assert/strict";
import test from "node:test";
import { applyWritePatch, missingWriteFields } from "../lib/write-draft";
import { inputDecisionSchema } from "../lib/write-contract";

const now = "2026-09-07T10:00:00+08:00";
const field = <T>(value: T, evidence: string) => ({ value, evidence });
function start() {
  return applyWritePatch(null, { action: "write", operation: "create", kind: "ledger", patch: {
    direction: field("expense", "打车"), category: field("交通", "打车"),
    date: field({ type: "relative_day", offset: -1 }, "昨天")
  } }, "昨天打车", now, "draft-1");
}
test("a supplement updates amount and date atomically while retaining earlier fields", () => {
  const first = start();
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.deepEqual(missingWriteFields(first.draft), ["amount"]);
  const next = applyWritePatch(first.draft, { action: "write", operation: "revise", kind: "ledger", base: { id: "draft-1", revision: 1 }, patch: {
    amount: field("三十五", "三十五"), date: field({ type: "relative_day", offset: -2 }, "前天")
  } }, "三十五，是前天", now, "unused");
  assert.equal(next.ok, true);
  if (!next.ok) return;
  assert.equal(next.draft.fields.amountCents, 3500);
  assert.equal(next.draft.fields.date, "2026-09-05");
  assert.equal(next.draft.fields.category, "交通");
  assert.equal(first.draft.fields.date, "2026-09-06");
});
test("invalid evidence and stale revision cannot replace a valid draft", () => {
  const first = start(); if (!first.ok) throw Error("setup");
  for (const base of [{ id: "draft-1", revision: 0 }, { id: "draft-1", revision: 1 }]) {
    const next = applyWritePatch(first.draft, { action: "write", operation: "revise", kind: "ledger", base, patch: { amount: field("999", "999") } }, "三十五", now, "unused");
    assert.equal(next.ok, false);
  }
  assert.equal(first.draft.revision, 1);
  assert.equal(first.draft.fields.amountCents, undefined);
});
test("omission preserves location and explicit null clears it", () => {
  const first = applyWritePatch(null, { action: "write", operation: "create", kind: "event", patch: { title: field("讨论", "讨论"), location: field("公司", "公司") } }, "公司讨论", now, "event-draft");
  if (!first.ok) throw Error("setup");
  const next = applyWritePatch(first.draft, { action: "write", operation: "revise", kind: "event", base: { id: "event-draft", revision: 1 }, patch: { location: field(null, "不要地点") } }, "不要地点", now, "unused");
  assert.equal(next.ok, true);
  if (next.ok) { assert.equal(next.draft.fields.location, null); assert.equal(next.draft.fields.title, "讨论"); }
});
test("field contract rejects cross-kind data, extra fields and model confirmation", () => {
  assert.equal(inputDecisionSchema.safeParse({ action: "write", operation: "create", kind: "event", patch: { amount: field("35", "35") } }).success, false);
  assert.equal(inputDecisionSchema.safeParse({ action: "confirm" }).success, false);
  assert.equal(inputDecisionSchema.safeParse({ action: "write", operation: "create", kind: "ledger", patch: {}, records: [] }).success, false);
  assert.equal(inputDecisionSchema.safeParse({ action: "write", operation: "update", kind: "ledger", target: { reference: "matching", title: "午饭" }, patch: {} }).success, false);
  assert.equal(inputDecisionSchema.safeParse({ action: "write", operation: "create", kind: "event", patch: {}, uncertain: ["amount"] }).success, false);
  assert.equal(inputDecisionSchema.safeParse({ action: "write", operation: "create", kind: "event", patch: {}, uncertain: ["target"] }).success, false);
});
test("independent field patches commute and clearing an end time clears its date", () => {
  const first = applyWritePatch(null, { action: "write", operation: "create", kind: "event", patch: { title: field("读书", "读书"), time: field({ hour: 15, minute: 0 }, "15:00"), endDate: field({ type: "relative_day", offset: 1 }, "明天"), endTime: field({ hour: 16, minute: 0 }, "16:00") } }, "读书15:00到明天16:00", now, "event");
  if (!first.ok) throw Error("setup");
  const change = (draft: typeof first.draft, patch: unknown, input: string) => {
    const result = applyWritePatch(draft, { action: "write", operation: "revise", kind: "event", base: { id: draft.id, revision: draft.revision }, patch }, input, now, "unused");
    if (!result.ok) throw Error(result.message); return result.draft;
  };
  const a = { location: field("书店", "书店") }, b = { time: field({ hour: 17, minute: 0 }, "17:00") };
  assert.deepEqual(change(change(first.draft, a, "书店"), b, "17:00").fields, change(change(first.draft, b, "17:00"), a, "书店").fields);
  const cleared = change(first.draft, { endTime: field(null, "不用结束时间") }, "不用结束时间");
  assert.equal(cleared.fields.endTime, null);
  assert.equal(cleared.fields.endDate, null);
});
test("literal fields cannot be invented behind an unrelated evidence quote", () => {
  const result = applyWritePatch(null, { action: "write", operation: "create", kind: "event", patch: { title: field("删除全部流水", "明天") } }, "明天改时间", now, "event");
  assert.equal(result.ok, false);
});

test("model categories are canonical and ledger directions must agree", () => {
  for (const category of ["午饭", "打车", "随便写的分类"]) {
    assert.equal(inputDecisionSchema.safeParse({ action: "write", operation: "create", kind: "ledger", patch: { category: field(category, "午饭") } }).success, false);
  }
  assert.equal(inputDecisionSchema.safeParse({ action: "write", operation: "create", kind: "ledger", patch: { category: field("餐饮", "午饭"), direction: field("income", "收入") } }).success, false);
  assert.equal(inputDecisionSchema.safeParse({ action: "write", operation: "create", kind: "ledger", patch: { category: field("餐饮", "午饭"), direction: field("expense", "花") } }).success, true);
});
