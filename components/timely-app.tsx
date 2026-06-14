"use client";

import {
  CalendarDays,
  ChevronLeft,
  Clock3,
  Menu,
  MessageCircle,
  Mic,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  XCircle
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { resolveEventRecordInput, resolveEventRecordInputWithAi } from "@/lib/event-recording";
import type { AiEventParseResult } from "@/lib/event-recording";
import { initialState } from "@/lib/seed-data";
import { activeEvents, sortEventsByTime } from "@/lib/stats";
import {
  dayKey,
  formatMessageTime,
  formatTime,
  todayLabel
} from "@/lib/time";
import type { AppView, CalendarEvent, ConversationMessage, TimelyState } from "@/lib/types";

const STORAGE_KEY = "timely-event-record-state-v1";

const viewLabels: Record<AppView, string> = {
  chat: "对话",
  calendar: "记录",
  settings: "设置"
};

const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];
const dayMs = 24 * 60 * 60 * 1000;

export function TimelyApp() {
  const [state, setState, isReady] = useLocalStorageState<TimelyState>(STORAGE_KEY, initialState);
  const [view, setView] = useState<AppView>("chat");
  const [draft, setDraft] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const visibleEvents = useMemo(() => sortEventsByTime(activeEvents(state.events)), [state.events]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    if (!text || isSubmitting) {
      return;
    }

    setDraft("");
    setIsVoiceMode(false);
    setIsSubmitting(true);

    try {
      const aiResult = await requestAiEventParse(text);
      setState((current) => resolveEventRecordInputWithAi(current, text, aiResult));
    } catch {
      setState((current) => resolveEventRecordInput(current, text));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function requestAiEventParse(input: string): Promise<AiEventParseResult> {
    const response = await fetch("/api/record-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input })
    });

    if (!response.ok) {
      throw new Error("AI event parsing failed");
    }

    const data = (await response.json()) as { result?: unknown };
    if (!isAiEventParseResult(data.result)) {
      throw new Error("AI event parsing returned invalid result");
    }

    return data.result;
  }

  function resetDemoData() {
    setState(initialState);
    setDraft("");
  }

  function clearChatHistory() {
    setState((current) => ({
      ...current,
      messages: [],
      pendingClarification: null
    }));
    setDraft("");
    setIsVoiceMode(false);
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

  function selectView(nextView: AppView) {
    setView(nextView);
    setIsMenuOpen(false);
  }

  return (
    <main className="app-stage">
      <section className="phone-shell" aria-label="Timely mobile client">
        <header className="app-header">
          <button
            className="menu-trigger"
            type="button"
            aria-controls="timely-drawer"
            aria-expanded={isMenuOpen}
            aria-label="打开菜单"
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu size={26} />
          </button>
          <div className="app-title">
            <p className="today-text">{todayLabel()}</p>
            <h1>Timely</h1>
          </div>
          <button
            className="clear-chat-button"
            type="button"
            title="清空聊天记录"
            aria-label="清空聊天记录"
            disabled={!isReady || (state.messages.length === 0 && !state.pendingClarification)}
            onClick={clearChatHistory}
          >
            <Trash2 size={18} />
          </button>
        </header>

        <div
          className={`drawer-backdrop ${isMenuOpen ? "open" : ""}`}
          aria-hidden={!isMenuOpen}
          onClick={() => setIsMenuOpen(false)}
        />
        <aside className={`side-drawer ${isMenuOpen ? "open" : ""}`} id="timely-drawer" aria-label="主菜单">
          <div className="drawer-head">
            <div>
              <p className="eyebrow">Menu</p>
              <h2>Timely</h2>
            </div>
            <button className="drawer-close" type="button" aria-label="关闭菜单" onClick={() => setIsMenuOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <nav className="drawer-nav" aria-label="切换页面">
            <NavButton icon={<MessageCircle size={20} />} view="chat" activeView={view} onClick={selectView} />
            <NavButton icon={<CalendarDays size={20} />} view="calendar" activeView={view} onClick={selectView} />
            <NavButton icon={<Settings size={20} />} view="settings" activeView={view} onClick={selectView} />
          </nav>
        </aside>

        <section className="content-area">
          {view === "chat" && (
            <ChatView
              messages={state.messages}
              draft={draft}
              setDraft={setDraft}
              isVoiceMode={isVoiceMode}
              isSubmitting={isSubmitting}
              onToggleVoice={() => setIsVoiceMode((value) => !value)}
              onSubmit={submitMessage}
            />
          )}
          {view === "calendar" && <CalendarView events={visibleEvents} onCancel={cancelEvent} />}
          {view === "settings" && (
            <SettingsView
              eventCount={visibleEvents.length}
              hasPendingClarification={Boolean(state.pendingClarification)}
              onReset={resetDemoData}
            />
          )}
        </section>
      </section>
    </main>
  );
}

function ChatView({
  messages,
  draft,
  setDraft,
  isVoiceMode,
  isSubmitting,
  onToggleVoice,
  onSubmit
}: {
  messages: ConversationMessage[];
  draft: string;
  setDraft: (value: string) => void;
  isVoiceMode: boolean;
  isSubmitting: boolean;
  onToggleVoice: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasConversation = messages.some((message) => message.role === "user");

  return (
    <div className="view-stack chat-view">
      {hasConversation ? (
        <div className="message-list" aria-live="polite">
          {messages.map((message) => (
            <article className={`message-bubble ${message.role}`} key={message.id}>
              <p>{message.content}</p>
              <time>{formatMessageTime(message.createdAt)}</time>
            </article>
          ))}
        </div>
      ) : (
        <section className="home-prompt" aria-label="Timely welcome">
          <Sparkles className="prompt-spark" size={38} />
          <h2>想记录什么，尽管说吧！</h2>
        </section>
      )}

      <form className="composer" onSubmit={onSubmit}>
        <input
          aria-label="输入要记录的内容"
          placeholder={isSubmitting ? "正在记录..." : isVoiceMode ? "正在听..." : "记录某个时间点发生的事..."}
          value={draft}
          disabled={isSubmitting}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          className="voice-action"
          type="button"
          title="语音输入"
          aria-label="语音输入"
          aria-pressed={isVoiceMode}
          disabled={isSubmitting}
          onClick={onToggleVoice}
        >
          <Mic size={22} />
        </button>
      </form>
    </div>
  );
}

function isAiEventParseResult(value: unknown): value is AiEventParseResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const result = value as Partial<AiEventParseResult>;
  return (
    result.intent === "create_event" ||
    result.intent === "delete_event" ||
    result.intent === "needs_clarification" ||
    result.intent === "unsupported"
  );
}

function CalendarView({ events, onCancel }: { events: CalendarEvent[]; onCancel: (eventId: string) => void }) {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const currentMonthRef = useRef<HTMLElement | null>(null);
  const scrollMonths = useMemo(() => buildScrollableMonths(monthDate), [monthDate]);
  const pickerYears = useMemo(() => buildPickerYears(monthDate.getFullYear()), [monthDate]);
  const selectedDate = selectedDayKey ? dateFromDayKey(selectedDayKey) : null;
  const selectedEvents = useMemo(
    () => (selectedDayKey ? sortEventsByTime(events.filter((event) => dayKey(event.startsAt) === selectedDayKey)) : []),
    [events, selectedDayKey]
  );
  const selectedWeekDays = useMemo(
    () => (selectedDate ? buildWeekDays(selectedDate, events) : []),
    [events, selectedDate]
  );

  useEffect(() => {
    if (!selectedDayKey) {
      currentMonthRef.current?.scrollIntoView({ block: "start" });
    }
  }, [monthDate, selectedDayKey]);

  function jumpToday() {
    const today = new Date();
    setMonthDate(startOfMonth(today));
    setSelectedDayKey(toLocalDayKey(today));
  }

  function chooseYear(year: number) {
    setMonthDate((current) => startOfMonth(new Date(year, current.getMonth(), 1)));
    setIsYearPickerOpen(false);
  }

  function chooseMonth(monthIndex: number) {
    setMonthDate((current) => startOfMonth(new Date(current.getFullYear(), monthIndex, 1)));
    setIsMonthPickerOpen(false);
  }

  function openDay(date: Date, key: string) {
    setMonthDate(startOfMonth(date));
    setSelectedDayKey(key);
  }

  return (
    <div className="view-stack calendar-view">
      {selectedDayKey && selectedDate ? (
        <section className="day-detail" aria-label="单日事件记录">
          <div className="calendar-toolbar">
            <button className="calendar-pill" type="button" onClick={() => setSelectedDayKey(null)}>
              <ChevronLeft size={22} />
              {monthDate.getMonth() + 1}月
            </button>
            <button className="calendar-pill compact" type="button" onClick={jumpToday}>
              今天
            </button>
          </div>

          <div className="week-strip" aria-label="选择本周日期">
            {selectedWeekDays.map((day) => (
              <button
                className={`week-day ${day.key === selectedDayKey ? "selected" : ""} ${day.events.length ? "has-events" : ""}`}
                type="button"
                key={day.key}
                onClick={() => setSelectedDayKey(day.key)}
              >
                <span>{weekLabels[day.date.getDay()]}</span>
                <strong>{day.date.getDate()}</strong>
              </button>
            ))}
          </div>

          <div className="day-title">
            <h2>{formatFullDay(selectedDate)}</h2>
            <p>{selectedEvents.length ? `${selectedEvents.length} 条记录` : "这天暂无记录"}</p>
          </div>

          <div className="timeline-grid" aria-label="单日时间轴">
            {Array.from({ length: 24 }, (_, hour) => {
              const hourEvents = selectedEvents.filter((event) => new Date(event.startsAt).getHours() === hour);
              return (
                <section className="timeline-hour" key={hour}>
                  <time>{String(hour).padStart(2, "0")}:00</time>
                  <div className="timeline-lane">
                    {hourEvents.map((event) => (
                      <article className="timeline-event" key={event.id}>
                        <div>
                          <h3>{event.title}</h3>
                          <p>
                            {formatTime(event.startsAt)} - {formatTime(event.endsAt ?? addHoursIso(event.startsAt, 1))}
                          </p>
                        </div>
                        <button
                          className="icon-action danger"
                          type="button"
                          title="取消记录"
                          onClick={() => onCancel(event.id)}
                        >
                          <XCircle size={17} />
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="calendar-month" aria-label="月历记录概览">
          <div className="calendar-toolbar">
            <div className="calendar-picker-wrap">
              <button
                className="year-select"
                type="button"
                aria-expanded={isYearPickerOpen}
                onClick={() => {
                  setIsYearPickerOpen((value) => !value);
                  setIsMonthPickerOpen(false);
                }}
              >
                {monthDate.getFullYear()}年
              </button>
              {isYearPickerOpen && (
                <div className="calendar-picker year-picker">
                  {pickerYears.map((year) => (
                    <button
                      className={year === monthDate.getFullYear() ? "selected" : ""}
                      type="button"
                      key={year}
                      onClick={() => chooseYear(year)}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="calendar-pill compact" type="button" onClick={jumpToday}>
              今天
            </button>
          </div>

          <div className="month-heading">
            <div className="calendar-picker-wrap month-picker-wrap">
              <button
                className="month-select"
                type="button"
                aria-expanded={isMonthPickerOpen}
                onClick={() => {
                  setIsMonthPickerOpen((value) => !value);
                  setIsYearPickerOpen(false);
                }}
              >
                {monthDate.getMonth() + 1}月
              </button>
              {isMonthPickerOpen && (
                <div className="calendar-picker month-picker">
                  {Array.from({ length: 12 }, (_, index) => (
                    <button
                      className={index === monthDate.getMonth() ? "selected" : ""}
                      type="button"
                      key={index}
                      onClick={() => chooseMonth(index)}
                    >
                      {index + 1}月
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="calendar-scroll" aria-label="上下滑动浏览月份">
            {scrollMonths.map((scrollMonth) => {
              const calendarDays = buildMonthDays(scrollMonth, events);
              const isFocusedMonth = scrollMonth.getTime() === monthDate.getTime();
              return (
                <section
                  className="calendar-month-section"
                  key={`${scrollMonth.getFullYear()}-${scrollMonth.getMonth()}`}
                  ref={isFocusedMonth ? currentMonthRef : undefined}
                >
                  <h3>{scrollMonth.getFullYear()}年 {scrollMonth.getMonth() + 1}月</h3>
                  <div className="weekday-row" aria-hidden="true">
                    {weekLabels.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  <div className="month-grid">
                    {calendarDays.map((day) => (
                      <button
                        className={`month-day ${day.isCurrentMonth ? "" : "muted"} ${day.isToday ? "today" : ""} ${
                          day.events.length ? "has-events" : ""
                        }`}
                        type="button"
                        key={day.key}
                        onClick={() => openDay(day.date, day.key)}
                      >
                        <strong>{day.date.getDate()}</strong>
                        <span>{day.events.length ? `${day.events.length}条` : ""}</span>
                        {day.events.length > 0 && <i aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsView({
  eventCount,
  hasPendingClarification,
  onReset
}: {
  eventCount: number;
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
            <h3>本地事件</h3>
            <p>{eventCount} 个事件记录</p>
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
            <h3>记录范围</h3>
            <p>支持过去或未来的明确时间点</p>
          </div>
          <CalendarDays size={19} />
        </article>
      </div>

      <button className="reset-button" type="button" onClick={onReset}>
        <RefreshCcw size={17} />
        重置示例记录
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

function buildMonthDays(monthDate: Date, events: CalendarEvent[]) {
  const monthStart = startOfMonth(monthDate);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const todayKey = toLocalDayKey(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getTime() + index * dayMs);
    const key = toLocalDayKey(date);
    return {
      date,
      key,
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
      isToday: key === todayKey,
      events: events.filter((event) => dayKey(event.startsAt) === key)
    };
  });
}

function buildWeekDays(selectedDate: Date, events: CalendarEvent[]) {
  const weekStart = new Date(selectedDate);
  weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getTime() + index * dayMs);
    const key = toLocalDayKey(date);
    return {
      date,
      key,
      events: events.filter((event) => dayKey(event.startsAt) === key)
    };
  });
}

function buildScrollableMonths(monthDate: Date) {
  return Array.from({ length: 13 }, (_, index) => addMonths(monthDate, index - 6));
}

function buildPickerYears(year: number) {
  return Array.from({ length: 11 }, (_, index) => year - 5 + index);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function toLocalDayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dateFromDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatFullDay(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function addHoursIso(iso: string, hours: number) {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}
