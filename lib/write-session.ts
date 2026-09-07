import type { CalendarEvent, LedgerEntry, PendingConfirmation, TimelyState } from "./types";
import type { InputDecision, ParseInputDecision, WriteContext, WriteDecision, WriteDraft } from "./write-contract";
import { inputDecisionSchema } from "./write-contract";
import { applyWritePatch, missingWriteFields, writeFieldQuestion } from "./write-draft";
import { parseMoneyText, resolveCalendarDate } from "./write-values";
import { createLocalId } from "./local-id";
import { getShanghaiParts, toShanghaiDayKey, toShanghaiIso } from "./time";
import { eventSchema, ledgerSchema } from "./record-validation";
import { describeRecord } from "./record-draft";
import { createRecordRepository } from "./repository/record-repository";
import { applyWorkflowState } from "./state-commit";
import { runQueryAgentWorkflow } from "./agent/query-workflow";
import { activeInputRecovery, retainInputRecovery, recoveryDecisionIssue } from "./input-recovery";
import type { InputRecovery } from "./write-contract";

type Candidate = { kind: "event"; record: CalendarEvent } | { kind: "ledger"; record: LedgerEntry };
export type WriteSession = {
  draft: WriteDraft | null;
  before?: CalendarEvent | LedgerEntry;
  selection?: { candidates: Candidate[]; decision: WriteDecision; input: string; now: string };
  recovery?: InputRecovery;
};
type Result = { state: TimelyState; source: "model" | "local" | "command" | "failed"; failure: "provider" | "invalid_decision" | "invalid_value" | null };
type Options = { now?: Date; parse?: ParseInputDecision };

export function inputSessionContext(state: TimelyState, now = new Date()): WriteContext {
  const session = state.writeSession;
  const draft = session?.draft;
  const query = state.pendingQueryClarification;
  return {
    recovery: structuredClone(activeInputRecovery(session?.recovery, now) ?? null),
    draft: draft ? { id: draft.id, revision: draft.revision, kind: draft.kind, operation: draft.operation, fields: structuredClone(draft.fields), missing: missingWriteFields(draft) } : null,
    selection: session?.selection ? { kind: session.selection.decision.kind, count: session.selection.candidates.length, originalInput: session.selection.input } : null,
    query: query ? { input: query.input, question: query.question, referenceNow: query.referenceNow } : null
  };
}

