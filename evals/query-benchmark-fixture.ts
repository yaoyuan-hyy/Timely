import { queryFixture } from "./query-fixture";
export function benchmarkFixture() {
  const state = queryFixture();
  state.events.push({ ...state.events[0], id: "review", title: "产品评审", startsAt: "2026-09-07T14:00:00+08:00" });
  state.events.push({ ...state.events[0], id: "october", title: "旅行", startsAt: "2026-10-01T09:00:00+08:00" });
  const entry = state.ledgerEntries[0];
  state.ledgerEntries.push(
    { ...entry, id: "transport", category: "交通", occurredAt: "2026-08-20T12:00:00+08:00", amountCents: 2600 },
    { ...entry, id: "salary", category: "工资", direction: "income", occurredAt: "2026-08-10T12:00:00+08:00", amountCents: 100000 },
    { ...entry, id: "yesterday", occurredAt: "2026-09-05T12:00:00+08:00", amountCents: 1250 },
    { ...entry, id: "yesterday-refund", direction: "income", occurredAt: "2026-09-05T15:00:00+08:00", amountCents: 250 }
  );
  return state;
}
