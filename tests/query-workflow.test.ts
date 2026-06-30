import * as assert from "node:assert/strict";
import test from "node:test";
import { runQueryAgentWorkflow } from "../lib/agent/query-workflow";
import { extractUiPopupFromMessage } from "../lib/ui-popup";
import type { TimelyState } from "../lib/types";

function stateWithData(): TimelyState {
  return {
    events: [
      {
        id: "event-1",
        title: "产品评审",
        startsAt: "2026-07-01T15:00:00+08:00",
        endsAt: null,
        location: "会议室 A",
        notes: null,
        status: "active",
        sourceText: "明天下午3点产品评审",
        createdAt: "2026-06-30T09:00:00+08:00",
        updatedAt: "2026-06-30T09:00:00+08:00"
      },
      {
        id: "event-morning",
        title: "晨间同步",
        startsAt: "2026-07-01T09:00:00+08:00",
        endsAt: null,
        location: null,
        notes: null,
        status: "active",
        sourceText: "明天上午9点晨间同步",
        createdAt: "2026-06-30T09:00:00+08:00",
        updatedAt: "2026-06-30T09:00:00+08:00"
      },
      {
        id: "event-next-week",
        title: "项目会议",
        startsAt: "2026-07-08T14:00:00+08:00",
        endsAt: null,
        location: "会议室 B",
        notes: null,
        status: "active",
        sourceText: "下周三下午2点项目会议",
        createdAt: "2026-06-30T09:00:00+08:00",
        updatedAt: "2026-06-30T09:00:00+08:00"
      },
      {
        id: "event-cancelled",
        title: "已取消会议",
        startsAt: "2026-07-01T16:00:00+08:00",
        endsAt: null,
        location: null,
        notes: null,
        status: "cancelled",
        sourceText: "明天下午4点会议",
        createdAt: "2026-06-30T09:00:00+08:00",
        updatedAt: "2026-06-30T09:05:00+08:00"
      }
    ],
    reminders: [],
    ledgerEntries: [
      {
        id: "ledger-1",
        direction: "expense",
        amountCents: 3800,
        currency: "CNY",
        category: "餐饮",
        occurredAt: "2026-06-29T12:30:00+08:00",
        counterparty: null,
        note: "外卖",
        sourceText: "昨天点外卖花了38",
        createdAt: "2026-06-29T12:30:00+08:00",
        updatedAt: "2026-06-29T12:30:00+08:00"
      },
      {
        id: "ledger-last-month",
        direction: "expense",
        amountCents: 4200,
        currency: "CNY",
        category: "餐饮",
        occurredAt: "2026-05-18T18:45:00+08:00",
        counterparty: null,
        note: "外卖",
        sourceText: "5月18日点外卖花了42",
        createdAt: "2026-05-18T18:45:00+08:00",
        updatedAt: "2026-05-18T18:45:00+08:00"
      },
      {
        id: "ledger-2",
        direction: "income",
        amountCents: 1200000,
        currency: "CNY",
        category: "工资",
        occurredAt: "2026-06-29T09:00:00+08:00",
        counterparty: null,
        note: null,
        sourceText: "收到工资12000",
        createdAt: "2026-06-29T09:00:00+08:00",
        updatedAt: "2026-06-29T09:00:00+08:00"
      }
    ],
    messages: [],
    pendingClarification: null
  };
}

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

const now = new Date("2026-06-30T10:00:00+08:00");

test("query agent returns schedule results as a UI_POPUP block", async () => {
  const result = await runQueryAgentWorkflow(stateWithData(), "明天下午有什么安排？", {
    createId: deterministicIds(),
    now
  });

  assert.equal(result.outcome, "query_answered");
  assert.equal(result.queryResult.query_kind, "schedule");
  assert.equal(result.queryResult.query_status, "success");
  assert.equal(result.queryResult.events.length, 1);
  assert.equal(result.queryResult.events[0].title, "产品评审");
  assert.equal(result.queryResult.time_range.label, "明天下午");
  assert.equal(result.queryResult.time_range.from, "2026-07-01T12:00:00+08:00");
  assert.equal(result.queryResult.time_range.to, "2026-07-01T17:59:59+08:00");
  assert.match(result.state.messages.at(-1)?.content ?? "", /```json UI_POPUP/);

  const popup = extractUiPopupFromMessage(result.state.messages.at(-1)?.content ?? "");
  assert.equal(popup?.query_kind, "schedule");
  assert.equal(popup?.query_status, "success");
  assert.equal(popup?.events[0].startsAt, "2026-07-01T15:00:00+08:00");
});

test("query agent resolves next-week meeting questions to the next calendar week", async () => {
  const result = await runQueryAgentWorkflow(stateWithData(), "下周三的会议是几点？", {
    createId: deterministicIds(),
    now
  });

  assert.equal(result.queryResult.query_kind, "schedule");
  assert.equal(result.queryResult.query_status, "success");
  assert.equal(result.queryResult.time_range.label, "下周三");
  assert.equal(result.queryResult.events.length, 1);
  assert.equal(result.queryResult.events[0].title, "项目会议");
  assert.equal(result.queryResult.events[0].startsAt, "2026-07-08T14:00:00+08:00");

  const popup = extractUiPopupFromMessage(result.state.messages.at(-1)?.content ?? "");
  assert.equal(popup?.events[0].location, "会议室 B");
});

test("query agent summarizes ledger expenses and still uses UI_POPUP", async () => {
  const result = await runQueryAgentWorkflow(stateWithData(), "我昨天点外卖支出了多少？", {
    createId: deterministicIds(),
    now
  });

  assert.equal(result.queryResult.query_kind, "ledger");
  assert.equal(result.queryResult.query_status, "success");
  assert.equal(result.queryResult.ledger.totalExpenseCents, 3800);
  assert.equal(result.queryResult.ledger.totalIncomeCents, 0);
  assert.equal(result.queryResult.ledger.entries.length, 1);
  assert.equal(result.queryResult.ledger.entries[0].note, "外卖");

  const popup = extractUiPopupFromMessage(result.state.messages.at(-1)?.content ?? "");
  assert.equal(popup?.ledger.totalExpenseCents, 3800);
});

test("query agent summarizes last-month delivery expenses as a popup payload", async () => {
  const result = await runQueryAgentWorkflow(stateWithData(), "上个月点外卖支出了多少？", {
    createId: deterministicIds(),
    now
  });

  assert.equal(result.queryResult.query_kind, "ledger");
  assert.equal(result.queryResult.query_status, "success");
  assert.equal(result.queryResult.time_range.label, "上个月");
  assert.equal(result.queryResult.ledger.totalExpenseCents, 4200);
  assert.equal(result.queryResult.ledger.entries.length, 1);

  const popup = extractUiPopupFromMessage(result.state.messages.at(-1)?.content ?? "");
  assert.equal(popup?.query_status, "success");
  assert.equal(popup?.ledger.entries[0].note, "外卖");
});

test("query agent returns an empty popup when no records match", async () => {
  const result = await runQueryAgentWorkflow(emptyState(), "今天还有什么重要事情没做吗？", {
    createId: deterministicIds(),
    now
  });

  assert.equal(result.queryResult.query_kind, "task");
  assert.equal(result.queryResult.query_status, "empty");
  assert.equal(result.queryResult.events.length, 0);
  assert.equal(result.queryResult.ledger.entries.length, 0);

  const popup = extractUiPopupFromMessage(result.state.messages.at(-1)?.content ?? "");
  assert.equal(popup?.query_status, "empty");
});
