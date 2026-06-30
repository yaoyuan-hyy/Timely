import * as assert from "node:assert/strict";
import { resolveLedgerRecordInput, resolveLedgerRecordInputWithAi } from "../lib/ledger-recording";
import type { AiLedgerParseResult } from "../lib/ledger-recording";
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

{
  const state = resolveLedgerRecordInput(emptyState(), "今天午饭花了38", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.ledgerEntries.length, 1);
  assert.equal(state.ledgerEntries[0].id, "ledger-2");
  assert.equal(state.ledgerEntries[0].direction, "expense");
  assert.equal(state.ledgerEntries[0].amountCents, 3800);
  assert.equal(state.ledgerEntries[0].currency, "CNY");
  assert.equal(state.ledgerEntries[0].category, "餐饮");
  assert.equal(state.ledgerEntries[0].occurredAt, "2026-06-15T12:10:00+08:00");
  assert.equal(state.ledgerEntries[0].sourceText, "今天午饭花了38");
  assert.equal(state.messages.at(-1)?.content, "已记录。支出 38.00 元，餐饮。");
}

{
  const state = resolveLedgerRecordInput(emptyState(), "昨天打车26.5", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.ledgerEntries.length, 1);
  assert.equal(state.ledgerEntries[0].direction, "expense");
  assert.equal(state.ledgerEntries[0].amountCents, 2650);
  assert.equal(state.ledgerEntries[0].category, "交通");
  assert.equal(state.ledgerEntries[0].occurredAt, "2026-06-14T12:10:00+08:00");
  assert.equal(state.messages.at(-1)?.content, "已记录。支出 26.50 元，交通。");
}

{
  const state = resolveLedgerRecordInput(emptyState(), "收到工资12000", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.ledgerEntries.length, 1);
  assert.equal(state.ledgerEntries[0].direction, "income");
  assert.equal(state.ledgerEntries[0].amountCents, 1200000);
  assert.equal(state.ledgerEntries[0].category, "工资");
  assert.equal(state.ledgerEntries[0].occurredAt, "2026-06-15T12:10:00+08:00");
  assert.equal(state.messages.at(-1)?.content, "已记录。收入 12000.00 元，工资。");
}

{
  const state = resolveLedgerRecordInput(emptyState(), "今天午饭", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.ledgerEntries.length, 0);
  assert.deepEqual(state.pendingClarification, {
    kind: "ledger_amount",
    direction: "expense",
    category: "餐饮",
    occurredAt: "2026-06-15T12:10:00+08:00",
    counterparty: null,
    note: null,
    sourceText: "今天午饭",
    createdAt: now.getTime()
  });
  assert.equal(state.messages.at(-1)?.content, "金额是多少？");
}

{
  const state = resolveLedgerRecordInput(emptyState(), "上个月7号买了个抽湿机", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.ledgerEntries.length, 0);
  assert.deepEqual(state.pendingClarification, {
    kind: "ledger_amount",
    direction: "expense",
    category: "购物",
    occurredAt: "2026-05-07T12:10:00+08:00",
    counterparty: null,
    note: "抽湿机",
    sourceText: "上个月7号买了个抽湿机",
    createdAt: now.getTime()
  });
  assert.equal(state.messages.at(-1)?.content, "请问抽湿机花了多少钱？");
}

{
  const createId = deterministicIds();
  const pendingState = resolveLedgerRecordInput(emptyState(), "上个月7号买了个抽湿机", {
    createId,
    now
  });
  const state = resolveLedgerRecordInput(pendingState, "506", {
    createId,
    now: new Date("2026-06-15T16:32:00+08:00")
  });

  assert.equal(state.pendingClarification, null);
  assert.equal(state.ledgerEntries.length, 1);
  assert.equal(state.ledgerEntries[0].direction, "expense");
  assert.equal(state.ledgerEntries[0].amountCents, 50600);
  assert.equal(state.ledgerEntries[0].category, "购物");
  assert.equal(state.ledgerEntries[0].occurredAt, "2026-05-07T12:10:00+08:00");
  assert.equal(state.ledgerEntries[0].note, "抽湿机");
  assert.equal(state.ledgerEntries[0].sourceText, "上个月7号买了个抽湿机 506");
  assert.equal(state.messages.at(-1)?.content, "已记录。支出 506.00 元，购物。");
}

{
  const state = resolveLedgerRecordInput(emptyState(), "6月7号买抽湿机花了280", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.ledgerEntries.length, 1);
  assert.equal(state.ledgerEntries[0].amountCents, 28000);
  assert.equal(state.ledgerEntries[0].category, "购物");
  assert.equal(state.ledgerEntries[0].occurredAt, "2026-06-07T12:10:00+08:00");
  assert.equal(state.ledgerEntries[0].note, "抽湿机");
  assert.equal(state.messages.at(-1)?.content, "已记录。支出 280.00 元，购物。");
}

{
  const state = resolveLedgerRecordInput(emptyState(), "6月7号晚上8点买了2个抽湿机", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.ledgerEntries.length, 0);
  assert.equal(state.pendingClarification?.kind, "ledger_amount");
  assert.equal(state.messages.at(-1)?.content, "请问抽湿机花了多少钱？");
}

{
  const state = resolveLedgerRecordInput(emptyState(), "6月7号晚上8点买了2个抽湿机花了280", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.pendingClarification, null);
  assert.equal(state.ledgerEntries.length, 1);
  assert.equal(state.ledgerEntries[0].amountCents, 28000);
  assert.equal(state.ledgerEntries[0].note, "抽湿机");
}

{
  const aiResult: AiLedgerParseResult = {
    intent: "create_ledger",
    direction: "expense",
    amountCents: 700,
    currency: "CNY",
    category: "购物",
    occurredAt: "2026-05-07T12:10:00+08:00",
    counterparty: null,
    note: "抽湿机",
    clarificationQuestion: null
  };
  const state = resolveLedgerRecordInputWithAi(emptyState(), "上个月7号买了个抽湿机", aiResult, {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.ledgerEntries.length, 0);
  assert.equal(state.pendingClarification?.kind, "ledger_amount");
  assert.equal(state.messages.at(-1)?.content, "请问抽湿机花了多少钱？");
}

{
  const state = resolveLedgerRecordInput(emptyState(), "记一笔38", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.ledgerEntries.length, 0);
  assert.deepEqual(state.pendingClarification, {
    kind: "ledger_direction",
    amountCents: 3800,
    category: "未分类",
    occurredAt: "2026-06-15T12:10:00+08:00",
    counterparty: null,
    note: null,
    sourceText: "记一笔38",
    createdAt: now.getTime()
  });
  assert.equal(state.messages.at(-1)?.content, "这是收入还是支出？");
}
