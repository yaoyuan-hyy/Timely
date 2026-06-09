export type RecordStatus = "active" | "cancelled";

export type ReminderStatus = "active" | "done" | "cancelled";

export type MessageRole = "user" | "assistant";

export type AppView = "chat" | "calendar" | "reminders" | "settings";

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

export type PendingClarification = {
  kind: "event_time";
  title: string;
  sourceText: string;
  createdAt: string;
};

export type AgentIntent =
  | "create_event"
  | "create_reminder"
  | "update_event"
  | "delete_event"
  | "query_calendar"
  | "unknown";

export type AgentParseResult = {
  intent: AgentIntent;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  reply: string;
  event?: {
    title: string;
    startsAt: string;
    endsAt: string | null;
    location: string | null;
    notes: string | null;
    reminderOffsetMinutes: number | null;
    matchHint: string | null;
    rawText: string;
  } | null;
  reminder?: {
    title: string;
    remindAt: string;
    relatedEventId: string | null;
    rawText: string;
  } | null;
  query?: {
    rangeStart: string;
    rangeEnd: string;
  } | null;
};

export type TimelyState = {
  events: CalendarEvent[];
  reminders: Reminder[];
  messages: ConversationMessage[];
  pendingClarification: PendingClarification | null;
};
