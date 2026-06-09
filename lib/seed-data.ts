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
      title: "体检",
      startsAt: "2026-06-14T09:00:00+08:00",
      endsAt: null,
      location: "社区医院",
      notes: null,
      status: "active",
      sourceText: "6月14日上午体检",
      createdAt: "2026-06-10T09:02:00+08:00",
      updatedAt: "2026-06-10T09:02:00+08:00"
    }
  ],
  reminders: [
    {
      id: "reminder-demo-1",
      title: "会议提醒",
      remindAt: "2026-06-13T14:30:00+08:00",
      relatedEventId: "event-demo-1",
      status: "active",
      sourceText: "6月13日下午3点有个会议，提前半小时提醒我",
      createdAt: "2026-06-10T09:01:00+08:00",
      updatedAt: "2026-06-10T09:01:00+08:00",
      notifiedAt: null
    },
    {
      id: "reminder-demo-2",
      title: "取快递",
      remindAt: "2026-06-11T15:00:00+08:00",
      relatedEventId: null,
      status: "active",
      sourceText: "明天下午3点提醒我取快递",
      createdAt: "2026-06-10T09:03:00+08:00",
      updatedAt: "2026-06-10T09:03:00+08:00",
      notifiedAt: null
    }
  ],
  messages: [
    {
      id: "message-demo-1",
      role: "assistant",
      content: "你好，要记录什么？",
      createdAt: "2026-06-10T09:00:00+08:00"
    }
  ],
  pendingClarification: null
};
