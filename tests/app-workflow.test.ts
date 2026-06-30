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
