import * as assert from "node:assert/strict";
import { resolveEventRecordInput, resolveEventRecordInputWithAi } from "../lib/event-recording";
import type { TimelyState } from "../lib/types";

function emptyState(): TimelyState {
  return {
    events: [],
    reminders: [],
    ledgerEntries: [],
    messages: [],
    pendingClarification: null
  };
}

function deterministicIds() {
  let next = 0;
  return (prefix: string) => `${prefix}-${++next}`;
}

function assertEventTimeClarification(state: TimelyState, title: string) {
  assert.equal(state.pendingClarification?.kind, "event_time");
  if (state.pendingClarification?.kind !== "event_time") {
    throw new Error("Expected event time clarification");
  }
  assert.equal(state.pendingClarification.title, title);
}

const now = new Date("2026-06-10T10:00:00+08:00");
const sunday = new Date("2026-06-14T10:00:00+08:00");
const monday = new Date("2026-06-15T09:00:00+08:00");

function stateWithEvent(): TimelyState {
  return {
    ...emptyState(),
    events: [
      {
        id: "event-meeting",
        title: "会议",
        startsAt: "2026-06-13T15:00:00+08:00",
        endsAt: null,
        location: null,
        notes: null,
        status: "active",
        sourceText: "帮我记录一下6月13日下午3点开会",
        createdAt: "2026-06-10T10:00:00+08:00",
        updatedAt: "2026-06-10T10:00:00+08:00"
      }
    ]
  };
}

function stateWithFutureMeeting(): TimelyState {
  return {
    ...emptyState(),
    events: [
      {
        id: "event-future-meeting",
        title: "会议",
        startsAt: "2026-06-20T16:00:00+08:00",
        endsAt: null,
        location: null,
        notes: null,
        status: "active",
        sourceText: "帮我加一个周六的会议 下午四点",
        createdAt: "2026-06-14T10:00:00+08:00",
        updatedAt: "2026-06-14T10:00:00+08:00"
      }
    ]
  };
}

function stateWithTomorrowSixMeeting(): TimelyState {
  return {
    ...emptyState(),
    events: [
      {
        id: "event-tomorrow-six-meeting",
        title: "会议",
        startsAt: "2026-06-16T18:00:00+08:00",
        endsAt: null,
        location: null,
        notes: null,
        status: "active",
        sourceText: "记录明天下午六点有个会议",
        createdAt: "2026-06-15T09:00:00+08:00",
        updatedAt: "2026-06-15T09:00:00+08:00"
      }
    ]
  };
}

function stateWithTwoTomorrowMeetings(): TimelyState {
  return {
    ...emptyState(),
    events: [
      {
        id: "event-tomorrow-three-meeting",
        title: "会议",
        startsAt: "2026-06-16T15:00:00+08:00",
        endsAt: null,
        location: null,
        notes: null,
        status: "active",
        sourceText: "记录明天下午三点有个会议",
        createdAt: "2026-06-15T09:00:00+08:00",
        updatedAt: "2026-06-15T09:00:00+08:00"
      },
      {
        id: "event-tomorrow-six-meeting",
        title: "会议",
        startsAt: "2026-06-16T18:00:00+08:00",
        endsAt: null,
        location: null,
        notes: null,
        status: "active",
        sourceText: "记录明天下午六点有个会议",
        createdAt: "2026-06-15T09:00:00+08:00",
        updatedAt: "2026-06-15T09:00:00+08:00"
      }
    ]
  };
}

{
  const state = resolveEventRecordInput(emptyState(), "帮我记录一下6月13号下午3点有一个会议", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "会议");
  assert.equal(state.events[0].startsAt, "2026-06-13T15:00:00+08:00");
  assert.equal(state.pendingClarification, null);
  assert.equal(state.messages.at(-1)?.content, "已记录。6月13日 15:00，会议。");
}

{
  const state = resolveEventRecordInput(emptyState(), "帮我记录6月9日下午4点复盘", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "复盘");
  assert.equal(state.events[0].startsAt, "2026-06-09T16:00:00+08:00");
  assert.equal(state.messages.at(-1)?.content, "已记录。6月9日 16:00，复盘。");
}

{
  const state = resolveEventRecordInput(emptyState(), "6月31日下午3点开会", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.events.length, 0);
  assertEventTimeClarification(state, "开会");
  assert.equal(state.messages.at(-1)?.content, "什么时候？");
}

{
  const pending = resolveEventRecordInput(emptyState(), "帮我记录一个会议", {
    createId: deterministicIds(),
    now
  });

  assert.equal(pending.events.length, 0);
  assertEventTimeClarification(pending, "会议");
  assert.equal(pending.messages.at(-1)?.content, "什么时候？");

  const completed = resolveEventRecordInput(pending, "6月13日下午3点", {
    createId: deterministicIds(),
    now
  });

  assert.equal(completed.events.length, 1);
  assert.equal(completed.events[0].title, "会议");
  assert.equal(completed.events[0].startsAt, "2026-06-13T15:00:00+08:00");
  assert.equal(completed.pendingClarification, null);
  assert.equal(completed.messages.at(-1)?.content, "已记录。6月13日 15:00，会议。");
}

