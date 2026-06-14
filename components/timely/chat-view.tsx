"use client";

import { Mic, Sparkles } from "lucide-react";
import type { FormEvent } from "react";
import { formatMessageTime } from "@/lib/time";
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
          placeholder={isSubmitting ? "正在记录..." : "记录某个时间点发生的事..."}
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
          <Mic size={22} />
        </button>
      </form>
    </div>
  );
}
