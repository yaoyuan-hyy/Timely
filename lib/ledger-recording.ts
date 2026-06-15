import type { ConversationMessage, LedgerDirection, LedgerEntry, TimelyState } from "./types";
import { createLocalId } from "./local-id";
import { buildShanghaiIso, getShanghaiParts, isValidShanghaiDateParts, toShanghaiIso } from "./time";

type ResolveOptions = {
  now?: Date;
  createId?: (prefix: string) => string;
};

type LedgerDraft = {
  direction: LedgerDirection | null;
  amountCents: number | null;
  category: string;
  occurredAt: string;
  counterparty: string | null;
  note: string | null;
};

export type AiLedgerParseResult = {
  intent: "create_ledger";
  direction: LedgerDirection | null;
  amountCents: number | null;
  currency: "CNY" | null;
  category: string | null;
  occurredAt: string | null;
  counterparty: string | null;
  note: string | null;
  clarificationQuestion: "金额是多少？" | "这是收入还是支出？" | null;
};

export function resolveLedgerRecordInput(
  current: TimelyState,
  input: string,
  options: ResolveOptions = {}
): TimelyState {
  const now = options.now ?? new Date();
  const createId = options.createId ?? createLocalId;
  const createdAt = toShanghaiIso(now);
  const createdAtMs = now.getTime();
  const rawText = input.trim();
  const normalizedText = normalizeText(rawText);

  if (!normalizedText) {
    return current;
  }

  const userMessage = createMessage("user", rawText, createdAt, createId);

  if (current.pendingClarification?.kind === "ledger_amount") {
    return resolvePendingAmount(current, userMessage, rawText, normalizedText, createdAt, createdAtMs, createId);
  }

  if (current.pendingClarification?.kind === "ledger_direction") {
    return resolvePendingDirection(current, userMessage, rawText, normalizedText, createdAt, createId);
  }

  const draft = parseLedgerDraft(normalizedText, now);

  if (draft.amountCents === null) {
    return {
      ...current,
      pendingClarification: {
        kind: "ledger_amount",
        direction: draft.direction,
        category: draft.category,
        occurredAt: draft.occurredAt,
        counterparty: draft.counterparty,
        note: draft.note,
        sourceText: rawText,
        createdAt: createdAtMs
      },
      messages: [
        ...current.messages,
        userMessage,
        createMessage("assistant", buildLedgerAmountQuestion(draft), createdAt, createId)
      ]
    };
  }

  if (!draft.direction) {
    return {
      ...current,
      pendingClarification: {
        kind: "ledger_direction",
        amountCents: draft.amountCents,
        category: draft.category,
        occurredAt: draft.occurredAt,
        counterparty: draft.counterparty,
        note: draft.note,
        sourceText: rawText,
        createdAt: createdAtMs
      },
      messages: [...current.messages, userMessage, createMessage("assistant", "这是收入还是支出？", createdAt, createId)]
    };
  }

  const entry = createLedgerEntry({ ...draft, direction: draft.direction, amountCents: draft.amountCents }, rawText, createdAt, createId);

  return appendRecordedLedger(current, userMessage, entry, createdAt, createId);
}

export function resolveLedgerRecordInputWithAi(
  current: TimelyState,
  input: string,
  result: AiLedgerParseResult,
  options: ResolveOptions = {}
): TimelyState {
  const contextualAmountCents = parseAmountCents(normalizeText(input));

  if (
    result.intent !== "create_ledger" ||
    !result.direction ||
    typeof result.amountCents !== "number" ||
    !Number.isSafeInteger(result.amountCents) ||
    result.amountCents <= 0 ||
    contextualAmountCents === null ||
    contextualAmountCents !== result.amountCents
  ) {
    return resolveLedgerRecordInput(current, input, options);
  }

  const now = options.now ?? new Date();
  const createId = options.createId ?? createLocalId;
  const createdAt = toShanghaiIso(now);
  const rawText = input.trim();
  const userMessage = createMessage("user", rawText, createdAt, createId);
  const entry = createLedgerEntry(
    {
      direction: result.direction,
      amountCents: result.amountCents,
      category: result.category || "未分类",
      occurredAt: result.occurredAt || toShanghaiIso(now),
      counterparty: result.counterparty,
      note: result.note
    },
    rawText,
    createdAt,
    createId
  );

  return appendRecordedLedger(current, userMessage, entry, createdAt, createId);
}

