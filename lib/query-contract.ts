import { z } from "zod";
import { recordDateTime } from "./record-validation";
import { LEDGER_CATEGORY_NAMES } from "./ledger-categories";
const ledgerCategorySchema = z.enum(LEDGER_CATEGORY_NAMES);

export const queryPlanSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["schedule", "ledger", "task"]),
  timeRange: z.object({ label: z.string().trim().min(1).max(80), from: recordDateTime, to: recordDateTime }).strict(),
  title: z.string().trim().min(1).max(200).nullable(),
  category: z.string().trim().min(1).max(80).nullable(),
  direction: z.enum(["income", "expense"]).nullable()
}).strict().refine(p => Date.parse(p.timeRange.from) <= Date.parse(p.timeRange.to), "时间范围顺序无效")
  .refine(p => p.kind === "ledger" ? p.title === null : p.category === null && p.direction === null, "查询条件与记录类型不匹配");
export type QueryPlan = z.infer<typeof queryPlanSchema>;
export type TimeRange = QueryPlan["timeRange"];
export type QueryPlanner = (input: string, context: { now: Date }) => Promise<unknown>;
export type QuerySource = "rules" | "model" | "rules_fallback";
export type OperationResult<T> = { ok: true; value: T } | { ok: false; code: "invalid" | "conflict" | "storage_error"; message: string };

export const queryAggregationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("none") }).strict(),
  z.object({ op: z.literal("count") }).strict(),
  z.object({ op: z.literal("sum"), field: z.enum(["amountCents", "signedAmountCents"]) }).strict(),
  z.object({ op: z.literal("average"), field: z.literal("amountCents") }).strict(),
  z.object({ op: z.literal("max"), field: z.literal("amountCents") }).strict(),
  z.object({ op: z.literal("min"), field: z.literal("amountCents") }).strict()
]);
export const queryPlanV2Schema = z.object({
  version: z.literal(2),
  kind: z.enum(["schedule", "ledger", "task"]),
  timeRange: z.object({ label: z.string().trim().min(1).max(80), from: recordDateTime, to: recordDateTime }).strict(),
  filters: z.object({ title: z.string().trim().min(1).max(200).nullable(), category: ledgerCategorySchema.nullable(), direction: z.enum(["income", "expense"]).nullable() }).strict(),
  aggregation: queryAggregationSchema
}).strict()
  .refine(p => Date.parse(p.timeRange.from) <= Date.parse(p.timeRange.to), "时间范围顺序无效")
  .refine(p => p.kind === "ledger" ? p.filters.title === null : p.filters.category === null && p.filters.direction === null, "过滤条件与记录类型不匹配")
  .refine(p => p.kind !== "task" || p.filters.title === null, "任务查询不支持过滤")
  .refine(p => p.kind === "ledger" || ["none", "count"].includes(p.aggregation.op), "金额聚合只适用于流水");
export const queryDecisionV2Schema = z.discriminatedUnion("decision", [
  z.object({ version: z.literal(2), decision: z.literal("execute"), query: queryPlanV2Schema }).strict(),
  z.object({ version: z.literal(2), decision: z.literal("clarify"), question: z.string().trim().min(1).max(120), reason: z.enum(["ambiguous_reference", "missing_scope", "mixed_intent", "insufficient_information"]) }).strict(),
  z.object({ version: z.literal(2), decision: z.literal("unsupported"), reason: z.enum(["write_request", "unsupported_query", "unsupported_aggregation"]), message: z.string().trim().min(1).max(120) }).strict()
]);
export type QueryPlanV2 = z.infer<typeof queryPlanV2Schema>;
export type QueryDecisionV2 = z.infer<typeof queryDecisionV2Schema>;
export type QueryAggregation = QueryPlanV2["aggregation"];
