import { z } from "zod";
import { runQueryAgentWorkflow } from "./agent/query-workflow";
import type { QueryPlanner } from "./query-contract";
import type { TimelyState } from "./types";
import { recordDateTime } from "./record-validation";
export const queryCasesSchema = z.array(z.object({
  id: z.string().min(1), input: z.string().min(1), kind: z.enum(["schedule", "ledger", "task"]), from: recordDateTime, to: recordDateTime,
  title: z.string().nullable(), category: z.string().nullable(), direction: z.enum(["income", "expense"]).nullable(),
  eventIds: z.array(z.string()), ledgerIds: z.array(z.string()), expense: z.number().int().nonnegative(), income: z.number().int().nonnegative()
}).strict()).min(1);
export async function evaluateQueries(examples: z.infer<typeof queryCasesSchema>, state: TimelyState, now: Date, planner?: QueryPlanner) {
  const rows = [];
  for (const example of examples) {
    const result = await runQueryAgentWorkflow(state, example.input, { now, parseQueryPlan: planner });
    const plan = result.plan, payload = result.queryResult;
    const actualPlan = [plan.kind, Date.parse(plan.timeRange.from), Date.parse(plan.timeRange.to), plan.title, plan.category, plan.direction];
    const expectedPlan = [example.kind, Date.parse(example.from), Date.parse(example.to), example.title, example.category, example.direction];
    const effectiveResultCorrect = JSON.stringify([payload.events.map(e => e.id), payload.ledger.entries.map(e => e.id), payload.ledger.totalExpenseCents, payload.ledger.totalIncomeCents]) === JSON.stringify([example.eventIds, example.ledgerIds, example.expense, example.income]);
    const didFallback = result.source === "rules_fallback";
    rows.push({ id: example.id, source: result.source, fallbackReason: result.fallbackReason, planCorrect: !didFallback && JSON.stringify(actualPlan) === JSON.stringify(expectedPlan), resultCorrect: !didFallback && effectiveResultCorrect, effectiveResultCorrect });
  }
  return { total: rows.length, planCorrect: rows.filter(r => r.planCorrect).length, resultCorrect: rows.filter(r => r.resultCorrect).length, fallbacks: rows.filter(r => r.source === "rules_fallback").length, rows };
}
