"use client";

import { useCallback, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { resolveRecordInput, resolveRecordInputWithAi } from "@/lib/record-input";
import type { AiRecordParseResult } from "@/lib/record-input";
import type { TimelyState } from "@/lib/types";

export function useRecordSubmit({
  state,
  setState,
  draft,
  setDraft
}: {
  state: TimelyState;
  setState: Dispatch<SetStateAction<TimelyState>>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const text = draft.trim();
      if (!text || isSubmitting) {
        return;
      }

      setDraft("");
      setIsSubmitting(true);

      try {
        const aiResult = await requestAiRecordParse(text);
        setState((current) => resolveRecordInputWithAi(current, text, aiResult));
      } catch {
        setState((current) => resolveRecordInput(current, text));
      } finally {
        setIsSubmitting(false);
      }
    },
    [draft, isSubmitting, setDraft, setState]
  );

  void state;

  return {
    isSubmitting,
    submitMessage
  };
}

async function requestAiRecordParse(input: string): Promise<AiRecordParseResult> {
  const response = await fetch("/api/record-input", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ input, now: new Date().toISOString() })
  });

  if (!response.ok) {
    throw new Error("AI record parsing failed");
  }

  const data = (await response.json()) as { result?: unknown };
  if (!isAiRecordParseResult(data.result)) {
    throw new Error("AI record parsing returned invalid result");
  }

  return data.result;
}

function isAiRecordParseResult(value: unknown): value is AiRecordParseResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const result = value as Partial<AiRecordParseResult>;
  return (
    result.intent === "create_event" ||
    result.intent === "delete_event" ||
    result.intent === "create_ledger" ||
    result.intent === "needs_clarification" ||
    result.intent === "unsupported"
  );
}
