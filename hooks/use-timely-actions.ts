"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { addLedgerEntry, deleteLedgerEntry, updateLedgerEntryDetails } from "@/lib/ledger-state";
import { createLocalId } from "@/lib/local-id";
import { toShanghaiIso } from "@/lib/time";
import type { LedgerDirection, TimelyState } from "@/lib/types";

type ManualLedgerEntryInput = {
  direction: LedgerDirection;
  amountCents: number;
  category: string;
  note: string | null;
};

export function useTimelyActions(state: TimelyState, setState: Dispatch<SetStateAction<TimelyState>>) {
  const updateEventStatus = useCallback(
    (eventId: string, status: "active" | "cancelled") => {
      const updatedAt = toShanghaiIso(new Date());
      setState((current) => ({
        ...current,
        events: current.events.map((event) => (event.id === eventId ? { ...event, status, updatedAt } : event))
      }));
    },
    [setState]
  );

  const cancelEvent = useCallback(
    (eventId: string) => {
      updateEventStatus(eventId, "cancelled");
    },
    [updateEventStatus]
  );

  const restoreEvent = useCallback(
    (eventId: string) => {
      updateEventStatus(eventId, "active");
    },
    [updateEventStatus]
  );

  const deleteCancelledEvent = useCallback(
    (eventId: string) => {
      setState((current) => ({
        ...current,
        events: current.events.filter((event) => event.id !== eventId)
      }));
    },
    [setState]
  );

  const deleteLedgerEntryRecord = useCallback(
    (entryId: string) => {
      setState((current) => ({
        ...current,
        ledgerEntries: deleteLedgerEntry(current.ledgerEntries, entryId)
      }));
    },
    [setState]
  );

  const addLedgerEntryRecord = useCallback(
    (input: ManualLedgerEntryInput) => {
      const createdAt = toShanghaiIso(new Date());
      const directionLabel = input.direction === "income" ? "收入" : "支出";

      setState((current) => ({
        ...current,
        ledgerEntries: addLedgerEntry(current.ledgerEntries, {
          id: createLocalId("ledger"),
          direction: input.direction,
          amountCents: input.amountCents,
          category: input.category,
          occurredAt: createdAt,
          note: input.note,
          sourceText: `手动添加${directionLabel}流水`,
          createdAt
        })
      }));
    },
    [setState]
  );

  const updateLedgerEntryRecord = useCallback(
    (entryId: string, update: { amountCents: number; category: string }) => {
      const updatedAt = toShanghaiIso(new Date());
      setState((current) => ({
        ...current,
        ledgerEntries: updateLedgerEntryDetails(current.ledgerEntries, entryId, {
          ...update,
          updatedAt
        })
      }));
    },
    [setState]
  );

  void state;

  return {
    cancelEvent,
    restoreEvent,
    deleteCancelledEvent,
    addLedgerEntryRecord,
    deleteLedgerEntryRecord,
    updateLedgerEntryRecord
  };
}
