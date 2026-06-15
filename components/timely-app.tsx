"use client";

import { CalendarDays, Menu, MessageCircle, ReceiptText, Settings, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ChatView } from "@/components/timely/chat-view";
import { CalendarView } from "@/components/timely/calendar-view";
import { LedgerView } from "@/components/timely/ledger-view";
import { NavButton } from "@/components/timely/nav-button";
import { SettingsView } from "@/components/timely/settings-view";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { useRecordSubmit } from "@/hooks/use-record-submit";
import { useTimelyActions } from "@/hooks/use-timely-actions";
import { initialState } from "@/lib/seed-data";
import { normalizeTimelyState } from "@/lib/state";
import { activeEvents, cancelledEvents, sortEventsByTime } from "@/lib/stats";
import { todayLabel } from "@/lib/time";
import type { AppView, TimelyState } from "@/lib/types";

const STORAGE_KEY = "timely-event-record-state-v1";

export function TimelyApp() {
  const [state, setState, isReady] = useLocalStorageState<TimelyState>(
    STORAGE_KEY,
    initialState,
    normalizeTimelyState
  );
  const [view, setView] = useState<AppView>("chat");
  const [draft, setDraft] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showCancelledRecords, setShowCancelledRecords] = useState(false);
  const { isSubmitting, submitMessage } = useRecordSubmit({ state, setState, draft, setDraft });
  const {
    cancelEvent,
    restoreEvent,
    deleteCancelledEvent,
    addLedgerEntryRecord,
    deleteLedgerEntryRecord,
    updateLedgerEntryRecord
  } = useTimelyActions(state, setState);

  const visibleEvents = useMemo(() => sortEventsByTime(activeEvents(state.events)), [state.events]);
  const cancelledRecordEvents = useMemo(() => sortEventsByTime(cancelledEvents(state.events)), [state.events]);
  const isCalendarView = view === "calendar";
  const isChatView = view === "chat";
  const headerButtonLabel = isCalendarView
    ? showCancelledRecords
      ? "隐藏已取消记录"
      : "显示已取消记录"
    : isChatView
      ? "清空聊天记录"
      : "当前页面暂无顶部操作";
  const isHeaderButtonDisabled = isCalendarView
    ? !isReady
    : !isChatView || !isReady || (state.messages.length === 0 && !state.pendingClarification);

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

  function toggleCancelledRecords() {
    setShowCancelledRecords((current) => !current);
  }

  function handleHeaderAction() {
    if (view === "calendar") {
      toggleCancelledRecords();
      return;
    }

    if (view === "chat") {
      clearChatHistory();
    }
  }

  function selectView(nextView: AppView) {
    setView(nextView);
    if (nextView !== "calendar") {
      setShowCancelledRecords(false);
    }
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
            className={`clear-chat-button ${isCalendarView && showCancelledRecords ? "active" : ""}`}
            type="button"
            title={headerButtonLabel}
            aria-label={headerButtonLabel}
            aria-pressed={view === "calendar" ? showCancelledRecords : undefined}
            disabled={isHeaderButtonDisabled}
            onClick={handleHeaderAction}
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
            <NavButton icon={<ReceiptText size={20} />} view="ledger" activeView={view} onClick={selectView} />
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
              showCancelledRecords={showCancelledRecords}
              onCancel={cancelEvent}
              onRestore={restoreEvent}
              onPermanentDelete={deleteCancelledEvent}
            />
          )}
          {view === "ledger" && (
            <LedgerView
              entries={state.ledgerEntries}
              onAddEntry={addLedgerEntryRecord}
              onDeleteEntry={deleteLedgerEntryRecord}
              onUpdateEntry={updateLedgerEntryRecord}
            />
          )}
          {view === "settings" && (
            <SettingsView
              eventCount={visibleEvents.length}
              cancelledCount={cancelledRecordEvents.length}
              ledgerCount={state.ledgerEntries.length}
              hasPendingClarification={Boolean(state.pendingClarification)}
              onReset={resetDemoData}
            />
          )}
        </section>
      </section>
    </main>
  );
}
