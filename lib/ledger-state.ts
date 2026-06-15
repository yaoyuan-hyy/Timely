import type { LedgerDirection, LedgerEntry } from "./types";

export type LedgerEntryCreateInput = {
  id: string;
  direction: LedgerDirection;
  amountCents: number;
  category: string;
  occurredAt: string;
  note: string | null;
  sourceText: string;
  createdAt: string;
};

export type LedgerEntryDetailsUpdate = {
  amountCents: number;
  category: string;
  updatedAt: string;
};

export function deleteLedgerEntry(entries: LedgerEntry[], entryId: string) {
  return entries.filter((entry) => entry.id !== entryId);
}

export function addLedgerEntry(entries: LedgerEntry[], input: LedgerEntryCreateInput) {
  const entry: LedgerEntry = {
    id: input.id,
    direction: input.direction,
    amountCents: input.amountCents,
    currency: "CNY",
    category: input.category.trim() || "未分类",
    occurredAt: input.occurredAt,
    counterparty: null,
    note: input.note,
    sourceText: input.sourceText,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };

  return [entry, ...entries];
}

export function updateLedgerEntryDetails(
  entries: LedgerEntry[],
  entryId: string,
  update: LedgerEntryDetailsUpdate
) {
  return entries.map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          amountCents: update.amountCents,
          category: update.category.trim() || "未分类",
          updatedAt: update.updatedAt
        }
      : entry
  );
}
