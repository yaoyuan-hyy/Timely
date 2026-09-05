import { z } from "zod";
import { isValidShanghaiDateParts } from "./time";

export const recordDateTime = z.string().refine(value => {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  return Boolean(parts && isValidShanghaiDateParts(+parts[1], +parts[2], +parts[3]) && +parts[4] < 24 && +parts[5] < 60 && +parts[6] < 60 && Number.isFinite(Date.parse(value)));
}, "日期或时间无效");
const common = { id: z.string().min(1), sourceText: z.string(), createdAt: recordDateTime, updatedAt: recordDateTime };
export const eventSchema = z.object({ ...common, title: z.string().trim().min(1), startsAt: recordDateTime, endsAt: recordDateTime.nullable(), location: z.string().nullable(), notes: z.string().nullable(), status: z.enum(["active", "cancelled"]) }).refine(e => !e.endsAt || Date.parse(e.endsAt) > Date.parse(e.startsAt), "结束时间需要晚于开始时间");
export const ledgerSchema = z.object({ ...common, direction: z.enum(["income", "expense"]), amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), currency: z.literal("CNY"), category: z.string().trim().min(1), occurredAt: recordDateTime, note: z.string().nullable(), counterparty: z.string().nullable() });
