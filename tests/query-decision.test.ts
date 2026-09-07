import assert from "node:assert/strict";
import test from "node:test";
import {
  queryDecisionV2Schema,
  queryPlanV2Schema,
  type QueryDecisionV2
} from "../lib/query-contract";
import { adaptQueryPlanV1 } from "../lib/query-planning";

const timeRange = {
  label: "明天",
  from: "2026-09-07T00:00:00+08:00",
  to: "2026-09-07T23:59:59+08:00"
};

test("v2 execute decision accepts filters and every aggregation operator", () => {
  for (const aggregation of [
    { op: "none" },
    { op: "count" },
    { op: "sum", field: "amountCents" },
    { op: "average", field: "amountCents" },
    { op: "max", field: "amountCents" },
    { op: "min", field: "amountCents" }
  ]) {
    const decision = {
      version: 2,
      decision: "execute",
      query: {
        version: 2,
        kind: aggregation.op === "count" ? "schedule" : "ledger",
        timeRange,
        filters: { title: null, category: null, direction: null },
        aggregation
      }
    };
    assert.equal(queryDecisionV2Schema.safeParse(decision).success, true);
  }
});

test("v2 schema rejects incompatible aggregation, extra fields and invalid time", () => {
  const valid = {
    version: 2,
    kind: "ledger",
    timeRange,
    filters: { title: null, category: null, direction: null },
    aggregation: { op: "sum", field: "amountCents" }
  };
  assert.equal(queryPlanV2Schema.safeParse({ ...valid, kind: "schedule" }).success, false);
  assert.equal(queryPlanV2Schema.safeParse({ ...valid, filters: { ...valid.filters, title: "会议" } }).success, false);
  assert.equal(queryPlanV2Schema.safeParse({ ...valid, extra: true }).success, false);
  assert.equal(queryPlanV2Schema.safeParse({ ...valid, timeRange: { ...timeRange, to: "2026-09-06T00:00:00+08:00" } }).success, false);
});

test("clarify and unsupported are valid decisions and v1 plans adapt to execute", () => {
  const clarify: QueryDecisionV2 = {
    version: 2,
    decision: "clarify",
    question: "你想查哪段时间？",
    reason: "missing_scope"
  };
  assert.equal(queryDecisionV2Schema.safeParse(clarify).success, true);
  assert.equal(queryDecisionV2Schema.safeParse({ version: 2, decision: "unsupported", reason: "write_request", message: "请使用记录流程。" }).success, true);
  const adapted = adaptQueryPlanV1({
    version: 1,
    kind: "schedule",
    timeRange,
    title: "会议",
    category: null,
    direction: null
  });
  assert.equal(adapted.decision, "execute");
  assert.equal(adapted.query.version, 2);
  assert.equal(adapted.query.filters.title, "会议");
});
