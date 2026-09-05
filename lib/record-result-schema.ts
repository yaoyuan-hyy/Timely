import { z } from "zod";
import { isValidShanghaiDateParts } from "./time";

const dateTime = z.string().refine(value => {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}(?:\.\d+)?(?:\+08:00|Z)$/);
  return Boolean(parts && isValidShanghaiDateParts(Number(parts[1]), Number(parts[2]), Number(parts[3])) && Number(parts[4]) < 24 && Number(parts[5]) < 60 && Number.isFinite(Date.parse(value)));
}, "Invalid record datetime").nullable();
const text = z.string().nullable();
const ledgerFields = {
  direction: z.enum(["expense", "income"]).nullable(),
  amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  currency: z.literal("CNY").nullable(),
  category: text,
  occurredAt: dateTime,
  counterparty: text,
  note: text
};

// Both HTTP boundaries use the same runtime contract as the domain union.
export const recordResultSchema = z.union([
  z.object({
    intent: z.enum(["create_event", "delete_event", "needs_clarification", "unsupported"]),
    title: text, startsAt: dateTime, endsAt: dateTime, location: text, notes: text,
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    clarificationQuestion: z.enum(["什么时候？", "记录什么？"]).nullable()
  }),
  z.object({ intent: z.literal("create_ledger"), ...ledgerFields, clarificationQuestion: z.enum(["金额是多少？", "这是收入还是支出？"]).nullable() }),
  z.object({ intent: z.literal("needs_clarification"), ...ledgerFields, clarificationQuestion: z.enum(["金额是多少？", "这是收入还是支出？"]) })
]);
