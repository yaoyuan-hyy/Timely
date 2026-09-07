import test from "node:test";
import * as assert from "node:assert/strict";
import { parseMoneyText, resolveCalendarDate, type DateExpression } from "../lib/write-values";

test("parseMoneyText strict cases", () => {
  assert.equal(parseMoneyText("35"), 3500);
  assert.equal(parseMoneyText("三十五"), 3500);
  assert.equal(parseMoneyText("人民币三十五元"), 3500);
  assert.equal(parseMoneyText("三十五元五角五分"), 3555);
  assert.equal(parseMoneyText("35.55元"), 3555);
  assert.equal(parseMoneyText("三十五点零五元"), 3505);
  assert.equal(parseMoneyText("一百零五元"), 10500);
  assert.equal(parseMoneyText("9007199254740991.99"), null);
  assert.equal(parseMoneyText("90071992547409.91"), 9007199254740991);
});

test("parseMoneyText rejects malformed or ambiguous input", () => {
  for (const value of [
    "0", "￥0", "-1", "35.555", "2026年6月13日", "下午三点", "35和26",
    "35元26元", "三十五元二十六元", "十十", "一百百", "百千", "五分五角"
  ]) assert.equal(parseMoneyText(value), null, `should reject ${value}`);
});

test("resolveCalendarDate handles absolute, relative, weekday, and Shanghai boundaries", () => {
  const reference = "2024-02-29T23:30:00+08:00";
  const cases: Array<[DateExpression, string | null]> = [
    [{ type: "absolute", year: 2024, month: 2, day: 29 }, "2024-02-29"],
    [{ type: "absolute", year: 2023, month: 2, day: 29 }, null],
    [{ type: "absolute", month: 3, day: 1 }, "2024-03-01"],
    [{ type: "relative_day", offset: 1 }, "2024-03-01"],
    [{ type: "relative_day", offset: -1 }, "2024-02-28"],
    [{ type: "relative_month", offset: 1, day: 31 }, "2024-03-31"],
    [{ type: "relative_month", offset: -1, day: 29 }, "2024-01-29"],
    [{ type: "weekday", weekOffset: 0, day: 4 }, "2024-02-29"],
    [{ type: "weekday", weekOffset: 1, day: 1 }, "2024-03-04"],
    [{ type: "weekday", weekOffset: -1, day: 7 }, "2024-02-25"]
  ];
  for (const [expression, expected] of cases) assert.equal(resolveCalendarDate(expression, reference), expected);
  assert.equal(resolveCalendarDate({ type: "absolute", month: 6, day: 31 }, "2026-01-01T00:00:00+08:00"), null);
  assert.equal(resolveCalendarDate({ type: "relative_month", offset: 1, day: 31 }, "2024-01-31T00:00:00+08:00"), null);
  assert.equal(resolveCalendarDate({ type: "relative_month", offset: -1, day: 31 }, "2024-01-15T00:00:00+08:00"), "2023-12-31");
  assert.equal(resolveCalendarDate({ type: "relative_day", offset: 0 }, "2026-01-01T16:30:00Z"), "2026-01-02");
});
