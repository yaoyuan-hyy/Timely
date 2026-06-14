import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = [
  readFileSync("components/timely-app.tsx", "utf8"),
  readFileSync("components/timely/chat-view.tsx", "utf8"),
  readFileSync("components/timely/calendar-view.tsx", "utf8"),
  readFileSync("components/timely/settings-view.tsx", "utf8")
].join("\n");

assert.match(component, /className="menu-trigger"/);
assert.match(component, /components\/timely\/chat-view/);
assert.match(component, /components\/timely\/calendar-view/);
assert.match(component, /components\/timely\/settings-view/);
assert.match(component, /className="clear-chat-button"/);
assert.match(component, /clearChatHistory/);
assert.match(component, /cancelledEvents/);
assert.match(component, /restoreEvent/);
assert.match(component, /deleteCancelledEvent/);
assert.match(component, /onPermanentDelete/);
assert.match(component, /className=\{`drawer-backdrop/);
assert.match(component, /className=\{`side-drawer/);
assert.match(component, /className="voice-action"/);
assert.match(component, /\/api\/record-event/);
assert.match(component, /resolveEventRecordInputWithAi/);
assert.match(component, /isSubmitting/);
assert.match(component, /className="calendar-month"/);
assert.match(component, /className="year-select"/);
assert.match(component, /className="month-select"/);
assert.match(component, /className="month-grid"/);
assert.match(component, /className="day-detail"/);
assert.match(component, /className="timeline-grid"/);
assert.match(component, /className="cancelled-records"/);
assert.match(component, /彻底删除/);
assert.match(component, /setSelectedDayKey/);
assert.doesNotMatch(component, /buildScrollableMonths/);
assert.doesNotMatch(component, /scrollMonths\.map/);
assert.doesNotMatch(component, /上下滑动浏览月份/);
assert.doesNotMatch(component, /className="calendar-actions"/);
assert.doesNotMatch(component, /className="round-icon-button"/);
assert.doesNotMatch(component, /className="bottom-nav"/);
assert.doesNotMatch(component, /className="sync-badge"/);
