"use client";

import {
  Bell,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MessageCircle,
  RefreshCcw,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  XCircle
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { initialState } from "@/lib/seed-data";
import { activeEvents, activeReminders, sortEventsByTime, sortRemindersByTime } from "@/lib/stats";
import {
  addDays,
  dateAtLocalHour,
  dayKey,
  formatDayLabel,
  formatMessageTime,
  formatShortDate,
  formatTime,
  todayLabel
} from "@/lib/time";
import type { AppView, CalendarEvent, ConversationMessage, Reminder, TimelyState } from "@/lib/types";

const STORAGE_KEY = "timely-mobile-state-v1";

const viewLabels: Record<AppView, string> = {
  chat: "对话",
  calendar: "日历",
  reminders: "提醒",
  settings: "设置"
};

export function TimelyApp() {
  const [state, setState, isReady] = useLocalStorageState<TimelyState>(STORAGE_KEY, initialState);
  const [view, setView] = useState<AppView>("chat");
  const [draft, setDraft] = useState("");

  const visibleEvents = useMemo(() => sortEventsByTime(activeEvents(state.events)), [state.events]);
  const visibleReminders = useMemo(
    () => sortRemindersByTime(state.reminders.filter((reminder) => reminder.status !== "cancelled")),
    [state.reminders]
  );
  const activeReminderCount = activeReminders(state.reminders).length;

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    if (!text) {
      return;
    }

    setState((current) => resolveLocalInput(current, text));
    setDraft("");
  }

  function resetDemoData() {
    setState(initialState);
    setDraft("");
  }

  function cancelEvent(eventId: string) {
    setState((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.id === eventId
          ? { ...event, status: "cancelled", updatedAt: new Date().toISOString() }
          : event
      )
    }));
  }

  function toggleReminder(reminderId: string) {
    setState((current) => ({
      ...current,
      reminders: current.reminders.map((reminder) =>
        reminder.id === reminderId
          ? {
              ...reminder,
              status: reminder.status === "done" ? "active" : "done",
              updatedAt: new Date().toISOString()
            }
          : reminder
      )
    }));
  }

  function cancelReminder(reminderId: string) {
    setState((current) => ({
      ...current,
      reminders: current.reminders.map((reminder) =>
        reminder.id === reminderId
          ? { ...reminder, status: "cancelled", updatedAt: new Date().toISOString() }
          : reminder
      )
    }));
  }

  return (
    <main className="app-stage">
      <section className="phone-shell" aria-label="Timely mobile client">
        <header className="app-header">
          <div>
            <p className="today-text">{todayLabel()}</p>
            <h1>Timely</h1>
          </div>
          <div className="sync-badge">
            <Smartphone size={14} />
            <span>{isReady ? "本机" : "准备中"}</span>
          </div>
        </header>

        <section className="content-area">
          {view === "chat" && (
            <ChatView messages={state.messages} draft={draft} setDraft={setDraft} onSubmit={submitMessage} />
          )}
          {view === "calendar" && <CalendarView events={visibleEvents} onCancel={cancelEvent} />}
          {view === "reminders" && (
            <ReminderView reminders={visibleReminders} onToggle={toggleReminder} onCancel={cancelReminder} />
          )}
          {view === "settings" && (
            <SettingsView
              eventCount={visibleEvents.length}
              reminderCount={activeReminderCount}
              hasPendingClarification={Boolean(state.pendingClarification)}
              onReset={resetDemoData}
            />
          )}
        </section>

        <nav className="bottom-nav" aria-label="Timely sections">
          <NavButton icon={<MessageCircle size={20} />} view="chat" activeView={view} onClick={setView} />
          <NavButton icon={<CalendarDays size={20} />} view="calendar" activeView={view} onClick={setView} />
          <NavButton icon={<Bell size={20} />} view="reminders" activeView={view} onClick={setView} />
          <NavButton icon={<Settings size={20} />} view="settings" activeView={view} onClick={setView} />
        </nav>
      </section>
    </main>
  );
}

