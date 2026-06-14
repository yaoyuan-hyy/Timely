import * as assert from "node:assert/strict";
import {
  formatShanghaiDate,
  formatShanghaiTime,
  isValidShanghaiDateParts,
  toShanghaiDayKey,
  toShanghaiIso
} from "../lib/time";

{
  const midnightEvent = "2026-06-13T00:30:00+08:00";

  assert.equal(toShanghaiDayKey(midnightEvent), "2026-06-13");
  assert.equal(formatShanghaiTime(midnightEvent), "00:30");
  assert.equal(formatShanghaiDate(midnightEvent), "6/13");
}

{
  const utcDate = new Date("2026-06-12T16:30:00Z");

  assert.equal(toShanghaiIso(utcDate), "2026-06-13T00:30:00+08:00");
}

{
  assert.equal(isValidShanghaiDateParts(2026, 6, 30), true);
  assert.equal(isValidShanghaiDateParts(2026, 6, 31), false);
}
