import * as assert from "node:assert/strict";
import { addLedgerEntry, deleteLedgerEntry, updateLedgerEntryDetails } from "../lib/ledger-state";
import type { LedgerEntry } from "../lib/types";

const entries: LedgerEntry[] = [
  {
    id: "ledger-1",
    direction: "expense",
    amountCents: 3800,
    currency: "CNY",
    category: "餐饮",
    occurredAt: "2026-06-15T12:10:00+08:00",
    counterparty: null,
    note: "午饭",
    sourceText: "午饭花了38",
    createdAt: "2026-06-15T12:10:00+08:00",
    updatedAt: "2026-06-15T12:10:00+08:00"
  },
  {
    id: "ledger-2",
    direction: "expense",
    amountCents: 28000,
    currency: "CNY",
    category: "购物",
    occurredAt: "2026-05-29T16:06:00+08:00",
    counterparty: null,
    note: "抽湿机",
    sourceText: "抽湿机280",
    createdAt: "2026-05-29T16:06:00+08:00",
    updatedAt: "2026-05-29T16:06:00+08:00"
  }
];

{
  const nextEntries = addLedgerEntry(entries, {
    id: "ledger-manual",
    direction: "income",
    amountCents: 120000,
    category: " 奖金 ",
    occurredAt: "2026-06-15T18:30:00+08:00",
    note: null,
    sourceText: "手动添加收入流水",
    createdAt: "2026-06-15T18:30:00+08:00"
  });

  assert.equal(nextEntries.length, 3);
  assert.equal(nextEntries[0].id, "ledger-manual");
  assert.equal(nextEntries[0].category, "奖金");
  assert.equal(nextEntries[0].direction, "income");
  assert.equal(nextEntries[0].currency, "CNY");
  assert.equal(nextEntries[0].updatedAt, "2026-06-15T18:30:00+08:00");
  assert.equal(entries.length, 2);
}

{
  const nextEntries = deleteLedgerEntry(entries, "ledger-1");

  assert.deepEqual(
    nextEntries.map((entry) => entry.id),
    ["ledger-2"]
  );
  assert.equal(entries.length, 2);
}

{
  const nextEntries = updateLedgerEntryDetails(entries, "ledger-2", {
    amountCents: 29900,
    category: " 家居 ",
    updatedAt: "2026-06-15T18:20:00+08:00"
  });
  const updated = nextEntries.find((entry) => entry.id === "ledger-2");
  const untouched = nextEntries.find((entry) => entry.id === "ledger-1");

  assert.equal(updated?.amountCents, 29900);
  assert.equal(updated?.category, "家居");
  assert.equal(updated?.updatedAt, "2026-06-15T18:20:00+08:00");
  assert.equal(updated?.note, "抽湿机");
  assert.equal(untouched, entries[0]);
}

{
  const nextEntries = updateLedgerEntryDetails(entries, "missing", {
    amountCents: 9900,
    category: "交通",
    updatedAt: "2026-06-15T18:20:00+08:00"
  });

  assert.deepEqual(nextEntries, entries);
}
