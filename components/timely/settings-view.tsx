"use client";

import { CalendarDays, Clock3, MessageCircle, ReceiptText, RefreshCcw, ShieldCheck } from "lucide-react";

export function SettingsView({
  eventCount,
  cancelledCount,
  ledgerCount,
  hasPendingClarification,
  onReset
}: {
  eventCount: number;
  cancelledCount: number;
  ledgerCount: number;
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
            <h3>已取消记录</h3>
            <p>{cancelledCount} 个可恢复记录</p>
          </div>
          <RefreshCcw size={19} />
        </article>
        <article className="settings-row">
          <div>
            <h3>本地流水</h3>
            <p>{ledgerCount} 条账目流水</p>
          </div>
          <ReceiptText size={19} />
        </article>
        <article className="settings-row">
          <div>
            <h3>澄清状态</h3>
            <p>{hasPendingClarification ? "等待补充信息" : "没有待补充内容"}</p>
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
