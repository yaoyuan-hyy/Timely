import assert from "node:assert/strict";
import test from "node:test";
import { runQueryAgentWorkflow } from "../lib/agent/query-workflow";
import { runTimelyAgentWorkflow } from "../lib/agent/app-workflow";
import { normalizeTimelyState } from "../lib/state";
import { applyWorkflowState } from "../lib/state-commit";
import { benchmarkFixture } from "../evals/query-benchmark-fixture";
const now = new Date("2026-09-06T10:00:00+08:00");
test("clarification bypasses record access, preserves data and emits no popup", async () => {
  const clean = benchmarkFixture(), before = structuredClone(clean);
  const result = await runQueryAgentWorkflow(clean, "那一笔是多少钱？", { now, parseQueryDecision: async () => ({ version: 2, decision: "clarify", reason: "ambiguous_reference", question: "你指哪笔记录？" }) });
  assert.equal(result.outcome, "query_clarification");
  assert.equal(result.queryResult, null);
  assert.deepEqual(result.toolCalls, []);
  assert.deepEqual(clean, before);
  assert.deepEqual(result.state.events, before.events);
  assert.doesNotMatch(result.state.messages.at(-1)!.content, /UI_POPUP/);
  assert.ok(result.state.pendingQueryClarification);
});
test("execute uses one query capability and deterministic average in popup", async () => {
  const result = await runQueryAgentWorkflow(benchmarkFixture(), "上个月支出平均每笔多少？", { now, parseQueryDecision: async () => ({ version: 2, decision: "execute", query: { version: 2, kind: "ledger", timeRange: { label: "上个月", from: "2026-08-01T00:00:00+08:00", to: "2026-08-31T23:59:59+08:00" }, filters: { title: null, category: null, direction: "expense" }, aggregation: { op: "average", field: "amountCents" } } }) });
  assert.equal(result.outcome, "query_answered");
  assert.equal(result.execution.aggregation.value, 3200);
  assert.deepEqual(result.toolCalls, [{ name: "queryRecords", kind: "ledger" }]);
  assert.match(result.queryResult.summary, /32\.00/);
});
test("unsupported requests never query and cannot be disguised as empty results", async () => {
  const result = await runQueryAgentWorkflow(benchmarkFixture(), "删除所有流水", { now });
  assert.equal(result.outcome, "query_unsupported");
  assert.deepEqual(result.toolCalls, []);
  assert.equal(result.execution, null);
  assert.equal(result.queryResult, null);
});
test("query clarification survives normalization/commit and short answer routes back to query", async () => {
  const base = benchmarkFixture();
  const first = await runTimelyAgentWorkflow(base, "最近花了多少钱？", { now });
  assert.equal(first.outcome, "query_clarification");
  const stored = normalizeTimelyState(JSON.stringify(applyWorkflowState(base, base, first.state)), base);
  assert.ok(stored.pendingQueryClarification);
  const reply = await runTimelyAgentWorkflow(stored, "上个月", { now });
  assert.equal(reply.agent, "query");
  assert.equal(reply.outcome, "query_answered");
  assert.match(reply.state.messages.at(-1)!.content, /64\.00/);
  assert.equal(reply.state.pendingQueryClarification, null);
  assert.deepEqual(reply.state.ledgerEntries, base.ledgerEntries);
});

test("a new explicit record request clears a pending query conversation", async () => {
  const first = await runTimelyAgentWorkflow(benchmarkFixture(), "最近花了多少钱？", { now });
  const next = await runTimelyAgentWorkflow(first.state, "记录明天下午三点会议", { now });
  assert.equal(next.agent, "write");
  assert.equal(next.state.pendingQueryClarification, null);
});

test("a monetary write starts a new record while a query clarification is pending", async () => {
  const first = await runTimelyAgentWorkflow(benchmarkFixture(), "最近花了多少钱？", { now });
  const next = await runTimelyAgentWorkflow(first.state, "花了30元", { now });
  assert.equal(next.agent, "write");
  assert.equal(next.state.pendingQueryClarification, null);
});

test("rules aggregation honors the explicit expense filter", async () => {
  const result = await runQueryAgentWorkflow(benchmarkFixture(), "上月支出均值多少？", { now });
  assert.equal(result.outcome, "query_answered");
  assert.equal(result.execution.aggregation.value, 3200);
  assert.equal(result.plan.filters.direction, "expense");
});
