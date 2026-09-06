import type { PendingConfirmation, TimelyState } from "./types";
import { applyWorkflowState } from "./state-commit";
import { createLocalId } from "./local-id";
import { formatShanghaiDate, formatShanghaiTime, toShanghaiIso } from "./time";
import { eventSchema, ledgerSchema } from "./record-validation";
import { commitConfirmedRecord } from "./tools/record-tools";

export function describeRecord(draft: Pick<PendingConfirmation, "kind" | "record">) {
  const record = draft.record;
  if ("startsAt" in record) return `${formatShanghaiDate(record.startsAt)} ${formatShanghaiTime(record.startsAt)}，${record.title}${record.location ? `，${record.location}` : ""}`;
  return `${formatShanghaiDate(record.occurredAt)}，${record.direction === "income" ? "收入" : "支出"} ${(record.amountCents / 100).toFixed(2)} 元，${record.category}`;
}

export function appendRecordReply(current: TimelyState, content: string): TimelyState {
  return { ...current, messages: [...current.messages, { id: createLocalId("message"), role: "assistant", content, createdAt: toShanghaiIso(new Date()) }] };
}

export function stageRecordResult(current: TimelyState, base: TimelyState, next: TimelyState, input: string): TimelyState {
  const event = next.events.find(e => e.status === "active" && JSON.stringify(e) !== JSON.stringify(base.events.find(old => old.id === e.id)));
  const entry = next.ledgerEntries.find(e => JSON.stringify(e) !== JSON.stringify(base.ledgerEntries.find(old => old.id === e.id)));
  const merged = applyWorkflowState(current, base, next);
  const withEdit = { ...merged, pendingEdit: next.pendingEdit ?? null };
  if (!event && !entry) return withEdit;
  const fields = event
    ? { kind: "event" as const, record: eventSchema.parse(event), before: base.events.find(e => e.id === event.id) }
    : { kind: "ledger" as const, record: ledgerSchema.parse(entry), before: base.ledgerEntries.find(e => e.id === entry!.id) };
  const pending: PendingConfirmation = { ...fields, id: createLocalId("draft"), input, summary: describeRecord(fields), clarification: base.pendingClarification };
  const messages = withEdit.messages.map(m => m.id === next.messages.at(-1)?.id && m.role === "assistant" ? { ...m, content: "请确认这条记录。" } : m);
  return { ...withEdit, events: current.events, ledgerEntries: current.ledgerEntries, messages, pendingClarification: null, pendingEdit: null, pendingConfirmation: pending };
}

export function confirmRecordDraft(current: TimelyState): TimelyState {
  const draft = current.pendingConfirmation;
  if (!draft) return current;
  const clean = { ...current, pendingConfirmation: null };
  const result = commitConfirmedRecord(current);
  if (!result.ok) return appendRecordReply(clean, result.message);
  return appendRecordReply({ ...clean, ...result.value }, `${draft.before ? "已修改" : "已记录"}。${draft.summary}。`);
}

export function discardRecordDraft(current: TimelyState): TimelyState {
  return appendRecordReply({ ...current, pendingConfirmation: null }, "已取消这次记录。");
}
