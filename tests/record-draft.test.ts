import assert from "node:assert/strict";
import test from "node:test";
import { resolveRecordInput } from "../lib/record-input";
import { stageRecordResult, confirmRecordDraft, discardRecordDraft } from "../lib/record-draft";
import type { TimelyState } from "../lib/types";

const empty = (): TimelyState => ({ events: [], ledgerEntries: [], reminders: [], messages: [], pendingClarification: null });
const now = new Date("2026-09-06T10:00:00+08:00");

test("event and ledger stay outside stored records until confirmed; cancel writes nothing", () => {
  for (const input of ["明天下午三点看牙", "午饭花了38"]) {
    const base = empty();
    const proposed = resolveRecordInput(base, input, { now });
    const preview = stageRecordResult(base, base, proposed, input);
    assert.equal(preview.events.length + preview.ledgerEntries.length, 0);
    assert.ok(preview.pendingConfirmation);
    assert.doesNotMatch(preview.messages.at(-1)?.content ?? "", /已记录/);
    const saved = confirmRecordDraft(preview);
    assert.equal(saved.events.length + saved.ledgerEntries.length, 1);
    assert.equal(confirmRecordDraft(saved).events.length + confirmRecordDraft(saved).ledgerEntries.length, 1);
    const cancelled = discardRecordDraft(preview);
    assert.equal(cancelled.events.length + cancelled.ledgerEntries.length, 0);
  }
});

test("confirming a draft preserves unrelated changes made after the preview", () => {
  const base = empty();
  const preview = stageRecordResult(base, base, resolveRecordInput(base, "明天下午三点看牙", { now }), "明天下午三点看牙");
  const manual = resolveRecordInput(base, "早餐花了12", { now });
  const saved = confirmRecordDraft({ ...preview, ledgerEntries: manual.ledgerEntries });
  assert.equal(saved.events.length, 1);
  assert.equal(saved.ledgerEntries[0]?.amountCents, 1200);
});
