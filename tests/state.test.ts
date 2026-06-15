import * as assert from "node:assert/strict";
import { normalizeTimelyState } from "../lib/state";
import type { TimelyState } from "../lib/types";

const fallback: TimelyState = {
  events: [],
  reminders: [],
  ledgerEntries: [],
  messages: [],
  pendingClarification: null
};

{
  assert.deepEqual(normalizeTimelyState("{bad json", fallback), fallback);
}

{
  const state = normalizeTimelyState(
    {
      events: [
        {
          id: "event-1",
          title: "会议",
          startsAt: "2026-06-13T15:00:00+08:00",
          status: "active"
        }
      ],
      messages: [
        {
          id: "message-1",
          role: "assistant",
          content: "你好"
        }
      ]
    },
    fallback
  );

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].endsAt, null);
  assert.equal(state.events[0].location, null);
  assert.equal(state.events[0].notes, null);
  assert.equal(state.events[0].sourceText, "");
  assert.equal(state.reminders.length, 0);
  assert.equal(state.ledgerEntries.length, 0);
  assert.equal(state.messages[0].createdAt, "");
  assert.equal(state.pendingClarification, null);
}

{
  const state = normalizeTimelyState(
    {
      events: [],
      reminders: [],
      ledgerEntries: [
        {
          id: "ledger-1",
          direction: "expense",
          amountCents: 3850,
          currency: "CNY",
          category: "餐饮",
          occurredAt: "2026-06-15T12:10:00+08:00",
          sourceText: "午饭花了38.5"
        },
        {
          id: "ledger-bad",
          direction: "expense",
          amountCents: -1,
          currency: "CNY",
          category: "餐饮",
          occurredAt: "2026-06-15T12:10:00+08:00"
        }
      ],
      messages: []
    },
    fallback
  );

  assert.equal(state.ledgerEntries.length, 1);
  assert.equal(state.ledgerEntries[0].counterparty, null);
  assert.equal(state.ledgerEntries[0].note, null);
  assert.equal(state.ledgerEntries[0].updatedAt, "");
}

{
  const state = normalizeTimelyState(
    {
      events: [],
      reminders: [],
      ledgerEntries: [],
      messages: [],
      pendingClarification: {
        kind: "ledger_amount",
        direction: "expense",
        category: "购物",
        occurredAt: "2026-05-07T12:10:00+08:00",
        counterparty: null,
        note: "抽湿机",
        sourceText: "上个月7号买了个抽湿机",
        createdAt: "2026-06-15T12:10:00+08:00"
      }
    },
    fallback
  );

  assert.equal(state.pendingClarification?.createdAt, new Date("2026-06-15T12:10:00+08:00").getTime());
}
