import type { CalendarEvent, ConversationMessage, LedgerEntry, PendingClarification, Reminder, TimelyState } from "./types";

export function normalizeTimelyState(value: unknown, fallback: TimelyState): TimelyState {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!isRecord(parsed)) {
    return fallback;
  }

  return {
    events: Array.isArray(parsed.events) ? parsed.events.map(normalizeEvent).filter(isCalendarEvent) : fallback.events,
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders.map(normalizeReminder).filter(isReminder) : [],
    ledgerEntries: Array.isArray(parsed.ledgerEntries)
      ? parsed.ledgerEntries.map(normalizeLedgerEntry).filter(isLedgerEntry)
      : [],
    messages: Array.isArray(parsed.messages)
      ? parsed.messages.map(normalizeMessage).filter(isConversationMessage)
      : fallback.messages,
    pendingClarification: normalizePendingClarification(parsed.pendingClarification)
  };
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeEvent(value: unknown): CalendarEvent | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.startsAt !== "string") {
    return null;
  }

  const createdAt = stringOrEmpty(value.createdAt);

  return {
    id: value.id,
    title: value.title,
    startsAt: value.startsAt,
    endsAt: nullableString(value.endsAt),
    location: nullableString(value.location),
    notes: nullableString(value.notes),
    status: value.status === "cancelled" ? "cancelled" : "active",
    sourceText: stringOrEmpty(value.sourceText),
    createdAt,
    updatedAt: stringOrEmpty(value.updatedAt) || createdAt
  };
}

function normalizeReminder(value: unknown): Reminder | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.remindAt !== "string") {
    return null;
  }

  const createdAt = stringOrEmpty(value.createdAt);

  return {
    id: value.id,
    title: value.title,
    remindAt: value.remindAt,
    relatedEventId: nullableString(value.relatedEventId),
    status: value.status === "done" || value.status === "cancelled" ? value.status : "active",
    sourceText: stringOrEmpty(value.sourceText),
    createdAt,
    updatedAt: stringOrEmpty(value.updatedAt) || createdAt,
    notifiedAt: nullableString(value.notifiedAt)
  };
}

function normalizeLedgerEntry(value: unknown): LedgerEntry | null {
  const amountCents = isRecord(value) && typeof value.amountCents === "number" ? value.amountCents : null;

  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.direction !== "expense" && value.direction !== "income") ||
    amountCents === null ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0 ||
    value.currency !== "CNY" ||
    typeof value.category !== "string" ||
    !value.category ||
    typeof value.occurredAt !== "string"
  ) {
    return null;
  }

  const createdAt = stringOrEmpty(value.createdAt);

  return {
    id: value.id,
    direction: value.direction,
    amountCents,
    currency: "CNY",
    category: value.category,
    occurredAt: value.occurredAt,
    counterparty: nullableString(value.counterparty),
    note: nullableString(value.note),
    sourceText: stringOrEmpty(value.sourceText),
    createdAt,
    updatedAt: stringOrEmpty(value.updatedAt) || createdAt
  };
}

function normalizeMessage(value: unknown): ConversationMessage | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.content !== "string") {
    return null;
  }

  return {
    id: value.id,
    role: value.role === "user" ? "user" : "assistant",
    content: value.content,
    createdAt: stringOrEmpty(value.createdAt)
  };
}

function normalizePendingClarification(value: unknown): PendingClarification | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.kind === "event_time" && typeof value.title === "string") {
    return {
      kind: "event_time",
      title: value.title,
      sourceText: stringOrEmpty(value.sourceText),
      createdAt: timestampOrZero(value.createdAt)
    };
  }

  if (value.kind === "event_delete") {
    return {
      kind: "event_delete",
      title: nullableString(value.title),
      targetDate: nullableString(value.targetDate),
      sourceText: stringOrEmpty(value.sourceText),
      createdAt: timestampOrZero(value.createdAt)
    };
  }

  if (value.kind === "ledger_amount" && typeof value.category === "string" && typeof value.occurredAt === "string") {
    return {
      kind: "ledger_amount",
      direction: value.direction === "expense" || value.direction === "income" ? value.direction : null,
      category: value.category || "未分类",
      occurredAt: value.occurredAt,
      counterparty: nullableString(value.counterparty),
      note: nullableString(value.note),
      sourceText: stringOrEmpty(value.sourceText),
      createdAt: timestampOrZero(value.createdAt)
    };
  }

  const amountCents = isRecord(value) && typeof value.amountCents === "number" ? value.amountCents : null;

  if (
    value.kind === "ledger_direction" &&
    amountCents !== null &&
    Number.isSafeInteger(amountCents) &&
    amountCents >= 0 &&
    typeof value.category === "string" &&
    typeof value.occurredAt === "string"
  ) {
    return {
      kind: "ledger_direction",
      amountCents,
      category: value.category || "未分类",
      occurredAt: value.occurredAt,
      counterparty: nullableString(value.counterparty),
      note: nullableString(value.note),
      sourceText: stringOrEmpty(value.sourceText),
      createdAt: timestampOrZero(value.createdAt)
    };
  }

  return null;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value : "";
}

function timestampOrZero(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCalendarEvent(value: CalendarEvent | null): value is CalendarEvent {
  return Boolean(value);
}

function isReminder(value: Reminder | null): value is Reminder {
  return Boolean(value);
}

function isLedgerEntry(value: LedgerEntry | null): value is LedgerEntry {
  return Boolean(value);
}

function isConversationMessage(value: ConversationMessage | null): value is ConversationMessage {
  return Boolean(value);
}
