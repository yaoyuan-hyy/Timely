import * as assert from "node:assert/strict";
import test from "node:test";
import { runTimelyAgentWorkflow } from "../lib/agent/app-workflow";
import { extractUiPopupFromMessage } from "../lib/ui-popup";
import type { TimelyState } from "../lib/types";

function baseState(): TimelyState {
  return {
    events: [
      {
        id: "event-1",
        title: "产品评审",
        startsAt: "2026-07-01T15:00:00+08:00",
        endsAt: null,
        location: null,
        notes: null,
        status: "active",
        sourceText: "明天下午3点产品评审",
        createdAt: "2026-06-30T09:00:00+08:00",
        updatedAt: "2026-06-30T09:00:00+08:00"
      }
    ],
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

const now = new Date("2026-06-30T10:00:00+08:00");

test("top-level agent routes schedule questions to the query agent", async () => {
  const result = await runTimelyAgentWorkflow(baseState(), "明天下午有什么安排？", {
    createId: deterministicIds(),
    now
  });

  assert.equal(result.agent, "query");
  assert.equal(result.outcome, "query_answered");
  assert.equal(result.state.events.length, 1);
  assert.equal(result.state.messages.length, 2);

  const popup = extractUiPopupFromMessage(result.state.messages.at(-1)?.content ?? "");
  assert.equal(popup?.query_kind, "schedule");
  assert.equal(popup?.events[0].title, "产品评审");
});

test("top-level agent routes new records to the write agent", async () => {
  const result = await runTimelyAgentWorkflow(baseState(), "帮我记录一下明天下午4点开会", {
    createId: deterministicIds(),
    now
  });

  assert.equal(result.agent, "write");
  assert.equal(result.outcome, "event_created");
  assert.equal(result.state.events.length, 2);
  assert.equal(result.state.messages.at(-1)?.content, "已记录。7月1日 16:00，开会。");
  assert.equal(extractUiPopupFromMessage(result.state.messages.at(-1)?.content ?? ""), null);
});

test("bare meeting records do not become queries", async () => {
  const result = await runTimelyAgentWorkflow(baseState(), "明天三点会议", { now });
  assert.equal(result.agent, "write");
  assert.equal(result.state.events.length, 2);
});

test("short time answers continue the pending event", async () => {
  const first = await runTimelyAgentWorkflow(baseState(), "记录开会", { now });
  const second = await runTimelyAgentWorkflow(first.state, "六点", { now });
  assert.equal(second.outcome, "event_created");
  assert.equal(second.state.events[0].title, "开会");
});

test("short amount answers continue the pending ledger", async () => {
  const first = await runTimelyAgentWorkflow(baseState(), "午饭花了", { now });
  const second = await runTimelyAgentWorkflow(first.state, "38", { now });
  assert.equal(second.outcome, "ledger_created");
  assert.equal(second.state.ledgerEntries[0].amountCents, 3800);
});

test("time-only records retain the time while asking for a title", async () => {
  const first = await runTimelyAgentWorkflow(baseState(), "明天下午三点", { now });
  const second = await runTimelyAgentWorkflow(first.state, "看牙", { now });
  assert.equal(second.outcome, "event_created");
  assert.equal(second.state.events[0].title, "看牙");
  assert.equal(second.state.events[0].startsAt, "2026-07-01T15:00:00+08:00");
});

test("unrecognized wording still reaches the AI parser", async () => {
  let called = false;
  await runTimelyAgentWorkflow(baseState(), "陪小王散步", {
    now,
    parseRecordInput: async () => {
      called = true;
      return { intent: "needs_clarification", title: "陪小王散步", startsAt: null, endsAt: null, location: null, notes: null, targetDate: null, clarificationQuestion: "什么时候？" };
    }
  });
  assert.equal(called, true);
});

test("AI receives the current pending draft on the next turn", async () => {
  const first = await runTimelyAgentWorkflow(baseState(), "记录明天看牙", { now });
  let pendingTitle: string | undefined;
  const second = await runTimelyAgentWorkflow(first.state, "三点", {
    now,
    parseRecordInput: async (_input, context) => {
      const pending = context.pendingClarification;
      pendingTitle = pending?.kind === "event_time" ? pending.title : undefined;
      return { intent: "create_event", title: "看牙", startsAt: "2026-07-01T03:00:00+08:00", endsAt: null, location: null, notes: null, clarificationQuestion: null };
    }
  });
  assert.equal(pendingTitle, "看牙");
  assert.equal(second.state.events[0].startsAt, "2026-07-01T03:00:00+08:00");
});

test("domain-only schedule and ledger requests remain queries", async () => {
  for (const input of ["今天的日程", "这个月的账单"]) {
    const result = await runTimelyAgentWorkflow(baseState(), input, { now });
    assert.equal(result.agent, "query", input);
  }
});
