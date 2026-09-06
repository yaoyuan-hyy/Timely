import { z } from "zod";
import { queryPlanSchema } from "./query-contract";
export const benchmarkSchema = z.object({ version: z.literal(1), cases: z.array(z.object({
  id: z.string(), split: z.enum(["dev", "test"]), tags: z.array(z.enum(["time", "filter", "aggregation", "tool_selection", "empty", "ambiguous", "multi_condition"])).min(1),
  input: z.string(), now: z.string().datetime({ offset: true }),
  expected: z.object({ decision: z.enum(["answer", "clarify"]), plan: queryPlanSchema.nullable(), eventIds: z.array(z.string()), ledgerIds: z.array(z.string()), aggregates: z.record(z.string(), z.number()), status: z.enum(["success", "empty"]).nullable(), tools: z.array(z.object({ name: z.literal("queryRecords"), kind: z.enum(["schedule", "ledger", "task"]) })) }).strict()
}).strict()).min(1) }).strict();
export type BenchmarkCase = z.infer<typeof benchmarkSchema>["cases"][number];
export type Observation = { decision: "answer" | "clarify" | "error"; plan: unknown; eventIds: string[]; ledgerIds: string[]; aggregates: Record<string, number>; status: string | null; tools: unknown[]; source: string; unchanged: boolean; latencyMs: number };
export function gradeQuery(example: BenchmarkCase, actual: Observation) {
  const expected = example.expected, gold = expected.plan;
  const parsed = queryPlanSchema.safeParse(actual.plan);
  const plan = parsed.success ? parsed.data : null;
  const ids = (events: string[], ledger: string[]) => [...events.map(id => `event:${id}`), ...ledger.map(id => `ledger:${id}`)];
  const expectedIds = ids(expected.eventIds, expected.ledgerIds), actualIds = ids(actual.eventIds, actual.ledgerIds);
  const relevant = actualIds.filter((id, index) => expectedIds.includes(id) && actualIds.indexOf(id) === index).length;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const checks: Record<string, boolean | null> = {
    decision: actual.decision === expected.decision,
    time: !gold ? null : Boolean(plan && Date.parse(plan.timeRange.from) === Date.parse(gold.timeRange.from) && Date.parse(plan.timeRange.to) === Date.parse(gold.timeRange.to)),
    filter: !gold ? null : Boolean(plan && same([plan.kind, plan.title, plan.category, plan.direction], [gold.kind, gold.title, gold.category, gold.direction])),
    aggregation: Object.keys(expected.aggregates).length ? Object.entries(expected.aggregates).every(([key, value]) => actual.aggregates[key] === value) : null,
    tool_selection: same(actual.tools, expected.tools),
    records: same(actualIds, expectedIds),
    status: actual.status === expected.status,
    read_only: actual.unchanged,
    no_fallback: actual.source !== "rules_fallback"
  };
  const effectivePassed = actual.decision !== "error" && Object.entries(checks).every(([key, value]) => key === "no_fallback" || value !== false);
  return { passed: effectivePassed && checks.no_fallback === true, effectivePassed, checks, precision: actualIds.length ? relevant / actualIds.length : expectedIds.length ? 0 : 1, recall: expectedIds.length ? relevant / expectedIds.length : actualIds.length ? 0 : 1 };
}
export function wilsonInterval(passed: number, total: number): [number, number] {
  if (!total) return [0, 1];
  const z = 1.96, p = passed / total, denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}
