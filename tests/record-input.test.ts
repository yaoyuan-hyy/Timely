import * as assert from "node:assert/strict";
import { resolveRecordInput, resolveRecordInputWithAi } from "../lib/record-input";
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

{
  const state = resolveRecordInput(emptyState(), "今天午饭花了38", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.events.length, 0);
  assert.equal(state.ledgerEntries.length, 1);
  assert.equal(state.ledgerEntries[0].direction, "expense");
  assert.equal(state.ledgerEntries[0].amountCents, 3800);
  assert.equal(state.messages.at(-1)?.content, "已记录。支出 38.00 元，餐饮。");
}

{
  const state = resolveRecordInput(emptyState(), "帮我记录一下6月20日下午4点开会", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.ledgerEntries.length, 0);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "开会");
  assert.equal(state.events[0].startsAt, "2026-06-20T16:00:00+08:00");
}

{
  const state = resolveRecordInput(emptyState(), "下个月六号我要去广州，六点的飞机", {
    createId: deterministicIds(),
    now: new Date("2026-06-16T02:37:00+08:00")
  });

  assert.equal(state.ledgerEntries.length, 0);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "去广州");
  assert.equal(state.events[0].startsAt, "2026-07-06T06:00:00+08:00");
}

{
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
  const state = resolveRecordInputWithAi(emptyState(), "午饭花了38", aiResult, {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.events.length, 0);
  assert.equal(state.ledgerEntries.length, 1);
  assert.equal(state.ledgerEntries[0].occurredAt, "2026-06-15T12:10:00+08:00");
  assert.equal(state.messages.at(-1)?.content, "已记录。支出 38.00 元，餐饮。");
}

{
  const aiResult = {
    intent: "needs_clarification",
    direction: "expense",
    amountCents: null,
    currency: "CNY",
    category: "交通",
    occurredAt: null,
    counterparty: null,
    note: null,
    clarificationQuestion: "金额是多少？"
  } as unknown as AiRecordParseResult;
  const state = resolveRecordInputWithAi(emptyState(), "机票花了我", aiResult, {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.events.length, 0);
  assert.equal(state.ledgerEntries.length, 0);
  assert.equal(state.pendingClarification?.kind, "ledger_amount");
  assert.equal(state.messages.at(-1)?.content, "金额是多少？");
}

{
  const createId = deterministicIds();
  const pendingState = resolveRecordInput(emptyState(), "上个月7号买了个抽湿机", {
    createId,
    now
  });
  const aiResult: AiRecordParseResult = {
    intent: "unsupported",
    title: null,
    startsAt: null,
    endsAt: null,
    location: null,
    notes: null,
    clarificationQuestion: null
  };
  const state = resolveRecordInputWithAi(pendingState, "506", aiResult, {
    createId,
    now: new Date("2026-06-15T12:11:00+08:00")
  });

  assert.equal(state.events.length, 0);
  assert.equal(state.pendingClarification, null);
  assert.equal(state.ledgerEntries.length, 1);
  assert.equal(state.ledgerEntries[0].amountCents, 50600);
  assert.equal(state.ledgerEntries[0].category, "购物");
  assert.equal(state.ledgerEntries[0].occurredAt, "2026-05-07T12:10:00+08:00");
  assert.equal(state.ledgerEntries[0].note, "抽湿机");
  assert.equal(state.messages.at(-1)?.content, "已记录。支出 506.00 元，购物。");
}

{
  const createId = deterministicIds();
  const pendingState = resolveRecordInput(emptyState(), "上个月7号买了个抽湿机", {
    createId,
    now
  });
  const state = resolveRecordInput(pendingState, "算了", {
    createId,
    now: new Date("2026-06-15T12:11:00+08:00")
  });

  assert.equal(state.events.length, 0);
  assert.equal(state.ledgerEntries.length, 0);
  assert.equal(state.pendingClarification, null);
  assert.equal(state.messages.at(-1)?.content, "好的一声，已取消当前记录。");
}

{
  const createId = deterministicIds();
  const pendingState = resolveRecordInput(emptyState(), "上个月7号买了个抽湿机", {
    createId,
    now
  });
  const aiResult: AiRecordParseResult = {
    intent: "create_event",
    title: "开会",
    startsAt: "2026-06-16T10:00:00+08:00",
    endsAt: null,
    location: null,
    notes: null,
    clarificationQuestion: null
  };
  const state = resolveRecordInputWithAi(pendingState, "明天上午10点开会", aiResult, {
    createId,
    now: new Date("2026-06-15T12:11:00+08:00")
  });

  assert.equal(state.ledgerEntries.length, 0);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "开会");
  assert.equal(state.events[0].startsAt, "2026-06-16T10:00:00+08:00");
  assert.equal(state.pendingClarification, null);
  assert.equal(state.messages.at(-1)?.content, "已记录。6月16日 10:00，开会。");
}

{
  const createId = deterministicIds();
  const pendingState = resolveRecordInput(emptyState(), "上个月7号买了个抽湿机", {
    createId,
    now
  });
  const state = resolveRecordInput(pendingState, "明天开会", {
    createId,
    now: new Date("2026-06-15T12:11:00+08:00")
  });

  assert.equal(state.ledgerEntries.length, 0);
  assert.equal(state.pendingClarification?.kind, "event_time");
  if (state.pendingClarification?.kind !== "event_time") {
    throw new Error("Expected event time clarification after local intent escape");
  }
  assert.equal(state.pendingClarification.title, "开会");
  assert.equal(state.messages.at(-1)?.content, "什么时候？");
}

{
  const createId = deterministicIds();
  const pendingState = resolveRecordInput(emptyState(), "上个月7号买了个抽湿机", {
    createId,
    now
  });
  const state = resolveRecordInput(pendingState, "506", {
    createId,
    now: new Date("2026-06-15T12:15:01+08:00")
  });

  assert.equal(state.events.length, 0);
  assert.equal(state.ledgerEntries.length, 0);
  assert.equal(state.pendingClarification, null);
  assert.equal(state.messages.at(-1)?.content, "我可以帮你记录事件。");
}
