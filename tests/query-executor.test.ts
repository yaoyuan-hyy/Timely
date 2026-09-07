import assert from "node:assert/strict";
import test from "node:test";
import { aggregateQueryRecords } from "../lib/query-executor";
import { queryPlanV2Schema } from "../lib/query-contract";
import { createRecordRepository } from "../lib/repository/record-repository";
import { createQueryTools } from "../lib/tools/record-tools";
import { benchmarkFixture } from "../evals/query-benchmark-fixture";

const base = { version: 2, kind: "ledger", timeRange: { label: "上个月", from: "2026-08-01T00:00:00+08:00", to: "2026-08-31T23:59:59+08:00" }, filters: { title: null, category: null, direction: "expense" } };
test("executor computes requested operators over filtered records without mutating them", () => {
  const state = benchmarkFixture(), before = structuredClone(state);
  for (const [op, expected] of [["none", null], ["count", 2], ["sum", 6400], ["average", 3200], ["max", 3800], ["min", 2600]] as const) {
    const plan = queryPlanV2Schema.parse({ ...base, aggregation: ["none", "count"].includes(op) ? { op } : { op, field: "amountCents" } });
    const found = createQueryTools(createRecordRepository(state)).queryRecords(plan);
    assert.equal(found.ok, true);
    const result = aggregateQueryRecords(plan, found.value);
    assert.equal(result.aggregation.value, expected);
    assert.deepEqual(result.records.ledgerEntries.map(e => e.id), ["transport", "expense"]);
    assert.equal(result.status, "success");
  }
  assert.deepEqual(state, before);
});
test("empty aggregates distinguish zero totals from undefined average and extrema", () => {
  for (const op of ["sum", "average", "max", "min", "count"] as const) {
    const plan = queryPlanV2Schema.parse({ ...base, aggregation: op === "count" ? { op } : { op, field: "amountCents" } });
    const result = aggregateQueryRecords(plan, { events: [], ledgerEntries: [] });
    assert.equal(result.status, "empty");
    assert.equal(result.aggregation.value, op === "sum" || op === "count" ? 0 : null);
  }
});

test("listing and counting carry no monetary aggregation numerator", () => {
  for (const op of ["none", "count"]) {
    const plan = queryPlanV2Schema.parse({ ...base, aggregation: { op } });
    const result = aggregateQueryRecords(plan, createRecordRepository(benchmarkFixture()).query(plan));
    assert.equal(result.aggregation.sumCents, null);
    assert.equal(result.totals.expenseCents, 6400);
  }
});
test("net uses signed cents; average rounds half up with numerator and denominator evidence", () => {
  const state = benchmarkFixture();
  const plan = queryPlanV2Schema.parse({ ...base, filters: { ...base.filters, direction: null }, aggregation: { op: "sum", field: "signedAmountCents" } });
  const records = createRecordRepository(state).query(plan);
  assert.equal(aggregateQueryRecords(plan, records).aggregation.value, 94100);
  const average = queryPlanV2Schema.parse({ ...base, aggregation: { op: "average", field: "amountCents" } });
  records.ledgerEntries = records.ledgerEntries.slice(0, 2).map((e, i) => ({ ...e, amountCents: i + 1 }));
  const result = aggregateQueryRecords(average, records);
  assert.equal(result.aggregation.value, 2);
  assert.equal(result.aggregation.sumCents, 3);
  assert.equal(result.aggregation.sampleCount, 2);
});