{
  const pending = resolveEventRecordInput(emptyState(), "帮我加一个周六的会议", {
    createId: deterministicIds(),
    now
  });

  assert.equal(pending.events.length, 0);
  assertEventTimeClarification(pending, "会议");
  assert.equal(pending.messages.at(-1)?.content, "什么时候？");

  const completed = resolveEventRecordInput(pending, "下午四点", {
    createId: deterministicIds(),
    now
  });

  assert.equal(completed.events.length, 1);
  assert.equal(completed.events[0].title, "会议");
  assert.equal(completed.events[0].startsAt, "2026-06-13T16:00:00+08:00");
  assert.equal(completed.pendingClarification, null);
  assert.equal(completed.messages.at(-1)?.content, "已记录。6月13日 16:00，会议。");
}

{
  const pending = resolveEventRecordInput(emptyState(), "帮我加一个周六的会议", {
    createId: deterministicIds(),
    now: sunday
  });

  assert.equal(pending.events.length, 0);
  assertEventTimeClarification(pending, "会议");
  assert.equal(pending.messages.at(-1)?.content, "什么时候？");

  const completed = resolveEventRecordInput(pending, "下午四点", {
    createId: deterministicIds(),
    now: sunday
  });

  assert.equal(completed.events.length, 1);
  assert.equal(completed.events[0].title, "会议");
  assert.equal(completed.events[0].startsAt, "2026-06-20T16:00:00+08:00");
  assert.equal(completed.messages.at(-1)?.content, "已记录。6月20日 16:00，会议。");
}

{
  const state = resolveEventRecordInput(emptyState(), "帮我加一个周六的会议 下午四点", {
    createId: deterministicIds(),
    now: sunday
  });

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "会议");
  assert.equal(state.events[0].startsAt, "2026-06-20T16:00:00+08:00");
}

{
  const state = resolveEventRecordInput(emptyState(), "明天下午四点复盘", {
    createId: deterministicIds(),
    now: sunday
  });

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "复盘");
  assert.equal(state.events[0].startsAt, "2026-06-15T16:00:00+08:00");
}

{
  const state = resolveEventRecordInput(emptyState(), "下周三上午十点半产品评审", {
    createId: deterministicIds(),
    now: sunday
  });

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "产品评审");
  assert.equal(state.events[0].startsAt, "2026-06-24T10:30:00+08:00");
}

{
  const state = resolveEventRecordInput(emptyState(), "下个月六号我要去广州，六点的飞机", {
    createId: deterministicIds(),
    now: new Date("2026-06-16T02:37:00+08:00")
  });

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "去广州");
  assert.equal(state.events[0].startsAt, "2026-07-06T06:00:00+08:00");
  assert.equal(state.messages.at(-1)?.content, "已记录。7月6日 06:00，去广州。");
}

{
  const state = resolveEventRecordInput(emptyState(), "下月6号我要去广州，6点的飞机", {
    createId: deterministicIds(),
    now: new Date("2026-06-16T02:37:00+08:00")
  });

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "去广州");
  assert.equal(state.events[0].startsAt, "2026-07-06T06:00:00+08:00");
}

{
  const state = resolveEventRecordInputWithAi(
    emptyState(),
    "我明天下午五点要健身",
    {
      intent: "create_event",
      title: "健身",
      startsAt: "2026-06-15T17:00:00+08:00",
      endsAt: null,
      location: null,
      notes: null,
      clarificationQuestion: null
    },
    {
      createId: deterministicIds(),
      now: sunday
    }
  );

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "健身");
  assert.equal(state.events[0].startsAt, "2026-06-15T17:00:00+08:00");
  assert.equal(state.messages.at(-1)?.content, "已记录。6月15日 17:00，健身。");
}

{
  const state = resolveEventRecordInput(emptyState(), "明天下午3点提醒我取快递", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.events.length, 0);
  assert.equal(state.pendingClarification, null);
  assert.equal(state.messages.at(-1)?.content, "我可以帮你记录事件。");
}

{
  const state = resolveEventRecordInputWithAi(
    emptyState(),
    "帮我记录一下6月13日下午3点开会",
    {
      intent: "create_event",
      title: "开会",
      startsAt: "2026-06-13T15:00:00+08:00",
      endsAt: null,
      location: null,
      notes: null,
      clarificationQuestion: null
    },
    {
      createId: deterministicIds(),
      now
    }
  );

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, "开会");
  assert.equal(state.events[0].startsAt, "2026-06-13T15:00:00+08:00");
  assert.equal(state.messages.at(-1)?.content, "已记录。6月13日 15:00，开会。");
}

