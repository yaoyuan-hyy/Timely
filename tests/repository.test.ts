import assert from "node:assert/strict";
import test from "node:test";
import { createRecordRepository } from "../lib/repository/record-repository";
import { queryPlanSchema } from "../lib/query-contract";
import { queryFixture } from "../evals/query-fixture";
test("repository snapshots cannot mutate owned or caller records", () => {
  const state = queryFixture(), repo = createRecordRepository(state);
  repo.snapshot().events[0].title = "changed";
  assert.equal(repo.snapshot().events[0].title, "项目会议");
  assert.equal(state.events[0].title, "项目会议");
});
test("single record commits are validated, idempotent and reject stale edits", () => {
  const state = queryFixture(), repo = createRecordRepository(state);
  const record = { ...state.events[0], id: "new" };
  assert.equal(repo.commit({ kind: "event", record }).ok, true);
  assert.equal(repo.commit({ kind: "event", record }).ok, true);
  assert.equal(repo.snapshot().events.filter(e => e.id === "new").length, 1);
  const conflict = repo.commit({ kind: "event", record: { ...record, title: "overwrite" } });
  assert.equal(conflict.ok ? null : conflict.code, "conflict");
  const original = state.events[0];
  assert.equal(repo.commit({ kind: "event", record: { ...original, title: "updated" } }, original).ok, true);
  assert.equal(repo.commit({ kind: "event", record: { ...original, title: "updated" } }, original).ok, true);
  assert.equal(repo.commit({ kind: "event", record: { ...original, title: "stale" } }, original).ok, false);
  assert.equal(repo.commit({ kind: "event", record: { ...record, startsAt: "2026-06-31T12:00:00+08:00" } }).ok, false);
});
test("query contract rejects reversed dates, extra instructions and mismatched filters", () => {
  const plan = { version: 1, kind: "schedule", timeRange: { label: "一天", from: "2026-09-07T00:00:00+08:00", to: "2026-09-07T23:59:59+08:00" }, title: null, category: null, direction: null };
  assert.equal(queryPlanSchema.safeParse(plan).success, true);
  assert.equal(queryPlanSchema.safeParse({ ...plan, direction: "income" }).success, false);
  assert.equal(queryPlanSchema.safeParse({ ...plan, deleteAll: true }).success, false);
  assert.equal(queryPlanSchema.safeParse({ ...plan, timeRange: { ...plan.timeRange, to: "2026-09-06T00:00:00Z" } }).success, false);
});
