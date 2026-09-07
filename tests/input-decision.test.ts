import assert from "node:assert/strict";
import test from "node:test";
import { parseDeepSeekInputDecision } from "../server/ai/deepseek-input-decision";

test("provider only receives input, time and approved pending context; schema errors are rejected", async () => {
  const oldFetch = globalThis.fetch;
  const key = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.messages.map((m: { role: string }) => m.role), ["system", "user"]);
    const context = JSON.parse(body.messages[1].content);
    assert.deepEqual(Object.keys(context).sort(), ["input", "now", "pending", "timezone"]);
    assert.equal(JSON.stringify(context).includes("private-record"), false);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: "confirm" }) } }] }), { status: 200 });
  };
  try {
    await assert.rejects(() => parseDeepSeekInputDecision("确认", { now: new Date("2026-09-07T10:00:00+08:00"), pending: { draft: null, selection: null, query: null } }));
    await assert.rejects(() => parseDeepSeekInputDecision("查询", { now: new Date(), pending: { draft: null, selection: null, query: null, records: ["private-record"] } as never }));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = oldFetch; if (key === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = key; }
});

test("recovery gets at most one repair using application validation feedback", async () => {
  const oldFetch = globalThis.fetch;
  const key = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  let calls = 0;
  const pending = { draft: null, selection: null, query: null, recovery: { id: "r1", revision: 1, reason: "provider" as const, question: "请补充", expiresAt: Date.parse("2026-09-07T11:00:00+08:00"), turns: [{ id: "t1", input: "昨天午饭", referenceNow: "2026-09-07T10:00:00+08:00" }] } };
  globalThis.fetch = async (_url, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body));
    const body = JSON.parse(payload.messages[1].content);
    if (calls === 2) assert.match(body.validationIssue, /遗漏/);
    assert.equal(payload.messages.length, 2);
    const patch = { amount: { value: "35", evidence: "35" }, direction: { value: "expense", evidence: "花" }, ...(calls === 2 ? { date: { value: { type: "relative_day", offset: -1 }, evidence: "昨天", turnId: "t1" } } : {}) };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: "write", operation: "create", kind: "ledger", recovery: { id: "r1", revision: 1, mode: "continue" }, patch }) } }] }));
  };
  try {
    const result = await parseDeepSeekInputDecision("花35", { now: new Date("2026-09-07T10:01:00+08:00"), pending });
    assert.equal(result.action, "write");
    assert.equal(calls, 2);
  } finally { globalThis.fetch = oldFetch; if (key === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = key; }
});
