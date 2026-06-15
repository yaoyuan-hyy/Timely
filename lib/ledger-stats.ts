import type { LedgerEntry } from "./types";
import { toShanghaiDayKey } from "./time";

export type LedgerSummary = {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
};

export type LedgerDayGroup = {
  dayKey: string;
  entries: LedgerEntry[];
};

export type LedgerMonthSummary = {
  monthIndex: number;
  label: string;
  entries: LedgerEntry[];
  entryCount: number;
  summary: LedgerSummary;
};

export function sortLedgerEntriesByTime(entries: LedgerEntry[]) {
  return [...entries].sort(
    (first, second) => new Date(second.occurredAt).getTime() - new Date(first.occurredAt).getTime()
  );
}

export function ledgerEntriesForMonth(entries: LedgerEntry[], monthDate: Date) {
  const targetMonth = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;

  return sortLedgerEntriesByTime(entries).filter((entry) => toShanghaiDayKey(entry.occurredAt).startsWith(targetMonth));
}

export function ledgerEntriesForYear(entries: LedgerEntry[], yearDate: Date) {
  const targetYear = String(yearDate.getFullYear());

  return sortLedgerEntriesByTime(entries).filter((entry) => toShanghaiDayKey(entry.occurredAt).startsWith(targetYear));
}

export function summarizeLedgerEntries(entries: LedgerEntry[]): LedgerSummary {
  return entries.reduce(
    (summary, entry) => {
      if (entry.direction === "income") {
        summary.incomeCents += entry.amountCents;
      } else {
        summary.expenseCents += entry.amountCents;
      }

      summary.netCents = summary.incomeCents - summary.expenseCents;
      return summary;
    },
    {
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0
    }
  );
}

export function summarizeLedgerEntriesByMonth(entries: LedgerEntry[], yearDate: Date): LedgerMonthSummary[] {
  const year = yearDate.getFullYear();

  return Array.from({ length: 12 }, (_, monthIndex) => {
    const monthDate = new Date(year, monthIndex, 1);
    const monthEntries = ledgerEntriesForMonth(entries, monthDate);

    return {
      monthIndex,
      label: `${monthIndex + 1}月`,
      entries: monthEntries,
      entryCount: monthEntries.length,
      summary: summarizeLedgerEntries(monthEntries)
    };
  });
}

export function groupLedgerEntriesByDay(entries: LedgerEntry[]): LedgerDayGroup[] {
  const groups = new Map<string, LedgerEntry[]>();

  for (const entry of sortLedgerEntriesByTime(entries)) {
    const key = toShanghaiDayKey(entry.occurredAt);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return Array.from(groups, ([dayKey, groupEntries]) => ({
    dayKey,
    entries: groupEntries
  }));
}

export function formatLedgerAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}
