import assert from "node:assert/strict";
import test from "node:test";
import { resolveRecordInput } from "../lib/record-input";
import { resolveRecordEdit } from "../lib/record-editing";
import { stageRecordResult, confirmRecordDraft } from "../lib/record-draft";
import type { TimelyState } from "../lib/types";
const now = new Date("2026-09-06T10:00:00+08:00");
const empty = (): TimelyState => ({ events: [], ledgerEntries: [], reminders: [], messages: [], pendingClarification: null });
function saved() { return resolveRecordInput(resolveRecordInput(empty(), "明天下午三点会议", { now }), "午饭花了38", { now: new Date(now.getTime() + 1000) }); }

test("event rescheduling preserves ID and waits for confirmation", () => {
  const state = saved();
  const proposed = resolveRecordEdit(state, "把明天的会议改到下午四点", { now });
  assert.ok(proposed);
  const preview = stageRecordResult(state, state, proposed, "把明天的会议改到下午四点");
  assert.equal(preview.events[0].startsAt, "2026-09-07T15:00:00+08:00");
  const final = confirmRecordDraft(preview);
  assert.equal(final.events[0].startsAt, "2026-09-07T16:00:00+08:00");
  assert.equal(final.events[0].id, state.events[0].id);
});
test("relative ledger amount and direction corrections retain original metadata", () => {
  const state = saved();
  const amount = resolveRecordEdit(state, "刚才那笔改成58元", { now });
  assert.equal(amount?.ledgerEntries[0].amountCents, 5800);
  const direction = resolveRecordEdit(state, "不是支出，是收入", { now });
  assert.equal(direction?.ledgerEntries[0].direction, "income");
  assert.equal(direction?.ledgerEntries[0].occurredAt, state.ledgerEntries[0].occurredAt);
});
test("ambiguous event matches ask for one selection and cancelled events are excluded", () => {
  const state = saved();
  state.events.push({ ...state.events[0], id: "other", startsAt: "2026-09-07T18:00:00+08:00" });
  const question = resolveRecordEdit(state, "会议地点改成公司", { now });
  assert.ok(question?.pendingEdit);
  assert.equal(question.events[0].location, null);
  const answer = resolveRecordEdit(question, "第2条", { now });
  assert.equal(answer?.events[1].location, "公司");
  state.events = state.events.map(e => ({ ...e, status: "cancelled" }));
  const none = resolveRecordEdit(state, "会议地点改成公司", { now });
  assert.ok(none);
  assert.equal(none.events[0].location, null);
  assert.match(none.messages.at(-1)?.content ?? "", /没有找到/);
});
test("invalid money and dates never mutate the target", () => {
  const state = saved();
  assert.equal(resolveRecordEdit(state, "上一笔改成-5元", { now })?.ledgerEntries[0].amountCents, 3800);
  assert.equal(resolveRecordEdit(state, "会议改到6月31日下午四点", { now })?.events[0].startsAt, state.events[0].startsAt);
});
test("a time answer disambiguates edits and equal recent timestamps ask instead of guessing", () => {
  const state = saved();
  state.events.push({ ...state.events[0], id: "later", startsAt: "2026-09-07T18:00:00+08:00" });
  const ambiguous = resolveRecordEdit(state, "会议地点改成公司", { now })!;
  const selected = resolveRecordEdit(ambiguous, "下午六点", { now });
  assert.equal(selected?.events[1].location, "公司");
  assert.equal(selected?.events[0].location, null);
  assert.ok(resolveRecordEdit(state, "刚才那条会议改到下午五点", { now })?.pendingEdit);
});
