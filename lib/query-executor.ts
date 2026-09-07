import { queryPlanV2Schema } from "./query-contract";
import type { QueryPlanV2, QueryAggregation } from "./query-contract";
import type { RecordSnapshot } from "./repository/record-repository";

export type QueryExecutionResult = {
  version: 2;
  status: "success" | "empty";
  plan: QueryPlanV2;
  records: RecordSnapshot;
  matchedCount: number;
  aggregation: QueryAggregation & { value: number | null; sumCents: number | null; sampleCount: number };
  totals: { expenseCents: number; incomeCents: number; netCents: number };
};

// Operates on records already retrieved by the single query capability. No IO or writes.
export function aggregateQueryRecords(input: QueryPlanV2, snapshot: RecordSnapshot): QueryExecutionResult {
  const plan = queryPlanV2Schema.parse(input);
  const records = structuredClone(snapshot);
  const matchedCount = records.events.length + records.ledgerEntries.length;
  const totals = { expenseCents: 0, incomeCents: 0, netCents: 0 };
  let sum = 0, minimum: number | null = null, maximum: number | null = null;
  for (const entry of records.ledgerEntries) {
    if (!Number.isSafeInteger(entry.amountCents) || entry.amountCents < 0) throw new Error("invalid_amount");
    totals[entry.direction === "expense" ? "expenseCents" : "incomeCents"] += entry.amountCents;
    sum += entry.amountCents;
    if (!Number.isSafeInteger(sum)) throw new Error("amount_overflow");
    minimum = minimum === null ? entry.amountCents : Math.min(minimum, entry.amountCents);
    maximum = maximum === null ? entry.amountCents : Math.max(maximum, entry.amountCents);
  }
  totals.netCents = totals.incomeCents - totals.expenseCents;
  const operation = plan.aggregation;
  let value: number | null = null;
  if (operation.op === "count") value = matchedCount;
  if (operation.op === "sum") value = operation.field === "signedAmountCents" ? totals.netCents : sum;
  if (operation.op === "average" && records.ledgerEntries.length) value = Math.round(sum / records.ledgerEntries.length);
  if (operation.op === "max") value = maximum;
  if (operation.op === "min") value = minimum;
  return {
    version: 2, status: matchedCount ? "success" : "empty", plan, records, matchedCount, totals,
    aggregation: { ...operation, value, sumCents: operation.op !== "none" && operation.op !== "count" ? sum : null, sampleCount: matchedCount }
  };
}
