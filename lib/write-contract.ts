import { z } from "zod";
import { queryDecisionV2Schema } from "./query-contract";
import { LEDGER_CATEGORY_NAMES, categoryMatchesDirection } from "./ledger-categories";
const ledgerCategorySchema = z.enum(LEDGER_CATEGORY_NAMES);

const evidence = z.string().trim().min(1).max(2000);
const text = z.string().trim().min(1).max(1000);
const slot = <T extends z.ZodType>(value: T) => z.object({ value, evidence, turnId: z.string().min(1).max(100).optional() }).strict();
const recoveryResolution = z.object({ id: z.string().min(1).max(100), revision: z.number().int().positive(), mode: z.enum(["continue", "replace"]) }).strict();
export const inputRecoverySchema = z.object({
  id: z.string().min(1).max(100), revision: z.number().int().positive(),
  reason: z.enum(["provider", "invalid_decision", "invalid_value", "clarify"]),
  question: z.string().max(240), expiresAt: z.number().finite(),
  turns: z.array(z.object({ id: z.string().min(1).max(100), input: z.string().min(1).max(4000), referenceNow: z.string().datetime({ offset: true }) }).strict()).min(1).max(4)
}).strict().refine(value => value.turns.reduce((sum, turn) => sum + turn.input.length, 0) <= 12000, "Recovery context too long");
export type InputRecovery = z.infer<typeof inputRecoverySchema>;
export const dateExpressionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("absolute"), year: z.number().int().min(1).max(9999).optional(), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }).strict(),
  z.object({ type: z.literal("relative_day"), offset: z.number().int().min(-36600).max(36600) }).strict(),
  z.object({ type: z.literal("relative_month"), offset: z.number().int().min(-1200).max(1200), day: z.number().int().min(1).max(31) }).strict(),
  z.object({ type: z.literal("weekday"), weekOffset: z.number().int().min(-5200).max(5200), day: z.number().int().min(1).max(7) }).strict()
]);
const timeSchema = z.object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).strict();
const commonPatch = { date: slot(dateExpressionSchema).optional(), time: slot(timeSchema).optional() };
const eventPatch = z.object({ ...commonPatch, title: slot(text).optional(), location: slot(text.nullable()).optional(), notes: slot(text.nullable()).optional(), endDate: slot(dateExpressionSchema.nullable()).optional(), endTime: slot(timeSchema.nullable()).optional() }).strict();
const ledgerPatch = z.object({ ...commonPatch, amount: slot(text).optional(), direction: slot(z.enum(["income", "expense"])).optional(), category: slot(ledgerCategorySchema).optional(), counterparty: slot(text.nullable()).optional(), note: slot(text.nullable()).optional() }).strict();
const selectorSchema = z.object({
  reference: z.enum(["recent", "matching", "selection"]),
  title: text.optional(), category: ledgerCategorySchema.optional(), date: dateExpressionSchema.optional(),
  ordinal: z.number().int().min(1).max(100).optional()
}).strict();
const baseSchema = z.object({ id: z.string().min(1).max(100), revision: z.number().int().positive() }).strict();
const shared = {
  action: z.literal("write"), operation: z.enum(["create", "revise", "update", "cancel"]),
  base: baseSchema.optional(), target: selectorSchema.optional(),
  recovery: recoveryResolution.optional(),
  uncertain: z.array(z.enum(["title", "date", "time", "endDate", "endTime", "amount", "direction", "category", "target"])).max(9).optional()
};
export const writeDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ ...shared, kind: z.literal("event"), patch: eventPatch }).strict(),
  z.object({ ...shared, kind: z.literal("ledger"), patch: ledgerPatch }).strict()
]).superRefine((value, ctx) => {
  if (value.kind === "ledger" && value.patch.category && value.patch.direction && !categoryMatchesDirection(value.patch.category.value, value.patch.direction.value)) ctx.addIssue({ code: "custom", message: "分类与收支方向不匹配" });
  const allowed = value.kind === "event" ? ["title", "date", "time", "endDate", "endTime"] : ["date", "time", "amount", "direction", "category"];
  if (value.uncertain?.some(field => !allowed.includes(field))) ctx.addIssue({ code: "custom", message: "Uncertainty does not apply to this record kind" });
  if (value.kind === "event" ? Boolean(value.target?.category) : Boolean(value.target?.title)) ctx.addIssue({ code: "custom", message: "Target filter does not apply to this record kind" });
  if (value.operation === "revise" && !value.base) ctx.addIssue({ code: "custom", message: "Revision requires a draft version" });
  if ((value.operation === "update" || value.operation === "cancel") && !value.target) ctx.addIssue({ code: "custom", message: "Existing record requires a selector" });
  if (value.operation === "cancel" && value.kind !== "event") ctx.addIssue({ code: "custom", message: "Only events support recoverable cancellation" });
  if (value.operation === "create" && (value.base || value.target)) ctx.addIssue({ code: "custom", message: "New record cannot carry an existing target" });
});
export const inputDecisionSchema = z.union([
  writeDecisionSchema,
  z.object({ action: z.literal("query"), decision: queryDecisionV2Schema, recovery: recoveryResolution.optional() }).strict(),
  z.object({ action: z.literal("clarify"), reason: z.enum(["multiple_operations", "ambiguous_intent", "unsupported_value"]), question: z.string().trim().min(1).max(160), recovery: recoveryResolution.optional() }).strict(),
  z.object({ action: z.literal("cancel_draft") }).strict(),
  z.object({ action: z.literal("chat"), message: z.string().trim().min(1).max(240), recovery: recoveryResolution.optional() }).strict()
]);
export type WriteDecision = z.infer<typeof writeDecisionSchema>;
export type InputDecision = z.infer<typeof inputDecisionSchema>;
export type WriteFields = {
  title?: string; date?: string; time?: { hour: number; minute: number };
  endDate?: string | null; endTime?: { hour: number; minute: number } | null;
  location?: string | null; notes?: string | null;
  amountCents?: number; direction?: "income" | "expense"; category?: string;
  counterparty?: string | null; note?: string | null;
};
export type WriteDraft = {
  id: string; revision: number; kind: "event" | "ledger"; operation: "create" | "update" | "cancel";
  referenceNow: string; sourceText: string; fields: WriteFields;
  evidence: Record<string, { quote: string; input: string; referenceNow: string }>;
  uncertain: string[];
};

