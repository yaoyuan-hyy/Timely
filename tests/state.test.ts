import * as assert from "node:assert/strict";
import { normalizeTimelyState } from "../lib/state";
import type { TimelyState } from "../lib/types";

const fallback: TimelyState = {
  events: [],
  reminders: [],
  messages: [],
  pendingClarification: null
};

{
  assert.deepEqual(normalizeTimelyState("{bad json", fallback), fallback);
}

{
  const state = normalizeTimelyState(
    {
      events: [
        {
          id: "event-1",
          title: "会议",
          startsAt: "2026-06-13T15:00:00+08:00",
          status: "active"
        }
      ],
      messages: [
        {
          id: "message-1",
          role: "assistant",
          content: "你好"
        }
      ]
    },
    fallback
  );

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].endsAt, null);
  assert.equal(state.events[0].location, null);
  assert.equal(state.events[0].notes, null);
  assert.equal(state.events[0].sourceText, "");
  assert.equal(state.reminders.length, 0);
  assert.equal(state.messages[0].createdAt, "");
  assert.equal(state.pendingClarification, null);
}