function ChatView({
  messages,
  draft,
  setDraft,
  onSubmit
}: {
  messages: ConversationMessage[];
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="view-stack chat-view">
      <div className="section-head">
        <div>
          <p className="eyebrow">Agent</p>
          <h2>对话记录</h2>
        </div>
        <span className="count-pill">{messages.length}</span>
      </div>

      <div className="message-list" aria-live="polite">
        {messages.map((message) => (
          <article className={`message-bubble ${message.role}`} key={message.id}>
            <p>{message.content}</p>
            <time>{formatMessageTime(message.createdAt)}</time>
          </article>
        ))}
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <input
          aria-label="输入要记录的内容"
          placeholder="说点什么..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" title="发送">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

function CalendarView({ events, onCancel }: { events: CalendarEvent[]; onCancel: (eventId: string) => void }) {
  const groupedEvents = groupEvents(events);

  return (
    <div className="view-stack">
      <div className="section-head">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>内部日历</h2>
        </div>
        <span className="count-pill">{events.length}</span>
      </div>

      {groupedEvents.length === 0 ? (
        <EmptyState icon={<CalendarDays size={24} />} title="暂无记录" />
      ) : (
        <div className="day-list">
          {groupedEvents.map(([key, dayEvents]) => (
            <section className="day-group" key={key}>
              <h3>{formatDayLabel(dayEvents[0].startsAt)}</h3>
              <div className="record-list">
                {dayEvents.map((event) => (
                  <article className="record-row" key={event.id}>
                    <div className="time-chip">{formatTime(event.startsAt)}</div>
                    <div className="record-body">
                      <h4>{event.title}</h4>
                      <p>{event.location ?? event.notes ?? "已保存到 Timely"}</p>
                    </div>
                    <button className="icon-action danger" type="button" title="取消记录" onClick={() => onCancel(event.id)}>
                      <XCircle size={18} />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ReminderView({
  reminders,
  onToggle,
  onCancel
}: {
  reminders: Reminder[];
  onToggle: (reminderId: string) => void;
  onCancel: (reminderId: string) => void;
}) {
  return (
    <div className="view-stack">
      <div className="section-head">
        <div>
          <p className="eyebrow">Reminder</p>
          <h2>提醒</h2>
        </div>
        <span className="count-pill">{reminders.length}</span>
      </div>

      {reminders.length === 0 ? (
        <EmptyState icon={<Bell size={24} />} title="暂无提醒" />
      ) : (
        <div className="record-list">
          {reminders.map((reminder) => (
            <article className={`reminder-row ${reminder.status}`} key={reminder.id}>
              <button
                className="check-action"
                type="button"
                title={reminder.status === "done" ? "标为未完成" : "标为完成"}
                onClick={() => onToggle(reminder.id)}
              >
                {reminder.status === "done" ? <CheckCircle2 size={20} /> : <BellRing size={20} />}
              </button>
              <div className="record-body">
                <h4>{reminder.title}</h4>
                <p>
                  {formatShortDate(reminder.remindAt)} {formatTime(reminder.remindAt)}
                </p>
              </div>
              <button className="icon-action danger" type="button" title="取消提醒" onClick={() => onCancel(reminder.id)}>
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsView({
  eventCount,
  reminderCount,
  hasPendingClarification,
  onReset
}: {
  eventCount: number;
  reminderCount: number;
  hasPendingClarification: boolean;
  onReset: () => void;
}) {
  return (
    <div className="view-stack">
      <div className="section-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>设置</h2>
        </div>
        <ShieldCheck size={22} />
      </div>

      <div className="settings-list">
        <article className="settings-row">
          <div>
            <h3>本地记录</h3>
            <p>
              {eventCount} 个日历事件，{reminderCount} 个待提醒
            </p>
          </div>
          <Clock3 size={19} />
        </article>
        <article className="settings-row">
          <div>
            <h3>澄清状态</h3>
            <p>{hasPendingClarification ? "等待补充时间" : "没有待补充内容"}</p>
          </div>
          <MessageCircle size={19} />
        </article>
        <article className="settings-row">
          <div>
            <h3>通知权限</h3>
            <p>后续创建提醒时请求</p>
          </div>
          <Bell size={19} />
        </article>
      </div>

      <button className="reset-button" type="button" onClick={onReset}>
        <RefreshCcw size={17} />
        重置示例数据
      </button>
    </div>
  );
}

function NavButton({
  icon,
  view,
  activeView,
  onClick
}: {
  icon: ReactNode;
  view: AppView;
  activeView: AppView;
  onClick: (view: AppView) => void;
}) {
  const isActive = view === activeView;

  return (
    <button className={`nav-button ${isActive ? "active" : ""}`} type="button" onClick={() => onClick(view)}>
      {icon}
      <span>{viewLabels[view]}</span>
    </button>
  );
}

function EmptyState({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="empty-state">
      {icon}
      <p>{title}</p>
    </div>
  );
}

function resolveLocalInput(current: TimelyState, input: string): TimelyState {
  const createdAt = new Date().toISOString();
  const userMessage = createMessage("user", input, createdAt);

  if (current.pendingClarification) {
    if (!hasMeetingTime(input)) {
      return {
        ...current,
        messages: [...current.messages, userMessage, createMessage("assistant", "什么时候？", createdAt)]
      };
    }

    const event = buildMeetingEvent(current.pendingClarification.sourceText, current.pendingClarification.title);

    return {
      ...current,
      pendingClarification: null,
      events: [event, ...current.events],
      messages: [
        ...current.messages,
        userMessage,
        createMessage("assistant", `已记录。${formatShortDate(event.startsAt)}下午3点，${event.title}。`, createdAt)
      ]
    };
  }

  if (/最近怎么样/.test(input)) {
    return appendAssistant(current, userMessage, "我可以帮你记录日程或提醒。", createdAt);
  }

  if (isIncompleteMeeting(input)) {
    return {
      ...current,
      pendingClarification: {
        kind: "event_time",
        title: "会议",
        sourceText: input,
        createdAt
      },
      messages: [...current.messages, userMessage, createMessage("assistant", "什么时候？", createdAt)]
    };
  }

  if (isMeetingRecord(input)) {
    const event = buildMeetingEvent(input, "会议");
    const reminder = /提前半小时/.test(input) ? buildEventReminder(event, input) : null;

    return {
      ...current,
      events: [event, ...current.events],
      reminders: reminder ? [reminder, ...current.reminders] : current.reminders,
      messages: [
        ...current.messages,
        userMessage,
        createMessage(
          "assistant",
          reminder ? "已记录。6月13日下午3点，会议；提前半小时提醒。" : "已记录。6月13日下午3点，会议。",
          createdAt
        )
      ]
    };
  }

  if (isParcelReminder(input)) {
    const reminder = buildParcelReminder(input);

    return {
      ...current,
      reminders: [reminder, ...current.reminders],
      messages: [
        ...current.messages,
        userMessage,
        createMessage("assistant", "已提醒。明天下午3点，取快递。", createdAt)
      ]
    };
  }

  return appendAssistant(current, userMessage, "我可以帮你记录日程或提醒。", createdAt);
}

function appendAssistant(current: TimelyState, userMessage: ConversationMessage, reply: string, createdAt: string) {
  return {
    ...current,
    messages: [...current.messages, userMessage, createMessage("assistant", reply, createdAt)]
  };
}

function createMessage(role: "user" | "assistant", content: string, createdAt = new Date().toISOString()) {
  return {
    id: makeId("message"),
    role,
    content,
    createdAt
  };
}

function isIncompleteMeeting(input: string) {
  return /会议/.test(input) && /记录/.test(input) && !hasMeetingTime(input);
}

function isMeetingRecord(input: string) {
  return /会议/.test(input) && hasMeetingTime(input);
}

function isParcelReminder(input: string) {
  return /提醒/.test(input) && /取快递/.test(input) && /明天/.test(input);
}

function hasMeetingTime(input: string) {
  return /6月13/.test(input) && /(下午3点|3点|15点|15:00|15：00)/.test(input);
}

function buildMeetingEvent(sourceText: string, title: string): CalendarEvent {
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const startsAt = new Date(year, 5, 13, 15, 0, 0).toISOString();

  return {
    id: makeId("event"),
    title,
    startsAt,
    endsAt: null,
    location: null,
    notes: null,
    status: "active",
    sourceText,
    createdAt: now,
    updatedAt: now
  };
}

function buildEventReminder(event: CalendarEvent, sourceText: string): Reminder {
  const startsAt = new Date(event.startsAt);
  startsAt.setMinutes(startsAt.getMinutes() - 30);
  const now = new Date().toISOString();

  return {
    id: makeId("reminder"),
    title: `${event.title}提醒`,
    remindAt: startsAt.toISOString(),
    relatedEventId: event.id,
    status: "active",
    sourceText,
    createdAt: now,
    updatedAt: now,
    notifiedAt: null
  };
}

function buildParcelReminder(sourceText: string): Reminder {
  const tomorrow = addDays(new Date(), 1);
  const now = new Date().toISOString();

  return {
    id: makeId("reminder"),
    title: "取快递",
    remindAt: dateAtLocalHour(tomorrow, 15),
    relatedEventId: null,
    status: "active",
    sourceText,
    createdAt: now,
    updatedAt: now,
    notifiedAt: null
  };
}

function groupEvents(events: CalendarEvent[]) {
  const groups = events.reduce<Record<string, CalendarEvent[]>>((result, event) => {
    const key = dayKey(event.startsAt);
    result[key] = [...(result[key] ?? []), event];
    return result;
  }, {});

  return Object.entries(groups);
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