export async function runInputSession(current: TimelyState, input: string, options: Options = {}): Promise<Result> {
  const now = options.now ?? new Date();
  const iso = toShanghaiIso(now);
  if (!input.trim() || input.length > 4000) return { state: appendTurn(current, input.slice(0, 4000), "请将输入控制在 1 到 4000 个字符，已有草稿未改动。", iso), source: "failed", failure: "invalid_value" };
  const recovery = activeInputRecovery(current.writeSession?.recovery, now);
  if (current.writeSession?.recovery && !recovery) {
    const { recovery: expired, ...session } = current.writeSession;
    current = { ...current, writeSession: session.draft || session.selection ? session : null };
  }
  const answer = (state: TimelyState, text: string) => appendTurn(state, input, text, iso);
  const unresolved = (reason: InputRecovery["reason"], question: string): TimelyState => {
    const context = retainInputRecovery(current.writeSession?.recovery, input, now, reason, question);
    return answer({ ...current, writeSession: { ...(current.writeSession ?? { draft: null }), recovery: context } }, context.question);
  };
  let decision: InputDecision;
  let source: Result["source"] = "model";
  try {
    // Session controls are commands, not model-generated authorization.
    if (/^(算了|取消|不要了|不记了|取消这次记录)[。！!]?$/u.test(input.trim()) && current.writeSession) {
      decision = { action: "cancel_draft" }; source = "command";
    } else {
      if (!options.parse) throw Error("provider_unavailable");
      const value = await options.parse(input, { now, pending: inputSessionContext(current, now) });
      const parsed = inputDecisionSchema.safeParse(value);
      if (!parsed.success) return { state: unresolved("invalid_decision", "这次识别未完成，已保留原话。你可以补充说明或重试。"), source: "failed", failure: "invalid_decision" };
      decision = parsed.data;
    }
  } catch (error) {
    if (error instanceof Error && (error.message === "invalid_decision" || error.name === "ZodError" || error.name === "SyntaxError")) return { state: unresolved("invalid_decision", "这次识别未完成，已保留原话。你可以补充说明或重试。"), source: "failed", failure: "invalid_decision" };
    const fallback = recovery ? null : offlineSupplement(current, input);
    if (!fallback) return { state: unresolved("provider", "AI 暂时不可用，原话已保留，记录未写入。可以重试或继续补充。"), source: "failed", failure: "provider" };
    decision = fallback; source = "local";
  }
  if (decision.action === "cancel_draft") return { state: answer({ ...current, writeSession: null, pendingConfirmation: null, pendingClarification: null, pendingEdit: null }, "已取消这次记录。"), source, failure: null };
  if (recovery && (!decision.recovery || decision.recovery.id !== recovery.id || decision.recovery.revision !== recovery.revision)) {
    return { state: unresolved("invalid_decision", "还没确认这句话与上一条的关系，请说明是补充上一条还是开始新的记录。"), source: "failed", failure: "invalid_decision" };
  }
  if (!recovery && decision.recovery) return { state: unresolved("invalid_decision", "之前的上下文已结束，请完整说明这次要记录的内容。"), source: "failed", failure: "invalid_decision" };
  if (recoveryDecisionIssue(decision, inputSessionContext(current, now), input)) return { state: unresolved("invalid_decision", "上一条还有内容未处理，请完整说明要保留或修改的内容。"), source: "failed", failure: "invalid_decision" };
  const sources = decision.recovery?.mode === "continue" ? recovery?.turns ?? [] : [];
  if (decision.recovery?.mode === "replace" && current.writeSession) {
    const { recovery: abandoned, ...session } = current.writeSession;
    current = { ...current, writeSession: session.draft || session.selection ? session : null };
  }
  if (decision.action === "clarify") return { state: unresolved("clarify", decision.question), source, failure: null };
  if (decision.action === "chat") {
    // Small talk does not acknowledge a pending correction or authorize its old proposal.
    return { state: answer(current, decision.message), source, failure: null };
  }
  if (decision.action === "query") {
    // The decision is already parsed. The injected planner returns it without another LLM call.
    const result = await runQueryAgentWorkflow(current, input, { now, parseQueryDecision: async () => decision.decision });
    if (result.state.writeSession && !result.state.writeSession.draft && !result.state.writeSession.selection) result.state = { ...result.state, writeSession: null };
    return { state: result.state, source, failure: null };
  }

  let session: WriteSession = current.writeSession ?? { draft: null };
  let write = decision;
  if (recovery && decision.recovery?.mode === "continue" && (write.operation === "create" || write.operation === "revise")) {
    // Recovery revision acknowledges the session; the application owns the draft identity.
    const { base: modelBase, ...fields } = write;
    write = session.draft ? { ...fields, operation: "revise", base: { id: session.draft.id, revision: session.draft.revision } } : { ...fields, operation: "create" };
  }
  let patchInput = input;
  let patchNow = iso;
  let previous = session.draft;
  let selectionCorrection: WriteDecision | null = null;
  if (write.operation === "update" || write.operation === "cancel") {
    if (session.draft && !session.selection) return { state: answer(current, "还有一条未完成记录，请先确认或取消；修改当前草稿请直接说明。"), source, failure: null };
    let matches: Candidate[];
    if (write.target?.reference === "selection") {
      const selection = session.selection;
      const candidate = selection?.candidates[(write.target.ordinal ?? 0) - 1];
      if (!candidate || !selection || write.kind !== selection.decision.kind) return { state: answer(current, "请选择刚才列出的记录编号。"), source, failure: null };
      selectionCorrection = write;
      matches = [candidate]; write = selection.decision; patchInput = selection.input; patchNow = selection.now;
    } else {
      matches = resolveTargets(current, write, iso);
    }
    if (!matches.length) return { state: answer(current, "没有找到对应记录，请说明事项或日期。"), source, failure: null };
    if (matches.length > 1) return {
      state: answer({ ...current, writeSession: { ...session, selection: { candidates: matches, decision: write, input, now: iso } }, pendingConfirmation: null }, `要修改哪一条？${matches.map((item, index) => `${index + 1}. ${describeRecord(item)}`).join("；")}`), source, failure: null
    };
    const candidate = matches[0];
    previous = draftFromRecord(candidate, iso);
    previous.operation = write.operation === "cancel" ? "cancel" : "update";
    session = { draft: previous, before: structuredClone(candidate.record) };
    write = { ...write, operation: "revise", base: { id: previous.id, revision: previous.revision } };
  } else if (write.operation === "create") {
    // A new intent must not silently destroy a draft that the user has not settled.
    if (session.draft || session.selection) return { state: answer(current, "还有一条未完成记录，请先确认或取消；修改它可以直接说明。"), source, failure: null };
    session = { draft: null }; previous = null;
  }
  const merged = applyWritePatch(previous, write, patchInput, patchNow, createLocalId("write-draft"), sources);
  if (!merged.ok) return { state: unresolved("invalid_value", merged.message), source: "failed", failure: "invalid_value" };
  let draft = merged.draft;
  if (selectionCorrection && (Object.keys(selectionCorrection.patch).length || selectionCorrection.uncertain?.length)) {
    const corrected = applyWritePatch(draft, { ...selectionCorrection, operation: "revise", base: { id: draft.id, revision: draft.revision } }, input, iso, draft.id, sources);
    if (!corrected.ok) return { state: unresolved("invalid_value", corrected.message), source: "failed", failure: "invalid_value" };
    draft = corrected.draft;
  }
  if (sources.length) draft.sourceText = [previous?.sourceText, ...sources.map(turn => turn.input), input].filter(Boolean).join("\n").slice(-8000);
  const nextSession: WriteSession = { draft, ...(session.before ? { before: session.before } : {}) };
  const clean = { ...current, writeSession: nextSession, pendingConfirmation: null, pendingClarification: null, pendingEdit: null, pendingQueryClarification: null };
  const missing = missingWriteFields(draft);
  if (missing.length) return { state: answer(clean, writeFieldQuestion(missing)), source, failure: null };
  const proposal = draftToProposal(draft, session.before, iso);
  if (!proposal) return { state: answer({ ...clean, writeSession: { ...nextSession, draft: { ...draft, uncertain: ["endTime"] } } }, "结束时间需要晚于开始时间，请重新说明。"), source, failure: null };
  return { state: answer({ ...clean, pendingConfirmation: proposal }, draft.operation === "cancel" ? "请确认取消这条日程。" : "请确认这条记录。"), source, failure: null };
}