// Only this projection may cross the model boundary; no record arrays or target snapshots.
export const writeContextSchema = z.object({
  recovery: inputRecoverySchema.nullable().optional(),
  draft: z.object({ id: z.string().max(100), revision: z.number().int().positive(), kind: z.enum(["event", "ledger"]), operation: z.enum(["create", "update", "cancel"]),
    fields: z.object({ title: text.optional(), date: z.string().max(10).optional(), time: timeSchema.optional(), endDate: z.string().max(10).nullable().optional(), endTime: timeSchema.nullable().optional(), location: text.nullable().optional(), notes: text.nullable().optional(), amountCents: z.number().int().positive().optional(), direction: z.enum(["income", "expense"]).optional(), category: text.optional(), counterparty: text.nullable().optional(), note: text.nullable().optional() }).strict(),
    missing: z.array(z.string().max(30)).max(12)
  }).strict().nullable(),
  selection: z.object({ kind: z.enum(["event", "ledger"]), count: z.number().int().positive().max(100), originalInput: z.string().max(4000) }).strict().nullable(),
  query: z.object({ input: z.string().max(4000), question: z.string().max(160), referenceNow: z.string().max(40) }).strict().nullable()
}).strict();
export type WriteContext = z.infer<typeof writeContextSchema>;
export type ParseInputDecision = (input: string, context: { now: Date; pending: WriteContext }) => Promise<unknown>;
