export type RecordStatus = "active" | "cancelled";

export type ReminderStatus = "active" | "done" | "cancelled";

export type MessageRole = "user" | "assistant";

export type AppView = "chat" | "calendar" | "ledger" | "settings";

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  status: RecordStatus;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
};

export type Reminder = {
  id: string;
  title: string;
  remindAt: string;
  relatedEventId: string | null;
  status: ReminderStatus;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
  notifiedAt: string | null;
};

export type LedgerDirection = "expense" | "income";

export type LedgerEntry = {
  id: string;
  direction: LedgerDirection;
  amountCents: number;
  currency: "CNY";
  category: string;
  occurredAt: string;
  counterparty: string | null;
  note: string | null;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

export type PendingClarification =
  | {
      kind: "event_time";
      title: string;
      sourceText: string;
      createdAt: number;
    }
  | {
      kind: "event_delete";
      title: string | null;
      targetDate: string | null;
      sourceText: string;
      createdAt: number;
    }
  | {
      kind: "ledger_amount";
      direction: LedgerDirection | null;
      category: string;
      occurredAt: string;
      counterparty: string | null;
      note: string | null;
      sourceText: string;
      createdAt: number;
    }
  | {
      kind: "ledger_direction";
      amountCents: number;
      category: string;
      occurredAt: string;
      counterparty: string | null;
      note: string | null;
      sourceText: string;
      createdAt: number;
    };

export type TimelyState = {
  events: CalendarEvent[];
  reminders: Reminder[];
  ledgerEntries: LedgerEntry[];
  messages: ConversationMessage[];
  pendingClarification: PendingClarification | null;
};