function offlineSupplement(current: TimelyState, input: string): WriteDecision | null {
  const draft = current.writeSession?.draft;
  if (!draft || draft.kind !== "ledger" || missingWriteFields(draft).join() !== "amount" || parseMoneyText(input.trim()) === null) return null;
  return { action: "write", operation: "revise", kind: "ledger", base: { id: draft.id, revision: draft.revision }, patch: { amount: { value: input.trim(), evidence: input.trim() } } };
}
function appendTurn(state: TimelyState, input: string, reply: string, now: string): TimelyState {
  return { ...state, messages: [...state.messages,
    { id: createLocalId("message"), role: "user", content: input, createdAt: now },
    { id: createLocalId("message"), role: "assistant", content: reply, createdAt: now }
  ] };
}

export function stageInputSession(current: TimelyState, base: TimelyState, next: TimelyState): TimelyState {
  const unchanged = JSON.stringify(current.writeSession ?? null) === JSON.stringify(base.writeSession ?? null) && JSON.stringify(current.pendingConfirmation ?? null) === JSON.stringify(base.pendingConfirmation ?? null);
  if (!unchanged) return current;
  const merged = applyWorkflowState(current, base, next);
  return { ...merged, events: current.events, ledgerEntries: current.ledgerEntries, reminders: current.reminders, writeSession: next.writeSession, pendingConfirmation: next.pendingConfirmation, pendingEdit: next.pendingEdit };
}

