import { z } from "zod";
import { recordDateTime } from "./record-validation";

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
