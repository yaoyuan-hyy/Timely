"use client";

import { CalendarDays, Mic, ReceiptText, Send, Sparkles, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMessageTime } from "@/lib/time";
import { recordTarget } from "@/lib/recent-records";
import { RecentRecords } from "./recent-records";
import { extractUiPopupFromMessage, stripUiPopupBlock } from "@/lib/ui-popup";
import type { ConversationMessage, PendingConfirmation, RecordTarget, TimelyState } from "@/lib/types";

export function ChatView({
  messages,
  submitError,
  draft,
  setDraft,
  isSubmitting,
  onSubmit,
  pendingConfirmation,
  onConfirmPending,
  onDiscardPending,
  onEditPending,
  fallbackNotice,
  onRetry,
  possibleDuplicate,
  state,
  onOpenRecord
}: {
  messages: ConversationMessage[];
  submitError?: string | null;
  draft: string;
  setDraft: (value: string) => void;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pendingConfirmation?: PendingConfirmation | null;
  onConfirmPending?: () => void;
  onDiscardPending?: () => void;
  onEditPending: () => void;
  fallbackNotice: string | null;
  onRetry: () => void;
  possibleDuplicate: boolean;
  state: TimelyState;
  onOpenRecord: (target: RecordTarget) => void;
}) {
  const hasConversation = messages.length > 0;
  const messageList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight;
  }, [messages.length]);
  const [closedPopupMessageId, setClosedPopupMessageId] = useState<string | null>(null);
  const latestPopup = useMemo(() => findLatestPopup(messages), [messages]);
  const activePopup = latestPopup && latestPopup.messageId !== closedPopupMessageId ? latestPopup : null;

  return (
    <div className="view-stack chat-view">
      {hasConversation ? (
        <div className="message-list" aria-live="polite" ref={messageList}>
          {messages.map((message) => {
            const visibleContent = stripUiPopupBlock(message.content);

            return (
              <article className={`message-bubble ${message.role}`} key={message.id}>
                <p>{visibleContent}</p>
                <time>{formatMessageTime(message.createdAt)}</time>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="home-prompt" aria-label="Timely welcome">
          <Sparkles className="prompt-spark" size={38} />
          <h2>想记录什么，尽管说吧</h2>
        </section>
      )}

      {submitError && <p role="alert">{submitError}</p>}
      {fallbackNotice && <div className="record-notice" role="status"><p>{fallbackNotice}</p><button type="button" disabled={isSubmitting} onClick={onRetry}>重试 AI 识别</button></div>}
      {state.pendingClarification && <p className="quiet-copy" role="status">正在补充上一条记录，请回答刚才的问题。</p>}
      {pendingConfirmation && (
        <section className="record-confirmation" aria-label="确认记录">
          <p>{pendingConfirmation.before ? "准备修改" : "准备记录"}：{pendingConfirmation.summary}</p>
          {possibleDuplicate && <p role="status">已有相同时间和内容的记录，仍要保存一条吗？</p>}
          <div>
            <button type="button" disabled={isSubmitting} onClick={onConfirmPending}>{possibleDuplicate ? "仍然保存" : pendingConfirmation.before ? "确认修改" : "确认记录"}</button>
            <button type="button" disabled={isSubmitting} onClick={onEditPending}>修改</button>
            <button type="button" onClick={onDiscardPending}>取消</button>
          </div>
        </section>
      )}
      <form className="composer-shell" onSubmit={onSubmit}>
        <div className="composer">
          <input
            aria-label="输入要记录的内容"
            placeholder={isSubmitting ? "正在记录..." : "记录日程或流水..."}
            value={draft}
            disabled={isSubmitting || Boolean(pendingConfirmation)}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="send-action" type="submit" aria-label="发送" disabled={isSubmitting || Boolean(pendingConfirmation) || !draft.trim()}><Send size={18} /></button>
          <button
            className="voice-action"
            type="button"
            title="语音输入暂未接入"
            aria-label="语音输入暂未接入"
            aria-pressed="false"
            disabled
          >
            <span className="voice-action-core">
              <Mic size={22} strokeWidth={1.75} />
            </span>
          </button>
        </div>
      </form>
      {!pendingConfirmation && <RecentRecords state={state} onOpen={onOpenRecord} />}

      {activePopup && (
        <div className="query-popup-backdrop" role="presentation">
          <section className="query-popup-panel" role="dialog" aria-modal="true" aria-label={activePopup.payload.title}>
            <div className="query-popup-head">
              <div>
                <p className="eyebrow">{activePopup.payload.time_range.label}</p>
                <h3>{activePopup.payload.title}</h3>
              </div>
              <button
                className="query-popup-close"
                type="button"
                aria-label="关闭查询结果"
                onClick={() => setClosedPopupMessageId(activePopup.messageId)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={`query-popup-status ${activePopup.payload.query_status}`}>
              <p>{activePopup.payload.query_status === "empty" ? "暂无记录" : activePopup.payload.summary}</p>
            </div>

            {activePopup.payload.metrics.length > 0 && (
              <div className="query-popup-metrics" aria-label="查询指标">
                {activePopup.payload.metrics.map((metric) => (
                  <div className="query-popup-metric" key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
            )}

            {activePopup.payload.events.length > 0 && (
              <div className="query-popup-section">
                <div className="query-popup-section-title">
                  <CalendarDays size={16} />
                  <span>日程</span>
                </div>
                {activePopup.payload.events.map((event) => (
                  <article className="query-popup-card" key={event.id}>
                    <strong>{event.title}</strong>
                    <span>{formatMessageTime(event.startsAt)}</span>
                    {event.location && <small>{event.location}</small>}
                    <button type="button" onClick={() => onOpenRecord(recordTarget("event", event.id, event.startsAt))}>在日历中查看</button>
                  </article>
                ))}
              </div>
            )}

            {activePopup.payload.ledger.entries.length > 0 && (
              <div className="query-popup-section">
                <div className="query-popup-section-title">
                  <ReceiptText size={16} />
                  <span>流水</span>
                </div>
                {activePopup.payload.ledger.entries.map((entry) => (
                  <article className="query-popup-card" key={entry.id}>
                    <strong>{entry.category}</strong>
                    <span>{entry.direction === "income" ? "+" : "-"}{formatAmount(entry.amountCents)} 元</span>
                    {entry.note && <small>{entry.note}</small>}
                    <button type="button" onClick={() => onOpenRecord(recordTarget("ledger", entry.id, entry.occurredAt))}>在流水中查看</button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function findLatestPopup(messages: ConversationMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const payload = extractUiPopupFromMessage(message.content);

    if (payload) {
      return {
        messageId: message.id,
        payload
      };
    }
  }

  return null;
}

function formatAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}
