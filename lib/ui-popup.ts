import type { LedgerDirection } from "./types";

export type UiPopupQueryKind = "schedule" | "ledger" | "task";
export type UiPopupQueryStatus = "success" | "empty";

export type UiPopupMetric = {
  label: string;
  value: string;
};

export type UiPopupEventItem = {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  notes: string | null;
};

export type UiPopupLedgerEntry = {
  id: string;
  direction: LedgerDirection;
  amountCents: number;
  category: string;
  occurredAt: string;
  note: string | null;
};

export type UiPopupPayload = {
  type: "timely_query_result";
  query_kind: UiPopupQueryKind;
  query_status: UiPopupQueryStatus;
  title: string;
  summary: string;
  time_range: {
    label: string;
    from: string;
    to: string;
  };
  metrics: UiPopupMetric[];
  events: UiPopupEventItem[];
  ledger: {
    entries: UiPopupLedgerEntry[];
    totalExpenseCents: number;
    totalIncomeCents: number;
    netCents: number;
  };
};

const UI_POPUP_PATTERN = /```json UI_POPUP\s*([\s\S]*?)```/;

export function buildUiPopupMessage(intro: string, payload: UiPopupPayload) {
  return `${intro.trim()}\n\n\`\`\`json UI_POPUP\n${JSON.stringify(payload)}\n\`\`\``;
}

export function extractUiPopupFromMessage(content: string): UiPopupPayload | null {
  const match = content.match(UI_POPUP_PATTERN);

  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]) as unknown;
    return isUiPopupPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function stripUiPopupBlock(content: string) {
  return content.replace(UI_POPUP_PATTERN, "").trim();
}

function isUiPopupPayload(value: unknown): value is UiPopupPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Partial<UiPopupPayload>;

  return (
    payload.type === "timely_query_result" &&
    (payload.query_kind === "schedule" || payload.query_kind === "ledger" || payload.query_kind === "task") &&
    (payload.query_status === "success" || payload.query_status === "empty") &&
    typeof payload.title === "string" &&
    typeof payload.summary === "string" &&
    isTimeRange(payload.time_range) &&
    Array.isArray(payload.metrics) &&
    Array.isArray(payload.events) &&
    isLedgerResult(payload.ledger)
  );
}

function isTimeRange(value: unknown): value is UiPopupPayload["time_range"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const range = value as Partial<UiPopupPayload["time_range"]>;
  return typeof range.label === "string" && typeof range.from === "string" && typeof range.to === "string";
}

function isLedgerResult(value: unknown): value is UiPopupPayload["ledger"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const ledger = value as Partial<UiPopupPayload["ledger"]>;
  return (
    Array.isArray(ledger.entries) &&
    typeof ledger.totalExpenseCents === "number" &&
    typeof ledger.totalIncomeCents === "number" &&
    typeof ledger.netCents === "number"
  );
}
