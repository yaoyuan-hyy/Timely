// Run against a local Next server after configuring .env.local. Never print the token.
import assert from "node:assert/strict";
const baseUrl = process.env.TIMELY_TEST_URL || "http://localhost:3000";
const now = "2026-09-05T10:00:00+08:00";
const cases = [
  { input: "明天下午三点看牙", intent: "create_event", check: result => assert.equal(result.startsAt, "2026-09-06T15:00:00+08:00") },
  { input: "今天午饭花了38", intent: "create_ledger", check: result => assert.equal(result.amountCents, 3800) },
  { input: "买了个抽湿机", intent: "needs_clarification", check: result => assert.equal(result.clarificationQuestion, "金额是多少？") },
  { input: "下午三点", pendingClarification: { kind: "event_time", title: "看牙", sourceText: "明天看牙", createdAt: Date.parse(now) }, intent: "create_event", check: result => { assert.equal(result.title, "看牙"); assert.equal(result.startsAt, "2026-09-06T15:00:00+08:00"); } }
];
let failures = 0;
for (const item of cases) {
  try {
  const response = await fetch(`${baseUrl}/api/record-input`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: item.input, now, pendingClarification: item.pendingClarification }),
    signal: AbortSignal.timeout(25000)
  });
  assert.equal(response.status, 200, `API status ${response.status}; check server configuration`);
  const { result } = await response.json();
  assert.equal(result.intent, item.intent, item.input);
  item.check(result);
  console.log(`PASS ${item.input}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${item.input}: ${error instanceof Error ? error.message : "request failed"}`);
  }
}
if (failures) process.exitCode = 1;