export function isLikelyLedgerRecord(input: string) {
  const text = normalizeText(input);
  return (
    /记一笔|流水|账|账目|记账|花了?|消费|支付|支出|付了?|买|打车|午饭|晚饭|早饭|早餐|收到|收入|工资|报销|转入|进账|入账|奖金|退款/.test(
      text
    ) && (parseAmountCents(text) !== null || !isLikelyEventOnly(text))
  );
}

function resolvePendingAmount(
  current: TimelyState,
  userMessage: ConversationMessage,
  rawText: string,
  normalizedText: string,
  createdAt: string,
  createdAtMs: number,
  createId: (prefix: string) => string
): TimelyState {
  const pending = current.pendingClarification?.kind === "ledger_amount" ? current.pendingClarification : null;
  const amountCents = parseAmountCents(normalizedText) ?? parseStandaloneAmountCents(normalizedText);
  const direction = parseDirection(normalizedText) ?? pending?.direction ?? null;

  if (amountCents === null) {
    return {
      ...current,
      messages: [
        ...current.messages,
        userMessage,
        createMessage(
          "assistant",
          pending ? buildLedgerAmountQuestion(pending) : "金额是多少？",
          createdAt,
          createId
        )
      ]
    };
  }

  if (!direction || !pending) {
    return {
      ...current,
      pendingClarification: {
        kind: "ledger_direction" as const,
        amountCents,
        category: pending?.category ?? "未分类",
        occurredAt: pending?.occurredAt ?? createdAt,
        counterparty: pending?.counterparty ?? null,
        note: pending?.note ?? null,
        sourceText: pending ? `${pending.sourceText} ${rawText}` : rawText,
        createdAt: createdAtMs
      },
      messages: [...current.messages, userMessage, createMessage("assistant", "这是收入还是支出？", createdAt, createId)]
    };
  }

  const entry = createLedgerEntry(
    {
      direction,
      amountCents,
      category: pending.category,
      occurredAt: pending.occurredAt,
      counterparty: pending.counterparty,
      note: pending.note
    },
    `${pending.sourceText} ${rawText}`,
    createdAt,
    createId
  );

  return appendRecordedLedger(current, userMessage, entry, createdAt, createId);
}

function resolvePendingDirection(
  current: TimelyState,
  userMessage: ConversationMessage,
  rawText: string,
  normalizedText: string,
  createdAt: string,
  createId: (prefix: string) => string
): TimelyState {
  const pending = current.pendingClarification?.kind === "ledger_direction" ? current.pendingClarification : null;
  const direction = parseDirection(normalizedText);

  if (!direction || !pending) {
    return {
      ...current,
      messages: [...current.messages, userMessage, createMessage("assistant", "这是收入还是支出？", createdAt, createId)]
    };
  }

  const entry = createLedgerEntry(
    {
      direction,
      amountCents: pending.amountCents,
      category: pending.category,
      occurredAt: pending.occurredAt,
      counterparty: pending.counterparty,
      note: pending.note
    },
    `${pending.sourceText} ${rawText}`,
    createdAt,
    createId
  );

  return appendRecordedLedger(current, userMessage, entry, createdAt, createId);
}

function parseLedgerDraft(text: string, now: Date): LedgerDraft {
  return {
    direction: parseDirection(text),
    amountCents: parseAmountCents(text),
    category: inferCategory(text),
    occurredAt: parseOccurredAt(text, now),
    counterparty: null,
    note: inferLedgerNote(text)
  };
}

