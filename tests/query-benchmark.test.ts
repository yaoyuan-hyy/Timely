import assert from "node:assert/strict";
import test from "node:test";
import { gradeQuery, wilsonInterval } from "../lib/query-benchmark";
import type { BenchmarkCase, Observation } from "../lib/query-benchmark";
const example: BenchmarkCase = { id: "test", split: "test", tags: ["time"], input: "明天", now: "2026-09-06T10:00:00+08:00", expected: { decision: "answer", plan: { version: 1, kind: "schedule", timeRange: { label: "明天", from: "2026-09-07T00:00:00+08:00", to: "2026-09-07T23:59:59+08:00" }, title: null, category: null, direction: null }, eventIds: ["a"], ledgerIds: [], aggregates: { count: 1 }, status: "success", tools: [{ name: "queryRecords", kind: "schedule" }] } };
const correct = (): Observation => ({ decision: "answer", plan: structuredClone(example.expected.plan), eventIds: ["a"], ledgerIds: [], aggregates: { count: 1 }, status: "success", tools: example.expected.tools, source: "model", unchanged: true, latencyMs: 10 });
test("benchmark requires the plan and execution to be correct; identical IDs cannot hide a wrong time range", () => {
  assert.equal(gradeQuery(example, correct()).passed, true);
  const wrong = correct();
  wrong.plan = { ...example.expected.plan, timeRange: { ...example.expected.plan!.timeRange, from: "2026-09-06T00:00:00+08:00" } };
  assert.equal(gradeQuery(example, wrong).passed, false);
  assert.equal(gradeQuery(example, wrong).checks.time, false);
});
test("fallback earns system credit but no model credit; ambiguous answers must not execute tools", () => {
  const fallback = gradeQuery(example, { ...correct(), source: "rules_fallback" });
  assert.equal(fallback.passed, false);
  assert.equal(fallback.effectivePassed, true);
  const ambiguous: BenchmarkCase = { ...example, expected: { ...example.expected, decision: "clarify", plan: null, tools: [], eventIds: [], aggregates: {}, status: null } };
  assert.equal(gradeQuery(ambiguous, correct()).passed, false);
  assert.equal(gradeQuery(ambiguous, { ...correct(), decision: "clarify", plan: null, tools: [], eventIds: [], aggregates: {}, status: null }).passed, true);
});
test("wrong aggregation, tools, mutation and duplicate IDs cannot pass", () => {
  for (const mutation of [{ aggregates: { count: 2 } }, { tools: [] }, { unchanged: false }, { eventIds: ["a", "a"] }]) assert.equal(gradeQuery(example, { ...correct(), ...mutation }).passed, false);
  const range = wilsonInterval(6, 6);
  assert.ok(range[0] > 0.60 && range[0] < 0.62);
  assert.ok(range[1] >= 0.999);
});
