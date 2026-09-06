import { buildQueryPlan } from "./query-baseline";
import { queryPlanSchema } from "./query-contract";
import type { QueryPlan, QueryPlanner, QuerySource } from "./query-contract";
export async function planQuery(input: string, now: Date, planner?: QueryPlanner): Promise<{ plan: QueryPlan; source: QuerySource; fallbackReason: string | null }> {
  const baseline = () => queryPlanSchema.parse(buildQueryPlan(input, now));
  if (!planner) return { plan: baseline(), source: "rules", fallbackReason: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([planner(input, { now }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("planner_timeout")), 15000); })]);
    const parsed = queryPlanSchema.safeParse(value);
    if (!parsed.success) return { plan: baseline(), source: "rules_fallback", fallbackReason: "invalid_plan" };
    return { plan: parsed.data, source: "model", fallbackReason: null };
  } catch { return { plan: baseline(), source: "rules_fallback", fallbackReason: "planner_failed" }; }
  finally { if (timer) clearTimeout(timer); }
}
