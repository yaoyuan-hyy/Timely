import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { benchmarkV2Schema, gradeQueryV2 } from "../lib/query-benchmark-v2";

const dataset = benchmarkV2Schema.parse(JSON.parse(readFileSync("evals/query-benchmark-v2.json", "utf8")));
const execute = dataset.cases.find(c => c.id === "time-today")!;
const actual = () => ({ decision: "execute", plan: structuredClone(execute.expected.plan), execution: structuredClone(execute.expected.execution), tools: execute.expected.tools, source: "model", fallbackReason: null, unchanged: true, latencyMs: 1, noExecution: false });

test("v2 migration preserves original inputs, split, tags, ordered IDs and decisions", () => {
  const v1 = JSON.parse(readFileSync("evals/query-benchmark-v1.json", "utf8")) as { cases: Array<{ id: string; input: string; now: string; split: string; tags: string[]; expected: { decision: string; eventIds: string[]; ledgerIds: string[] } }> };
  for (const old of v1.cases) {
    const next = dataset.cases.find(c => c.id === old.id)!;
    assert.deepEqual([next.input, next.now, next.split, next.tags], [old.input, old.now, old.split, old.tags]);
    assert.equal(next.expected.decision, old.expected.decision === "answer" ? "execute" : old.expected.decision);
    assert.deepEqual(next.expected.execution?.eventIds ?? [], old.expected.eventIds);
    assert.deepEqual(next.expected.execution?.ledgerIds ?? [], old.expected.ledgerIds);
  }
});

test("v2 dataset preserves the 28 v1 scenarios and scorer separates layers", () => {
  assert.equal(dataset.cases.length, 28);
  assert.equal(new Set(dataset.cases.map(c => c.id)).size, 28);
  assert.equal(gradeQueryV2(execute, actual()).passed, true);
  const wrongDecision = { ...actual(), decision: "clarify" };
  assert.equal(gradeQueryV2(execute, wrongDecision).checks.decision, false);
  const wrongPlan = { ...actual(), plan: { ...actual().plan!, timeRange: { ...actual().plan!.timeRange, from: "2026-09-05T00:00:00+08:00" } } };
  assert.equal(gradeQueryV2(execute, wrongPlan).checks.plan, false);
  const wrongExecution = { ...actual(), execution: { ...actual().execution!, matchedCount: 99 } };
  assert.equal(gradeQueryV2(execute, wrongExecution).checks.execution, false);
});

test("clarification and unsupported require null plan/execution and zero tool calls", () => {
  for (const id of ["ambiguous-recent", "tool-mixed-write"]) {
    const example = dataset.cases.find(c => c.id === id)!;
    assert.equal(gradeQueryV2(example, { decision: example.expected.decision, plan: null, execution: null, tools: [], source: "model", fallbackReason: null, unchanged: true, latencyMs: 1, noExecution: true }).passed, true);
    assert.equal(gradeQueryV2(example, { decision: example.expected.decision, plan: null, execution: null, tools: [{ name: "queryRecords", kind: "ledger" }], source: "model", fallbackReason: null, unchanged: true, latencyMs: 1, noExecution: false }).passed, false);
  }
});

test("fallback is effective credit only and mutation never passes", () => {
  assert.equal(gradeQueryV2(execute, { ...actual(), source: "rules_fallback" }).effectivePassed, true);
  assert.equal(gradeQueryV2(execute, { ...actual(), unchanged: false }).passed, false);
});
