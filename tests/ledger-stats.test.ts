import * as assert from "node:assert/strict";
import {
  groupLedgerEntriesByDay,
  ledgerEntriesForMonth,
  ledgerEntriesForYear,
  summarizeLedgerEntriesByMonth,
  sortLedgerEntriesByTime,
  summarizeLedgerEntries
} from "../lib/ledger-stats";
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
    note: null,
    sourceText: "午饭花了38",
    createdAt: "2026-06-15T12:10:00+08:00",
    updatedAt: "2026-06-15T12:10:00+08:00"
  },
  {
    id: "ledger-2",
    direction: "income",
    amountCents: 1200000,
    currency: "CNY",
    category: "工资",
    occurredAt: "2026-06-14T09:00:00+08:00",
    counterparty: null,
    note: null,
    sourceText: "收到工资12000",
    createdAt: "2026-06-14T09:00:00+08:00",
    updatedAt: "2026-06-14T09:00:00+08:00"
  },
  {
    id: "ledger-3",
    direction: "expense",
    amountCents: 2650,
    currency: "CNY",
    category: "交通",
    occurredAt: "2026-05-31T22:00:00+08:00",
    counterparty: null,
    note: null,
    sourceText: "打车26.5",
    createdAt: "2026-05-31T22:00:00+08:00",
    updatedAt: "2026-05-31T22:00:00+08:00"
  }
];

{
  const sorted = sortLedgerEntriesByTime(entries);
  assert.deepEqual(
    sorted.map((entry) => entry.id),
    ["ledger-1", "ledger-2", "ledger-3"]
  );
}

{
  const monthEntries = ledgerEntriesForMonth(entries, new Date("2026-06-15T12:10:00+08:00"));
  assert.deepEqual(
    monthEntries.map((entry) => entry.id),
    ["ledger-1", "ledger-2"]
  );
}

{
  const summary = summarizeLedgerEntries(entries);
  assert.deepEqual(summary, {
    incomeCents: 1200000,
    expenseCents: 6450,
    netCents: 1193550
  });
}

{
  const groups = groupLedgerEntriesByDay(entries);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].dayKey, "2026-06-15");
  assert.equal(groups[0].entries[0].id, "ledger-1");
  assert.equal(groups[1].dayKey, "2026-06-14");
  assert.equal(groups[2].dayKey, "2026-05-31");
}

{
  const yearEntries = ledgerEntriesForYear(entries, new Date("2026-06-15T12:10:00+08:00"));
  assert.deepEqual(
    yearEntries.map((entry) => entry.id),
    ["ledger-1", "ledger-2", "ledger-3"]
  );
}

{
  const months = summarizeLedgerEntriesByMonth(entries, new Date("2026-06-15T12:10:00+08:00"));
  assert.equal(months.length, 12);
  assert.equal(months[4].monthIndex, 4);
  assert.equal(months[4].label, "5月");
  assert.equal(months[4].summary.expenseCents, 2650);
  assert.equal(months[4].entryCount, 1);
  assert.equal(months[5].monthIndex, 5);
  assert.equal(months[5].label, "6月");
  assert.equal(months[5].summary.incomeCents, 1200000);
  assert.equal(months[5].summary.expenseCents, 3800);
  assert.equal(months[5].entryCount, 2);
}
