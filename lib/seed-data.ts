import type { TimelyState } from "@/lib/types";

export const initialState: TimelyState = {
  events: [
    {
      id: "event-demo-1",
      title: "会议",
      startsAt: "2026-06-13T15:00:00+08:00",
      endsAt: null,
      location: null,
      notes: "来自示例数据",
      status: "active",
      sourceText: "帮我记录一下6月13号下午3点有一个会议",
      createdAt: "2026-06-10T09:00:00+08:00",
      updatedAt: "2026-06-10T09:00:00+08:00"
    },
    {
      id: "event-demo-2",
      title: "复盘",
      startsAt: "2026-06-09T16:00:00+08:00",
      endsAt: null,
      location: null,
      notes: "过去事件示例",
      status: "active",
      sourceText: "帮我记录6月9日下午4点复盘",
      createdAt: "2026-06-10T09:02:00+08:00",
      updatedAt: "2026-06-10T09:02:00+08:00"
    }
  ],
  reminders: [],
  ledgerEntries: [],
  messages: [
    {
      id: "message-demo-1",
      role: "assistant",
      content: "你好，要记录什么事件？",
      createdAt: "2026-06-10T09:00:00+08:00"
    }
  ],
  pendingClarification: null
};