function appendRecordedLedger(
  current: TimelyState,
  userMessage: ConversationMessage,
  entry: LedgerEntry,
  createdAt: string,
  createId: (prefix: string) => string
): TimelyState {
  return {
    ...current,
    pendingClarification: null,
    ledgerEntries: [entry, ...current.ledgerEntries],
    messages: [
      ...current.messages,
      userMessage,
      createMessage("assistant", buildLedgerRecordedReply(entry), createdAt, createId)
    ]
  };
}

function createLedgerEntry(
  draft: Omit<LedgerDraft, "direction" | "amountCents"> & {
    direction: LedgerDirection;
    amountCents: number;
  },
  sourceText: string,
  createdAt: string,
  createId: (prefix: string) => string
): LedgerEntry {
  return {
    id: createId("ledger"),
    direction: draft.direction,
    amountCents: draft.amountCents,
    currency: "CNY",
    category: draft.category || "未分类",
    occurredAt: draft.occurredAt,
    counterparty: draft.counterparty,
    note: draft.note,
    sourceText,
    createdAt,
    updatedAt: createdAt
  };
}

function parseDirection(text: string): LedgerDirection | null {
  if (/收入|收到|工资|薪水|报销|转入|进账|入账|奖金|退款|赚/.test(text)) {
    return "income";
  }

  if (/支出|花了?|消费|支付|付了?|买|打车|午饭|晚饭|早饭|早餐|外卖|地铁|公交|车费/.test(text)) {
    return "expense";
  }

  return null;
}

function parseAmountCents(text: string) {
  const numberPattern = /\d+(?:\.\d{1,2})?/g;
  let match: RegExpExecArray | null;

  while ((match = numberPattern.exec(text))) {
    const rawAmount = match[0];
    const index = match.index;
    const end = index + rawAmount.length;
    const before = text.slice(Math.max(0, index - 10), index);
    const after = text.slice(end, end + 4);

    if (isDateOrQuantityNumber(after) && !hasMoneyUnitAfter(after)) {
      continue;
    }

    if (!hasMoneyUnitAround(text, index, end) && !hasAmountContextBefore(before)) {
      continue;
    }

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    return Math.round(amount * 100);
  }

  return null;
}

function parseStandaloneAmountCents(text: string) {
  const match = text.match(/^(?:¥|￥)?(\d+(?:\.\d{1,2})?)(?:元|块钱|块|人民币)?$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function inferCategory(text: string) {
  if (/工资|薪水|奖金/.test(text)) {
    return "工资";
  }

  if (/报销/.test(text)) {
    return "报销";
  }

  if (/打车|地铁|公交|出租|车费|高铁|机票/.test(text)) {
    return "交通";
  }

  if (/午饭|晚饭|早饭|早餐|餐|饭|外卖|咖啡|奶茶/.test(text)) {
    return "餐饮";
  }

  if (/超市|淘宝|京东|买/.test(text)) {
    return "购物";
  }

  return "未分类";
}

function inferLedgerNote(text: string) {
  const stripped = stripDateAndTimeExpressions(text);
  const purchaseMatch = stripped.match(/买了?(?:一个|一台|一件|一只|一杯|一份|个|台|件|只|杯|份)?(.+?)(?=花了?|消费|支付|付了?|用了?|[¥￥]|\d|$)/);

  if (!purchaseMatch) {
    return null;
  }

  const note = purchaseMatch[1]
    .replace(/^(一个|一台|一件|一只|一杯|一份|个|台|件|只|杯|份)/, "")
    .replace(/多少钱$/, "")
    .trim();

  return note || null;
}

function parseOccurredAt(text: string, now: Date) {
  const nowParts = getShanghaiParts(now);
  const explicitDate = parseExplicitDateParts(text, nowParts);

  if (explicitDate && isValidShanghaiDateParts(explicitDate.year, explicitDate.month, explicitDate.day)) {
    return buildShanghaiIso(explicitDate.year, explicitDate.month, explicitDate.day, nowParts.hour, nowParts.minute);
  }

  if (/前天/.test(text)) {
    return shiftShanghaiDay(now, -2);
  }

  if (/昨天/.test(text)) {
    return shiftShanghaiDay(now, -1);
  }

  if (/明天/.test(text)) {
    return shiftShanghaiDay(now, 1);
  }

  return toShanghaiIso(now);
}

function parseExplicitDateParts(text: string, fallback: { year: number; month: number }) {
  const withYear = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})[日号]?/);
  if (withYear) {
    return {
      year: Number(withYear[1]),
      month: Number(withYear[2]),
      day: Number(withYear[3])
    };
  }

  const withoutYear = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (withoutYear) {
    return {
      year: fallback.year,
      month: Number(withoutYear[1]),
      day: Number(withoutYear[2])
    };
  }

  const relativeMonthDay = text.match(/(上个月|上月|这个月|本月|下个月|下月)(\d{1,2})[日号]/);
  if (relativeMonthDay) {
    const monthOffset = /上/.test(relativeMonthDay[1]) ? -1 : /下/.test(relativeMonthDay[1]) ? 1 : 0;
    const shifted = new Date(Date.UTC(fallback.year, fallback.month - 1 + monthOffset, 1));

    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: Number(relativeMonthDay[2])
    };
  }

  return null;
}

