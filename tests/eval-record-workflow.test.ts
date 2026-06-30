import * as assert from "node:assert/strict";
import test from "node:test";
import {
  loadRecordEvalCasesFromText,
  scoreRecordEvalCase,
  summarizeRecordEvalResults
} from "../scripts/eval-record-workflow";

const fixture = [
  JSON.stringify({
    id: "event-create",
    input: "帮我记录一下6月20日下午4点开会",
    now: "2026-06-15T12:10:00+08:00",
    expected: {
      outcome: "event_created",
      event: {
        title: "开会",
        startsAt: "2026-06-20T16:00:00+08:00"
      },
      assistant: "已记录。6月20日 16:00，开会。"
    }
  }),
  JSON.stringify({
    id: "ledger-missing-amount",
    input: "上个月7号买了个抽湿机",
    now: "2026-06-15T12:10:00+08:00",
    expected: {
      outcome: "clarification_requested",
      pendingKind: "ledger_amount",
      assistant: "请问抽湿机花了多少钱？"
    }
  })
].join("\n");

test("record workflow eval cases load from JSONL text", () => {
  const cases = loadRecordEvalCasesFromText(fixture);

  assert.equal(cases.length, 2);
  assert.equal(cases[0].id, "event-create");
  assert.equal(cases[1].expected.pendingKind, "ledger_amount");
});

test("record workflow eval cases score and summarize", async () => {
  const cases = loadRecordEvalCasesFromText(fixture);
  const results = [];

  for (const recordCase of cases) {
    results.push(await scoreRecordEvalCase(recordCase));
  }

  assert.deepEqual(
    results.map((result) => result.passed),
    [true, true]
  );

  const summary = summarizeRecordEvalResults(results);
  assert.equal(summary.total, 2);
  assert.equal(summary.passed, 2);
  assert.equal(summary.passRate, 1);
});
