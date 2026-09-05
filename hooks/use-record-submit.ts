"use client";

import { useCallback, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { AiRecordParseResult } from "@/lib/record-input";
import { recordResultSchema } from "@/lib/record-result-schema";
import { confirmRecordDraft, discardRecordDraft, stageRecordResult } from "@/lib/record-draft";
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const retryInput = useRef<{ text: string; clarification: TimelyState["pendingClarification"] } | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const cancelSubmission = useCallback(() => {
    requestVersion.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setIsSubmitting(false);
    setSubmitError(null);
    setFallbackNotice(null);
  }, []);
  const confirmPending = useCallback(() => {
    setState(confirmRecordDraft);
    setFallbackNotice(null);
  }, [setState]);
  const discardPending = useCallback(() => {
    setState(discardRecordDraft);
    setFallbackNotice(null);
  }, [setState]);
  const editPending = useCallback(() => {
    if (!state.pendingConfirmation) return;
    setDraft(state.pendingConfirmation.input);
    setState(current => ({ ...current, pendingClarification: current.pendingConfirmation?.clarification ?? null, pendingConfirmation: null }));
    setFallbackNotice(null);
  }, [setDraft, setState, state.pendingConfirmation]);

  const submitText = useCallback(
    async (text: string, base = state) => {
      if (!text || activeRequest.current) {
        return;
      }

      const controller = new AbortController();
      activeRequest.current = controller;
      const version = ++requestVersion.current;
      setDraft("");
      setSubmitError(null);
      setFallbackNotice(null);
      setIsSubmitting(true);

      try {
        const now = new Date();
        const { proposeRecordInput } = await import("@/lib/record-session");
        const result = await proposeRecordInput(base, text, {
          now,
          parseRecordInput: (input, context) => requestAiRecordParse(input, context, controller.signal)
        });
        if (version === requestVersion.current) {
          if (result.usedFallback) {
            retryInput.current = { text, clarification: base.pendingClarification };
            setFallbackNotice("AI 暂时不可用，已使用本地识别，请核对结果。");
          }
          setState(current => {
            if (version !== requestVersion.current) return current;
            return stageRecordResult(current, base, result.state, text);
          });
        }
      } catch {
        if (version === requestVersion.current) {
          setDraft(current => current || text);
          setSubmitError("这次没能保存，请再试一次。");
        }
      } finally {
        if (version === requestVersion.current) {
          activeRequest.current = null;
          setIsSubmitting(false);
        }
      }
    },
    [setDraft, setState, state]
  );
  const submitMessage = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitText(draft.trim());
  }, [draft, submitText]);
  const retrySubmission = useCallback(() => {
    const retry = retryInput.current;
    if (!retry || activeRequest.current) return;
    setState(current => ({ ...current, pendingConfirmation: null }));
    void submitText(retry.text, { ...state, pendingConfirmation: null, pendingClarification: retry.clarification });
  }, [state, setState, submitText]);

  return {
    isSubmitting,
    submitMessage,
    cancelSubmission,
    submitError,
    fallbackNotice,
    retrySubmission,
    editPending,
    confirmPending,
    discardPending
  };
}

async function requestAiRecordParse(input: string, context: { now: Date; pendingClarification?: TimelyState["pendingClarification"] }, signal: AbortSignal): Promise<AiRecordParseResult> {
  const response = await fetch("/api/record-input", {
    method: "POST",
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ input, now: context.now.toISOString(), pendingClarification: context.pendingClarification })
  });

  if (!response.ok) {
    throw new Error("AI record parsing failed");
  }

  const data = (await response.json()) as { result?: unknown };
  return recordResultSchema.parse(data.result);
}