function shiftShanghaiDay(now: Date, days: number) {
  const parts = getShanghaiParts(now);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return buildShanghaiIso(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    parts.hour,
    parts.minute
  );
}

function buildLedgerRecordedReply(entry: LedgerEntry) {
  const direction = entry.direction === "income" ? "收入" : "支出";
  return `已记录。${direction} ${formatAmount(entry.amountCents)} 元，${entry.category}。`;
}

function formatAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

function buildLedgerAmountQuestion(draft: Pick<LedgerDraft, "direction" | "category" | "note">) {
  if (draft.note && draft.direction === "expense") {
    return `请问${draft.note}花了多少钱？`;
  }

  if (draft.note && draft.direction === "income") {
    return `请问${draft.note}收入多少钱？`;
  }

  return "金额是多少？";
}

function isDateOrQuantityNumber(after: string) {
  return /^(年|月|日|号|点|时|分|秒|个|件|只|台|杯|份|张|次|公里|斤|两|克|kg|g)/i.test(after);
}

function hasMoneyUnitAfter(after: string) {
  return /^(元|块钱|块|人民币)/.test(after);
}

function hasMoneyUnitAround(text: string, index: number, end: number) {
  const before = text.slice(Math.max(0, index - 4), index);
  const after = text.slice(end, end + 4);

  return /([¥￥]|人民币|rmb)$/i.test(before) || hasMoneyUnitAfter(after);
}

function hasAmountContextBefore(before: string) {
  return /(花了?|花费|消费|支付|付了?|付款|支出|用了?|收了?|收到|收入|工资|薪水|报销|退款|转入|进账|入账|奖金|赚|记一笔|打车|午饭|晚饭|早饭|早餐|外卖|咖啡|奶茶|买.{0,6})$/.test(before);
}

function stripDateAndTimeExpressions(text: string) {
  return text
    .replace(/\d{4}年\d{1,2}月\d{1,2}[日号]?/g, " ")
    .replace(/\d{1,2}月\d{1,2}[日号]?/g, " ")
    .replace(/(?:上个月|上月|这个月|本月|下个月|下月)\d{1,2}[日号]/g, " ")
    .replace(/\d{1,2}[点:：]\d{1,2}/g, " ");
}

function isLikelyEventOnly(text: string) {
  return /会议|开会|复盘|评审|健身|日程|提醒/.test(text) && !/花了?|消费|支付|收入|工资|报销/.test(text);
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
