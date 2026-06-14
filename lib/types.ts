export type RecordStatus = "active" | "cancelled";

export type ReminderStatus = "active" | "done" | "cancelled";

export type MessageRole = "user" | "assistant";

export type AppView = "chat" | "calendar" | "settings";

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
      createdAt: string;
    }
  | {
      kind: "event_delete";
      title: string | null;
      targetDate: string | null;
      sourceText: string;
      createdAt: string;
    };

export type TimelyState = {
  events: CalendarEvent[];
  reminders: Reminder[];
  messages: ConversationMessage[];
  pendingClarification: PendingClarification | null;
};
