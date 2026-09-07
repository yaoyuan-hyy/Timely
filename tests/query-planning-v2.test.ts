import assert from "node:assert/strict";
import test from "node:test";
import { buildQueryDecisionV2, planQueryV2 } from "../lib/query-planning";
import { parseDeepSeekQueryDecision } from "../server/ai/deepseek-query-planner";

const now = new Date("2026-09-06T12:00:00+08:00");

test("specific aggregation operators take precedence over generic amount wording", () => {
  for (const [input, op] of [["上个月支出平均多少钱？", "average"], ["上个月最大一笔支出多少钱？", "max"], ["上个月最小一笔支出多少钱？", "min"], ["上个月总共有几笔支出？", "count"]]) {
    const result = buildQueryDecisionV2(input, now);
    assert.equal(result.decision, "execute");
    if (result.decision === "execute") assert.equal(result.query.aggregation.op, op);
  }
});

test("v2 clarifies unbounded recent queries", () => {
  const result = buildQueryDecisionV2("最近花了多少钱", now);
  assert.equal(result.decision, "clarify");
  if (result.decision === "clarify") assert.equal(result.reason, "missing_scope");
});

test("v2 treats mixed read and write as clarification", () => {
  const result = buildQueryDecisionV2("查一下明天的会议并记录晚饭", now);
  assert.equal(result.decision, "clarify");
  if (result.decision === "clarify") assert.equal(result.reason, "mixed_intent");
});

test("v2 rejects pure writes", () => {
  const result = buildQueryDecisionV2("记录明天三点会议", now);
  assert.equal(result.decision, "unsupported");
  if (result.decision === "unsupported") assert.equal(result.reason, "write_request");
});

test("v2 supports net sum and whole next week", () => {
  const result = buildQueryDecisionV2("下周总共收支多少", now);
  assert.equal(result.decision, "execute");
  if (result.decision === "execute") {
    assert.deepEqual(result.query.aggregation, { op: "sum", field: "signedAmountCents" });
    assert.equal(result.query.timeRange.from, "2026-09-07T00:00:00+08:00");
    assert.equal(result.query.timeRange.to, "2026-09-13T23:59:59+08:00");
  }
});

test("v2 keeps noun-only ledger and weekday queries readable", () => {
  assert.equal(buildQueryDecisionV2("上个月的餐饮流水", now).decision, "execute");
  const weekday = buildQueryDecisionV2("下周三的会议是几点？", now);
  assert.equal(weekday.decision, "execute");
  if (weekday.decision === "execute") assert.equal(weekday.query.timeRange.label, "下周三");
});

test("v2 treats delete-only noun requests as writes", () => {
  const result = buildQueryDecisionV2("删除所有流水", now);
  assert.equal(result.decision, "unsupported");
  if (result.decision === "unsupported") assert.equal(result.reason, "write_request");
});

test("v2 uses unsigned amounts for ordinary expense totals", () => {
  const result = buildQueryDecisionV2("普通支出了多少", now);
  assert.equal(result.decision, "execute");
  if (result.decision === "execute") assert.deepEqual(result.query.aggregation, { op: "sum", field: "amountCents" });
});

test("v2 resolves composed clarification with the supplement", () => {
  const result = buildQueryDecisionV2("原问题：最近花了多少钱\n追问：你想查哪段时间？\n用户补充：上个月", now);
  assert.equal(result.decision, "execute");
  if (result.decision === "execute") {
    assert.equal(result.query.timeRange.label, "上个月");
    assert.deepEqual(result.query.aggregation, { op: "sum", field: "amountCents" });
    assert.equal(result.query.filters.direction, "expense");
  }
});

test("v2 keeps asking when a vague-scope follow-up is still vague", () => {
  const result = buildQueryDecisionV2("原问题：最近花了多少钱\n追问：你想查哪段时间？\n用户补充：随便", now);
  assert.equal(result.decision, "clarify");
  if (result.decision === "clarify") assert.equal(result.reason, "missing_scope");
});

test("v2 does not turn an invalid explicit date into today", () => {
  const result = buildQueryDecisionV2("查6月31日的会议", now);
  assert.equal(result.decision, "clarify");
  if (result.decision === "clarify") assert.equal(result.reason, "insufficient_information");
});

test("model malformed payload falls back and model clarify is preserved", async () => {
  const malformed = await planQueryV2("明天有什么安排", now, async () => ({ version: 2, decision: "execute" }));
  assert.equal(malformed.source, "rules_fallback");
  const clarify = await planQueryV2("那个会议", now, async () => ({ version: 2, decision: "clarify", question: "哪一个？", reason: "ambiguous_reference" }));
  assert.equal(clarify.source, "model");
  assert.equal(clarify.decision.decision, "clarify");
});

test("deepseek parser sends only input and now and rejects extra model fields", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test";
  let body = "";
  globalThis.fetch = async (_input, init) => {
    body = String(init?.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ version: 2, decision: "execute", query: { version: 2, kind: "schedule", timeRange: { label: "今天", from: "2026-09-06T00:00:00+08:00", to: "2026-09-06T23:59:59+08:00" }, filters: { title: null, category: null, direction: null }, aggregation: { op: "none" }, extra: "private" } }) } }] }), { status: 200 });
  };
  try {
    await assert.rejects(() => parseDeepSeekQueryDecision("今天有什么", { now }), /Unrecognized key/);
    assert.equal(JSON.parse(body).messages[1].content.includes("events"), false);
  } finally {
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
    globalThis.fetch = oldFetch;
  }
});

test("deepseek parser accepts a valid clarification decision", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test";
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ version: 2, decision: "clarify", question: "你想查哪段时间？", reason: "missing_scope" }) } }] }), { status: 200 });
  try {
    const result = await parseDeepSeekQueryDecision("最近的流水", { now }) as { decision: string };
    assert.equal(result.decision, "clarify");
  } finally {
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
    globalThis.fetch = oldFetch;
  }
});
