"use client";

import { CalendarDays, Menu, MessageCircle, Settings, Trash2, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { ChatView } from "@/components/timely/chat-view";
import { CalendarView } from "@/components/timely/calendar-view";
import { SettingsView } from "@/components/timely/settings-view";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { resolveEventRecordInput, resolveEventRecordInputWithAi } from "@/lib/event-recording";
import type { AiEventParseResult } from "@/lib/event-recording";
import { initialState } from "@/lib/seed-data";
import { normalizeTimelyState } from "@/lib/state";
import { activeEvents, cancelledEvents, sortEventsByTime } from "@/lib/stats";
import { todayLabel, toShanghaiIso } from "@/lib/time";
import type { AppView, TimelyState } from "@/lib/types";

const STORAGE_KEY = "timely-event-record-state-v1";

const viewLabels: Record<AppView, string> = {
  chat: "对话",
  calendar: "记录",
  settings: "设置"
};

export function TimelyApp() {
  const [state, setState, isReady] = useLocalStorageState<TimelyState>(
    STORAGE_KEY,
    initialState,
    normalizeTimelyState
  );
  const [view, setView] = useState<AppView>("chat");
  const [draft, setDraft] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const visibleEvents = useMemo(() => sortEventsByTime(activeEvents(state.events)), [state.events]);
  const cancelledRecordEvents = useMemo(() => sortEventsByTime(cancelledEvents(state.events)), [state.events]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    if (!text || isSubmitting) {
      return;
    }

    setDraft("");
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
      body: JSON.stringify({ input, now: new Date().toISOString() })
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
  }

  function cancelEvent(eventId: string) {
    updateEventStatus(eventId, "cancelled");
  }

  function restoreEvent(eventId: string) {
    updateEventStatus(eventId, "active");
  }

  function deleteCancelledEvent(eventId: string) {
    setState((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== eventId)
    }));
  }

  function updateEventStatus(eventId: string, status: "active" | "cancelled") {
    const updatedAt = toShanghaiIso(new Date());
    setState((current) => ({
      ...current,
      events: current.events.map((event) => (event.id === eventId ? { ...event, status, updatedAt } : event))
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
              isSubmitting={isSubmitting}
              onSubmit={submitMessage}
            />
          )}
          {view === "calendar" && (
            <CalendarView
              events={visibleEvents}
              cancelledEvents={cancelledRecordEvents}
              onCancel={cancelEvent}
              onRestore={restoreEvent}
              onPermanentDelete={deleteCancelledEvent}
            />
          )}
          {view === "settings" && (
            <SettingsView
              eventCount={visibleEvents.length}
              cancelledCount={cancelledRecordEvents.length}
              hasPendingClarification={Boolean(state.pendingClarification)}
              onReset={resetDemoData}
            />
          )}
        </section>
      </section>
    </main>
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