{
  const state = resolveEventRecordInputWithAi(
    emptyState(),
    "帮我记录一个会议",
    {
      intent: "unsupported",
      title: null,
      startsAt: null,
      endsAt: null,
      location: null,
      notes: null,
      clarificationQuestion: null
    },
    {
      createId: deterministicIds(),
      now
    }
  );

  assert.equal(state.events.length, 0);
  assertEventTimeClarification(state, "会议");
  assert.equal(state.messages.at(-1)?.content, "什么时候？");
}

{
  const state = resolveEventRecordInput(stateWithEvent(), "帮我删除6月13日的会议", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].status, "cancelled");
  assert.equal(state.events[0].updatedAt, "2026-06-10T10:00:00+08:00");
  assert.equal(state.messages.at(-1)?.content, "已删除。6月13日 15:00，会议。");
}

{
  const state = resolveEventRecordInput(stateWithEvent(), "帮我删除6月14日的会议", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.events[0].status, "active");
  assert.equal(state.messages.at(-1)?.content, "没找到这条记录。");
}

{
  const state = resolveEventRecordInput(stateWithEvent(), "删除会议记录", {
    createId: deterministicIds(),
    now
  });

  assert.equal(state.events[0].status, "cancelled");
  assert.equal(state.messages.at(-1)?.content, "已删除。6月13日 15:00，会议。");
}

{
  const state = resolveEventRecordInput(stateWithTwoTomorrowMeetings(), "删除会议记录", {
    createId: deterministicIds(),
    now: monday
  });

  assert.equal(state.events[0].status, "active");
  assert.equal(state.events[1].status, "active");
  assert.equal(state.pendingClarification?.kind, "event_delete");
  assert.equal(state.messages.at(-1)?.content, "有多条会议记录，请再告诉是哪天几点的。");
}

{
  const state = resolveEventRecordInputWithAi(
    stateWithEvent(),
    "把这周六的会议给我删除了",
    {
      intent: "delete_event",
      title: "会议",
      startsAt: null,
      endsAt: null,
      location: null,
      notes: null,
      targetDate: "2026-06-13",
      clarificationQuestion: null
    },
    {
      createId: deterministicIds(),
      now
    }
  );

  assert.equal(state.events[0].status, "cancelled");
  assert.equal(state.messages.at(-1)?.content, "已删除。6月13日 15:00，会议。");
}

{
  const state = resolveEventRecordInput(stateWithFutureMeeting(), "帮我把周六下午四点的会议删掉", {
    createId: deterministicIds(),
    now: sunday
  });

  assert.equal(state.events[0].status, "cancelled");
  assert.equal(state.messages.at(-1)?.content, "已删除。6月20日 16:00，会议。");
}

{
  const state = resolveEventRecordInputWithAi(
    stateWithFutureMeeting(),
    "帮我把周六下午四点的会议删掉",
    {
      intent: "delete_event",
      title: "会议",
      startsAt: "2026-06-20T16:00:00+08:00",
      endsAt: null,
      location: null,
      notes: null,
      targetDate: "2026-06-20",
      clarificationQuestion: null
    },
    {
      createId: deterministicIds(),
      now: sunday
    }
  );

  assert.equal(state.events[0].status, "cancelled");
  assert.equal(state.messages.at(-1)?.content, "已删除。6月20日 16:00，会议。");
}

{
  const state = resolveEventRecordInput(stateWithTomorrowSixMeeting(), "删除明天下午的会议记录", {
    createId: deterministicIds(),
    now: monday
  });

  assert.equal(state.events[0].status, "cancelled");
  assert.equal(state.messages.at(-1)?.content, "已删除。6月16日 18:00，会议。");
}

{
  const state = resolveEventRecordInput(stateWithTwoTomorrowMeetings(), "删除明天下午的会议记录", {
    createId: deterministicIds(),
    now: monday
  });

  assert.equal(state.events[0].status, "active");
  assert.equal(state.events[1].status, "active");
  assert.equal(state.pendingClarification?.kind, "event_delete");
  assert.equal(state.pendingClarification?.targetDate, "2026-06-16");
  assert.equal(state.messages.at(-1)?.content, "这天有多条会议记录，请再告诉我是几点的。");
}

{
  const ambiguous = resolveEventRecordInput(stateWithTwoTomorrowMeetings(), "删除明天下午的会议记录", {
    createId: deterministicIds(),
    now: monday
  });
  const state = resolveEventRecordInput(ambiguous, "下午六点", {
    createId: deterministicIds(),
    now: monday
  });

  assert.equal(state.events[0].status, "active");
  assert.equal(state.events[1].status, "cancelled");
  assert.equal(state.pendingClarification, null);
  assert.equal(state.messages.at(-1)?.content, "已删除。6月16日 18:00，会议。");
}
