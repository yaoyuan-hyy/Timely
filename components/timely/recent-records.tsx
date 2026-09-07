"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, CalendarDays, ReceiptText } from "lucide-react";
import { getRecentRecords, searchRecords, recordTarget } from "@/lib/recent-records";
import { describeRecord } from "@/lib/record-draft";
import type { RecordTarget, TimelyState } from "@/lib/types";

export function RecentRecords({ state, onOpen }: { state: TimelyState; onOpen: (target: RecordTarget) => void }) {
  const [query, setQuery] = useState("");
  const records = useMemo(() => query.trim() ? searchRecords(state, query) : getRecentRecords(state, 5), [state, query]);
  return <details className="recent-records" aria-label="最近记录" open={state.messages.length <= 1 || undefined}>
    <summary>最近记录 <span>查看与搜索</span></summary>
    <input type="search" aria-label="搜索记录" placeholder="搜索事项、地点或流水分类" value={query} onChange={e => setQuery(e.target.value)} />
    {records.length === 0 && <p className="quiet-copy">{query ? "没有找到匹配记录。" : "确认后的日程和流水会出现在这里。"}</p>}
    <div className="recent-record-list">
      {records.map(item => <button type="button" className="recent-record" key={`${item.kind}-${item.record.id}`} onClick={() => onOpen(recordTarget(item.kind, item.record.id, item.kind === "event" ? item.record.startsAt : item.record.occurredAt))}>
        <span className="recent-record-icon" aria-hidden="true">{item.kind === "event" ? <CalendarDays size={18} /> : <ReceiptText size={18} />}</span>
        <span><small>{item.kind === "event" ? "日程" : "流水"}</small><strong>{describeRecord(item)}</strong></span><ArrowUpRight size={16} aria-hidden="true" />
      </button>)}
    </div>
  </details>;
}
