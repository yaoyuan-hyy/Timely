import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runQueryAgentWorkflow } from "../lib/agent/query-workflow";
import { queryFixture, queryNow } from "../evals/query-fixture";
import { buildQueryPlan } from "../lib/query-baseline";
import { createQueryTools } from "../lib/tools/record-tools";
import { createRecordRepository } from "../lib/repository/record-repository";
import { loadStoredState, saveStoredState } from "../lib/repository/state-storage";
import { normalizeTimelyState } from "../lib/state";
const cases = JSON.parse(readFileSync("evals/query-cases.json", "utf8")) as Array<{ id: string; input: string; kind: string; from: string; to: string; eventIds: string[]; ledgerIds: string[]; expense: number; income: number }>;

for (const example of cases) test(`query contract: ${example.id}`, async () => {
  const state = queryFixture();
  const before = structuredClone(state);
  const { queryResult: result } = await runQueryAgentWorkflow(state, example.input, { now: queryNow });
  assert.ok(result);
  assert.equal(result.query_kind, example.kind);
  assert.deepEqual(result.events.map(e => e.id), example.eventIds);
  assert.deepEqual(result.ledger.entries.map(e => e.id), example.ledgerIds);
  assert.equal(result.ledger.totalExpenseCents, example.expense);
  assert.equal(result.ledger.totalIncomeCents, example.income);
  assert.equal(result.time_range.from, example.from);
  assert.equal(result.time_range.to, example.to);
  assert.deepEqual(state, before);
});

test("injected model plans execute against local records and expose their source", async () => {
  const state = queryFixture();
  const result = await runQueryAgentWorkflow(state, "下一天午后的安排", { now: queryNow, parseQueryPlan: async () => buildQueryPlan("明天下午有哪些会议？", queryNow) });
  assert.equal(result.source, "model");
  assert.equal(result.outcome, "query_answered");
  assert.deepEqual(result.queryResult.events.map(e => e.id), ["afternoon"]);
  assert.deepEqual(result.state.events, state.events);
});
test("model errors and illegal write instructions fall back without mutating records", async () => {
  for (const parseQueryPlan of [async () => { throw new Error("provider offline"); }, async () => ({ ...buildQueryPlan("明天的安排", queryNow), deleteAll: true })]) {
    const state = queryFixture();
    const result = await runQueryAgentWorkflow(state, "明天有什么安排？", { now: queryNow, parseQueryPlan });
    assert.equal(result.source, "rules_fallback");
    assert.equal(result.outcome, "query_answered");
    assert.ok(result.fallbackReason);
    assert.equal(result.queryResult.events.length, 3);
    assert.deepEqual(result.state.events, state.events);
  }
});
test("query tools expose no commit capability and reject invalid input", () => {
  const tools = createQueryTools(createRecordRepository(queryFixture()));
  assert.deepEqual(Object.keys(tools), ["queryRecords"]);
  assert.equal(tools.queryRecords({ kind: "delete_event", id: "morning" }).ok, false);
});
test("storage adapter handles malformed old state and quota failures without throwing", () => {
  const fallback = queryFixture();
  const storage = { getItem: () => "broken JSON", setItem: () => { throw new Error("quota"); } };
  const loaded = loadStoredState(storage, "test", fallback, normalizeTimelyState);
  assert.deepEqual(loaded, { ok: true, value: fallback });
  assert.equal(saveStoredState(storage, "test", fallback).ok, false);
  assert.equal(loadStoredState({ ...storage, getItem: () => { throw new Error("denied"); } }, "test", fallback, normalizeTimelyState).ok, false);
});
