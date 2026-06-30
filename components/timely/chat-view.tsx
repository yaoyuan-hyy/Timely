"use client";

import { CalendarDays, Mic, ReceiptText, Sparkles, X } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { formatMessageTime } from "@/lib/time";
import { extractUiPopupFromMessage, stripUiPopupBlock } from "@/lib/ui-popup";
import type { ConversationMessage } from "@/lib/types";

export function ChatView({
  messages,
  draft,
  setDraft,
  isSubmitting,
  onSubmit
}: {
  messages: ConversationMessage[];
  draft: string;
  setDraft: (value: string) => void;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasConversation = messages.length > 0;
  const [closedPopupMessageId, setClosedPopupMessageId] = useState<string | null>(null);
  const latestPopup = useMemo(() => findLatestPopup(messages), [messages]);
  const activePopup = latestPopup && latestPopup.messageId !== closedPopupMessageId ? latestPopup : null;

  return (
    <div className="view-stack chat-view">
      {hasConversation ? (
        <div className="message-list" aria-live="polite">
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

      <form className="composer-shell" onSubmit={onSubmit}>
        <div className="composer">
          <input
            aria-label="输入要记录的内容"
            placeholder={isSubmitting ? "正在记录..." : "记录日程或流水..."}
            value={draft}
            disabled={isSubmitting}
            onChange={(event) => setDraft(event.target.value)}
          />
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
