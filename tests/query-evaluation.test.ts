import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateQueries, queryCasesSchema } from "../lib/query-evaluation";
import { queryFixture, queryNow } from "../evals/query-fixture";
import { parseDeepSeekQueryPlan } from "../server/ai/deepseek-query-planner";
import { buildQueryPlan } from "../lib/query-baseline";
const examples = queryCasesSchema.parse(JSON.parse(readFileSync("evals/query-cases.json", "utf8")));
test("rules satisfy the fixed query evaluation and provider fallback never earns model credit", async () => {
  const baseline = await evaluateQueries(examples, queryFixture(), queryNow);
  assert.equal(baseline.planCorrect, examples.length);
  assert.equal(baseline.resultCorrect, examples.length);
  const failed = await evaluateQueries(examples, queryFixture(), queryNow, async () => { throw new Error("offline"); });
  assert.equal(failed.fallbacks, examples.length);
  assert.equal(failed.planCorrect, 0);
  assert.equal(failed.resultCorrect, 0);
  assert.equal(failed.rows.every(row => row.effectiveResultCorrect), true);
});

test("query provider only sends input/time and rejects non-query fields", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-only";
  let invalid = false;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.cache, "no-store");
    const request = JSON.parse(String(init?.body));
    const context = JSON.parse(request.messages.at(-1).content);
    assert.deepEqual(Object.keys(context).sort(), ["input", "now"]);
    const plan = buildQueryPlan("明天的安排", queryNow);
    return Response.json({ choices: [{ message: { content: JSON.stringify(invalid ? { ...plan, records: [] } : plan) } }] });
  };
  try {
    const plan = await parseDeepSeekQueryPlan("明天的安排", { now: queryNow });
    assert.deepEqual(plan, buildQueryPlan("明天的安排", queryNow));
    invalid = true;
    await assert.rejects(parseDeepSeekQueryPlan("明天的安排", { now: queryNow }));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});
