import { resolveEventRecordInput, resolveEventRecordInputWithAi } from "./event-recording";
import type { AiEventParseResult } from "./event-recording";
import {
  isLikelyLedgerRecord,
  resolveLedgerRecordInput,
  resolveLedgerRecordInputWithAi
} from "./ledger-recording";
import type { AiLedgerClarificationParseResult, AiLedgerParseResult } from "./ledger-recording";
import { createLocalId } from "./local-id";
import { toShanghaiIso } from "./time";
import type { ConversationMessage, PendingClarification, TimelyState } from "./types";

type ResolveOptions = {
  now?: Date;
  createId?: (prefix: string) => string;
  pendingClarificationTtlMs?: number;
};

export type AiRecordParseResult = AiEventParseResult | AiLedgerParseResult | AiLedgerClarificationParseResult;

export const PENDING_CLARIFICATION_TTL_MS = 5 * 60 * 1000;

export function resolveRecordInput(current: TimelyState, input: string, options: ResolveOptions = {}) {
  const prepared = preparePendingClarification(current, input, options);
  if (prepared.handled) {
    return prepared.state;
  }

  if (isLedgerPending(prepared.state.pendingClarification)) {
    if (shouldInterruptPendingLocally(input)) {
      return resolveFreshRecordInput({ ...prepared.state, pendingClarification: null }, input, options);
    }

    return resolveLedgerRecordInput(prepared.state, input, options);
  }

  return resolveFreshRecordInput(prepared.state, input, options);
}

export function resolveRecordInputWithAi(
  current: TimelyState,
  input: string,
  result: AiRecordParseResult,
  options: ResolveOptions = {}
) {
  const prepared = preparePendingClarification(current, input, options);
  if (prepared.handled) {
    return prepared.state;
  }

  if (isLedgerPending(prepared.state.pendingClarification)) {
    if (shouldInterruptPendingWithAi(input, result)) {
      return resolveFreshRecordInputWithAi({ ...prepared.state, pendingClarification: null }, input, result, options);
    }

    return resolveLedgerRecordInput(prepared.state, input, options);
  }

  return resolveFreshRecordInputWithAi(prepared.state, input, result, options);
}

function resolveFreshRecordInput(current: TimelyState, input: string, options: ResolveOptions) {
  if (isLikelyLedgerRecord(input)) {
    return resolveLedgerRecordInput(current, input, options);
  }

  return resolveEventRecordInput(current, input, options);
}

function resolveFreshRecordInputWithAi(
  current: TimelyState,
  input: string,
  result: AiRecordParseResult,
  options: ResolveOptions
) {
  if (result.intent === "create_ledger") {
    return resolveLedgerRecordInputWithAi(current, input, result, options);
  }

  if (isLedgerClarificationResult(result)) {
    return resolveLedgerRecordInput(current, input, options);
  }

  return resolveEventRecordInputWithAi(current, input, result, options);
}

function isLedgerClarificationResult(result: AiRecordParseResult): result is AiLedgerClarificationParseResult {
  return (
    result.intent === "needs_clarification" &&
    (result.clarificationQuestion === "金额是多少？" || result.clarificationQuestion === "这是收入还是支出？")
  );
}

function preparePendingClarification(
  current: TimelyState,
  input: string,
  options: ResolveOptions
): { state: TimelyState; handled: boolean } {
  const pending = current.pendingClarification;

  if (!pending) {
    return { state: current, handled: false };
  }

  const state = isPendingExpired(pending, options) ? { ...current, pendingClarification: null } : current;

  if (!state.pendingClarification) {
    return { state, handled: false };
  }

  if (isCancelPendingInput(input)) {
    return { state: appendPendingCancelReply(state, input, options), handled: true };
  }

  return { state, handled: false };
}

function isPendingExpired(pending: PendingClarification, options: ResolveOptions) {
  const nowMs = options.now?.getTime() ?? Date.now();
  return nowMs - pendingCreatedAtMs(pending) > pendingTtlMs(options);
}

function pendingCreatedAtMs(pending: PendingClarification) {
  const createdAt = pending.createdAt as unknown;

  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return createdAt;
  }

  if (typeof createdAt === "string" && createdAt) {
    const parsed = Date.parse(createdAt);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function pendingTtlMs(options: ResolveOptions) {
  return typeof options.pendingClarificationTtlMs === "number" && Number.isFinite(options.pendingClarificationTtlMs)
    ? Math.max(0, options.pendingClarificationTtlMs)
    : PENDING_CLARIFICATION_TTL_MS;
}

function appendPendingCancelReply(current: TimelyState, input: string, options: ResolveOptions) {
  const now = options.now ?? new Date();
  const createId = options.createId ?? createLocalId;
  const createdAt = toShanghaiIso(now);
  const rawText = input.trim();
  const userMessage = createMessage("user", rawText, createdAt, createId);

  return {
    ...current,
    pendingClarification: null,
    messages: [...current.messages, userMessage, createMessage("assistant", "好的一声，已取消当前记录。", createdAt, createId)]
  };
}

function shouldInterruptPendingWithAi(input: string, result: AiRecordParseResult) {
  if (isShortPendingAnswer(input)) {
    return false;
  }

  return result.intent === "create_event" || result.intent === "delete_event" || isLikelyEventInterruptInput(input);
}

function shouldInterruptPendingLocally(input: string) {
  return !isShortPendingAnswer(input) && isLikelyEventInterruptInput(input);
}

function isLedgerPending(pending: PendingClarification | null): pending is Extract<
  PendingClarification,
  { kind: "ledger_amount" | "ledger_direction" }
> {
  return pending?.kind === "ledger_amount" || pending?.kind === "ledger_direction";
}

function isCancelPendingInput(input: string) {
  return /^(算了|取消|不要了|不记了|不用了|先不记了|别记了)$/.test(normalizeText(input));
}

function isShortPendingAnswer(input: string) {
  const text = normalizeText(input);

  return (
    text.length <= 12 &&
    (/^(?:¥|￥)?\d+(?:\.\d{1,2})?(?:元|块钱|块|人民币)?$/.test(text) ||
      /^(收入|支出|进账|入账|出账|花销)$/.test(text))
  );
}

function isLikelyEventInterruptInput(input: string) {
  const text = normalizeText(input);

  if (!text || isLikelyLedgerContinuation(text)) {
    return false;
  }

  const hasStrongEventCue = /(会议|开会|日程|提醒|复盘|评审|健身|面试)/.test(text);
  const hasDateTimeCue = /(今天|明天|后天|大后天|周|星期|礼拜|上午|中午|下午|晚上|今晚|\d{1,2}月|\d{1,2}[日号点:：]|约|安排)/.test(
    text
  );

  return hasStrongEventCue || (text.length >= 6 && hasDateTimeCue);
}

function isLikelyLedgerContinuation(text: string) {
  return /花了?|消费|支付|付了?|付款|买|收入|收到|工资|薪水|报销|退款|转入|进账|入账|奖金|赚|支出/.test(text);
}

function createMessage(
  role: "user" | "assistant",
  content: string,
  createdAt: string,
  createId: (prefix: string) => string
): ConversationMessage {
  return {
    id: createId("message"),
    role,
    content,
    createdAt
  };
}

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, "");
}
