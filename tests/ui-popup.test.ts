import * as assert from "node:assert/strict";
import test from "node:test";
import { buildUiPopupMessage, extractUiPopupFromMessage, stripUiPopupBlock } from "../lib/ui-popup";

test("UI_POPUP messages can be built, parsed, and stripped", () => {
  const content = buildUiPopupMessage("我查到 1 条安排。", {
    type: "timely_query_result",
    query_kind: "schedule",
    query_status: "success",
    title: "明日安排",
    summary: "找到 1 条安排",
    time_range: {
      label: "明天",
      from: "2026-07-01T00:00:00+08:00",
      to: "2026-07-01T23:59:59+08:00"
    },
    metrics: [],
    events: [
      {
        id: "event-1",
        title: "产品评审",
        startsAt: "2026-07-01T15:00:00+08:00",
        location: null,
        notes: null
      }
    ],
    ledger: {
      entries: [],
      totalExpenseCents: 0,
      totalIncomeCents: 0,
      netCents: 0
    }
  });

  assert.match(content, /```json UI_POPUP/);
  assert.equal(stripUiPopupBlock(content), "我查到 1 条安排。");

  const popup = extractUiPopupFromMessage(content);
  assert.equal(popup?.query_kind, "schedule");
  assert.equal(popup?.events[0].title, "产品评审");
});
