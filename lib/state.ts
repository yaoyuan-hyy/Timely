import type { CalendarEvent, ConversationMessage, PendingClarification, Reminder, TimelyState } from "./types";

export function normalizeTimelyState(value: unknown, fallback: TimelyState): TimelyState {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!isRecord(parsed)) {
    return fallback;
  }

  return {
    events: Array.isArray(parsed.events) ? parsed.events.map(normalizeEvent).filter(isCalendarEvent) : fallback.events,
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders.map(normalizeReminder).filter(isReminder) : [],
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
      createdAt: stringOrEmpty(value.createdAt)
    };
  }

  if (value.kind === "event_delete") {
    return {
      kind: "event_delete",
      title: nullableString(value.title),
      targetDate: nullableString(value.targetDate),
      sourceText: stringOrEmpty(value.sourceText),
      createdAt: stringOrEmpty(value.createdAt)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCalendarEvent(value: CalendarEvent | null): value is CalendarEvent {
  return Boolean(value);
}

function isReminder(value: Reminder | null): value is Reminder {
  return Boolean(value);
}

function isConversationMessage(value: ConversationMessage | null): value is ConversationMessage {
  return Boolean(value);
}
