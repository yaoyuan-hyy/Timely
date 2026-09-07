import { z } from "zod";
import { queryPlanV2Schema } from "./query-contract";
import type { QueryExecutionResult } from "./query-executor";

const expectedExecutionSchema = z.object({
  status: z.enum(["success", "empty"]), matchedCount: z.number().int().nonnegative(),
  eventIds: z.array(z.string()), ledgerIds: z.array(z.string()),
  aggregation: z.object({ op: z.enum(["none", "count", "sum", "average", "max", "min"]), field: z.string().optional(), value: z.number().nullable(), sumCents: z.number().nullable(), sampleCount: z.number().int().nonnegative() }).strict(),
  totals: z.object({ expenseCents: z.number(), incomeCents: z.number(), netCents: z.number() }).strict()
}).strict();
export const benchmarkV2Schema = z.object({ version: z.literal(2), cases: z.array(z.object({
  id: z.string(), split: z.enum(["dev", "test"]), tags: z.array(z.string()).min(1), input: z.string(), now: z.string().datetime({ offset: true }),
  expected: z.object({ decision: z.enum(["execute", "clarify", "unsupported"]), plan: queryPlanV2Schema.nullable(), execution: expectedExecutionSchema.nullable(), tools: z.array(z.object({ name: z.literal("queryRecords"), kind: z.enum(["schedule", "ledger", "task"]) })) }).strict()
}).strict()).min(1) }).strict();
export type BenchmarkCaseV2 = z.infer<typeof benchmarkV2Schema>["cases"][number];
export type ExecutionEvidence = z.infer<typeof expectedExecutionSchema>;
export type ObservationV2 = { decision: string; plan: unknown; execution: ExecutionEvidence | null; tools: unknown[]; source: string; fallbackReason: string | null; unchanged: boolean; latencyMs: number; noExecution: boolean };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function executionProjection(execution: ObservationV2["execution"]) {
  if (!execution) return null;
  const a = execution.aggregation, t = execution.totals;
  return { status: execution.status, matchedCount: execution.matchedCount, eventIds: execution.eventIds, ledgerIds: execution.ledgerIds,
    aggregation: a && { op: a.op, ...(a.field === undefined ? {} : { field: a.field }), value: a.value, sumCents: a.sumCents, sampleCount: a.sampleCount },
    totals: t && { expenseCents: t.expenseCents, incomeCents: t.incomeCents, netCents: t.netCents } };
}
export function executionEvidence(result: QueryExecutionResult): ExecutionEvidence {
  return { status: result.status, matchedCount: result.matchedCount, eventIds: result.records.events.map(e => e.id), ledgerIds: result.records.ledgerEntries.map(e => e.id), aggregation: result.aggregation, totals: result.totals };
}
export function executionMatches(actual: ExecutionEvidence | null, expected: ExecutionEvidence | null) {
  return same(executionProjection(actual), executionProjection(expected));
}
export function gradeQueryV2(example: BenchmarkCaseV2, actual: ObservationV2) {
  const expected = example.expected;
  const parsedPlan = queryPlanV2Schema.safeParse(actual.plan);
  const plan = parsedPlan.success ? parsedPlan.data : null;
  const decision = actual.decision === expected.decision;
  const planCorrect = expected.decision !== "execute" ? null : Boolean(plan && expected.plan && Date.parse(plan.timeRange.from) === Date.parse(expected.plan.timeRange.from) && Date.parse(plan.timeRange.to) === Date.parse(expected.plan.timeRange.to) && plan.kind === expected.plan.kind && same([plan.filters.title, plan.filters.category, plan.filters.direction], [expected.plan.filters.title, expected.plan.filters.category, expected.plan.filters.direction]) && same(plan.aggregation, expected.plan.aggregation));
  const executionCorrect = expected.decision !== "execute" ? null : executionMatches(actual.execution, expected.execution);
  const toolsCorrect = same(actual.tools, expected.tools);
  const readOnly = actual.unchanged;
  const checks = { decision, plan: planCorrect, execution: executionCorrect, no_execution: expected.decision === "execute" ? true : actual.noExecution && actual.plan === null && actual.execution === null, tool_selection: toolsCorrect, read_only: readOnly };
  const applicable = Object.values(checks).filter((value): value is boolean => value !== null);
  const effectivePassed = applicable.every(Boolean) && actual.decision !== "error";
  return { passed: effectivePassed && actual.source !== "rules_fallback", effectivePassed, checks };
}
export function wilsonIntervalV2(passed: number, total: number): [number, number] {
  if (!total) return [0, 1];
  const z = 1.96, p = passed / total, d = 1 + z * z / total;
  const c = (p + z * z / (2 * total)) / d;
  const m = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}
