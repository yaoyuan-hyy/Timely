import * as assert from "node:assert/strict";
import test from "node:test";
import { runRecordAgentWorkflow } from "../lib/agent/record-workflow";
import type { AiRecordParseResult } from "../lib/record-input";
import type { TimelyState } from "../lib/types";

function emptyState(): TimelyState {
  return {
    events: [],
    reminders: [],
    ledgerEntries: [],
    messages: [],
    pendingClarification: null
  };
}

function deterministicIds() {
  let next = 0;
  return (prefix: string) => `${prefix}-${++next}`;
}

const now = new Date("2026-06-15T12:10:00+08:00");

test("record agent workflow runs local fallback without an AI parser", async () => {
  const result = await runRecordAgentWorkflow(emptyState(), "帮我记录一下6月20日下午4点开会", {
    createId: deterministicIds(),
    now
  });

  assert.equal(result.route, "local_fallback");
  assert.equal(result.outcome, "event_created");
  assert.deepEqual(result.trace, [
    "normalize_input",
    "call_ai_parser",
    "apply_local_fallback",
    "summarize_outcome"
  ]);
  assert.equal(result.state.events.length, 1);
  assert.equal(result.state.events[0].title, "开会");
  assert.equal(result.state.events[0].startsAt, "2026-06-20T16:00:00+08:00");
  assert.equal(result.state.messages.at(-1)?.content, "已记录。6月20日 16:00，开会。");
});

test("record agent workflow applies a valid AI parse result", async () => {
  const aiResult: AiRecordParseResult = {
    intent: "create_ledger",
    direction: "expense",
    amountCents: 3800,
    currency: "CNY",
    category: "餐饮",
    occurredAt: null,
    counterparty: null,
    note: null,
    clarificationQuestion: null
  };
  const result = await runRecordAgentWorkflow(emptyState(), "午饭花了38", {
    createId: deterministicIds(),
    now,
    parseRecordInput: async (input, context) => {
      assert.equal(input, "午饭花了38");
      assert.equal(context.now.toISOString(), now.toISOString());
      return aiResult;
    }
  });

  assert.equal(result.route, "ai_result");
  assert.equal(result.outcome, "ledger_created");
  assert.equal(result.aiError, null);
  assert.equal(result.aiResult, aiResult);
  assert.equal(result.state.events.length, 0);
  assert.equal(result.state.ledgerEntries.length, 1);
  assert.equal(result.state.ledgerEntries[0].amountCents, 3800);
  assert.equal(result.state.messages.at(-1)?.content, "已记录。支出 38.00 元，餐饮。");
});

test("record agent workflow falls back locally when AI parsing fails", async () => {
  const result = await runRecordAgentWorkflow(emptyState(), "今天午饭花了38", {
    createId: deterministicIds(),
    now,
    parseRecordInput: async () => {
      throw new Error("model timeout");
    }
  });

  assert.equal(result.route, "local_fallback");
  assert.equal(result.outcome, "ledger_created");
  assert.equal(result.aiResult, null);
  assert.equal(result.aiError, "model timeout");
  assert.equal(result.state.ledgerEntries.length, 1);
  assert.equal(result.state.ledgerEntries[0].amountCents, 3800);
});
