import assert from "node:assert/strict";
import test from "node:test";
import { parseDeepSeekRecordInput as parseRecord } from "../server/ai/deepseek-record-parser";

const result = { intent: "needs_clarification", direction: "expense", amountCents: null, currency: "CNY", category: "家电", occurredAt: "2026-05-07T12:10:00+08:00", counterparty: null, note: "抽湿机", clarificationQuestion: "金额是多少？" };

test("provider uses DeepSeek and preserves ledger clarification fields", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  let requestBody: Record<string, unknown> = {};
  let requestUrl = "";
  let requestCache: RequestCache | undefined;
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestCache = init?.cache;
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] });
  };
  try {
    const parsed = await parseRecord("买了个抽湿机");
    assert.equal(requestUrl, "https://api.deepseek.com/chat/completions");
    assert.equal(requestCache, "no-store");
    assert.equal(requestBody.model, "deepseek-v4-flash");
    assert.deepEqual(requestBody.response_format, { type: "json_object" });
    assert.deepEqual(requestBody.thinking, { type: "disabled" });
    assert.deepEqual(parsed, result);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("provider carries the pending draft and rejects impossible dates", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  const pending = { kind: "event_time" as const, title: "看牙", sourceText: "明天看牙", createdAt: Date.now() };
  let prompt = "";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    prompt = body.messages.at(-1).content;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ intent: "create_event", title: "看牙", startsAt: "2026-06-31T15:00:00+08:00", endsAt: null, location: null, notes: null, targetDate: null, clarificationQuestion: null }) } }] });
  };
  try {
    await assert.rejects(parseRecord("三点", { pendingClarification: pending }));
    assert.match(prompt, /看牙/);
    assert.match(prompt, /event_time/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});