function draftToProposal(draft: WriteDraft, before: CalendarEvent | LedgerEntry | undefined, now: string): PendingConfirmation | null {
  const f = draft.fields;
  const at = (date: string, time: { hour: number; minute: number }) => `${date}T${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:00+08:00`;
  const common = { id: before?.id ?? createLocalId("record"), sourceText: draft.sourceText, createdAt: before?.createdAt ?? now, updatedAt: now };
  if (draft.kind === "event") {
    const startsAt = at(f.date!, f.time!);
    let endsAt = f.endTime ? at(f.endDate ?? f.date!, f.endTime) : null;
    // Existing duration survives a start-time correction unless an end field was explicitly patched.
    if (before && "startsAt" in before && before.endsAt && !draft.evidence.endDate && !draft.evidence.endTime) {
      endsAt = toShanghaiIso(new Date(Date.parse(startsAt) + Date.parse(before.endsAt) - Date.parse(before.startsAt)));
    }
    const parsed = eventSchema.safeParse({ ...common, title: f.title, startsAt, endsAt, location: f.location ?? null, notes: f.notes ?? null, status: draft.operation === "cancel" ? "cancelled" : "active" });
    if (!parsed.success) return null;
    const fields = { kind: "event" as const, record: parsed.data, ...(before && "startsAt" in before ? { before } : {}) };
    return { ...fields, id: draft.id, input: draft.sourceText, summary: describeRecord(fields) };
  }
  const parsed = ledgerSchema.safeParse({ ...common, direction: f.direction, amountCents: f.amountCents, currency: "CNY", category: f.category ?? "未分类", occurredAt: at(f.date!, f.time!), counterparty: f.counterparty ?? null, note: f.note ?? null });
  if (!parsed.success) return null;
  const fields = { kind: "ledger" as const, record: parsed.data, ...(before && "amountCents" in before ? { before } : {}) };
  return { ...fields, id: draft.id, input: draft.sourceText, summary: describeRecord(fields) };
}
function draftFromRecord(candidate: Candidate, now: string): WriteDraft {
  const record = candidate.record;
  const date = "startsAt" in record ? record.startsAt : record.occurredAt;
  const p = getShanghaiParts(new Date(date));
  const fields: WriteDraft["fields"] = { date: toShanghaiDayKey(new Date(date)), time: { hour: p.hour, minute: p.minute } };
  if ("startsAt" in record) {
    Object.assign(fields, { title: record.title, location: record.location, notes: record.notes });
    if (record.endsAt) { const end = getShanghaiParts(new Date(record.endsAt)); Object.assign(fields, { endDate: toShanghaiDayKey(new Date(record.endsAt)), endTime: { hour: end.hour, minute: end.minute } }); }
  } else Object.assign(fields, { amountCents: record.amountCents, direction: record.direction, category: record.category, counterparty: record.counterparty, note: record.note });
  return { id: createLocalId("write-draft"), revision: 1, kind: candidate.kind, operation: "update", referenceNow: now, sourceText: record.sourceText, fields, evidence: {}, uncertain: [] };
}
function resolveTargets(current: TimelyState, decision: WriteDecision, now: string): Candidate[] {
  const target = decision.target;
  if (!target || target.reference === "selection") return [];
  if (target.reference === "matching" && !target.title && !target.category && !target.date) return [];
  const date = target.date ? resolveCalendarDate(target.date, now) : null;
  if (target.date && !date) return [];
  const records = createRecordRepository(current).query({ version: 2, kind: decision.kind === "event" ? "schedule" : "ledger", timeRange: { label: "选择记录", from: `${date ?? "0100-01-01"}T00:00:00+08:00`, to: `${date ?? "9999-12-31"}T23:59:59.999+08:00` }, filters: { title: decision.kind === "event" ? target.title ?? null : null, category: decision.kind === "ledger" ? target.category ?? null : null, direction: null }, aggregation: { op: "none" } });
  let candidates: Candidate[] = [...records.events.map(record => ({ kind: "event" as const, record })), ...records.ledgerEntries.map(record => ({ kind: "ledger" as const, record }))];
  if (target.reference === "recent" && candidates.length) {
    const latest = Math.max(...candidates.map(item => Date.parse(item.record.createdAt)));
    candidates = candidates.filter(item => Date.parse(item.record.createdAt) === latest);
  }
  return candidates.slice(0, 100);
}
