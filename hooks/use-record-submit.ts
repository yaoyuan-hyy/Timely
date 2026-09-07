"use client";

import { useCallback, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { AiRecordParseResult } from "@/lib/record-input";
import { recordResultSchema } from "@/lib/record-result-schema";
import { confirmRecordDraft, discardRecordDraft, stageRecordResult } from "@/lib/record-draft";
import type { TimelyState } from "@/lib/types";
import { inputDecisionSchema } from "@/lib/write-contract";
import type { WriteContext } from "@/lib/write-contract";
import { stageInputSession } from "@/lib/write-session";

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
  const retryInput = useRef<{ text: string; now: string; base: TimelyState; expected: string } | null>(null);
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
    if (state.writeSession?.draft) {
      setDraft("");
      setFallbackNotice(null);
      return;
    }
    if (!state.pendingConfirmation) return;
    setDraft(state.pendingConfirmation.input);
    setState(current => ({ ...current, pendingClarification: current.pendingConfirmation?.clarification ?? null, pendingConfirmation: null }));
    setFallbackNotice(null);
  }, [setDraft, setState, state.pendingConfirmation, state.writeSession]);

  const submitText = useCallback(
    async (text: string, base = state, referenceNow = new Date(), stageBase = base) => {
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
        const now = referenceNow;
        const { proposeRecordInput } = await import("@/lib/record-session");
        const result = await proposeRecordInput(base, text, {
          now,
          parseInputDecision: (input, context) => requestInputDecision(input, context, controller.signal)
        });
        if (version === requestVersion.current) {
          if ("protocol" in result && (result.source === "failed" || result.usedFallback)) {
            retryInput.current = { text, now: now.toISOString(), base, expected: sessionVersion(result.state) };
            setFallbackNotice(result.source === "failed" ? "这次识别未完成，记录未写入。可以重试原输入。" : "已使用本地补充规则，请核对结果。你也可以重试 AI。" );
          }
          setState(current => {
            if (version !== requestVersion.current) return current;
            return "protocol" in result ? stageInputSession(current, stageBase, result.state) : stageRecordResult(current, base, result.state, text);
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
    if (sessionVersion(state) !== retry.expected) {
      setFallbackNotice("草稿已经变化，请重新输入，不能重放旧的修改。");
      return;
    }
    const retryBase = { ...state, writeSession: retry.base.writeSession, pendingConfirmation: retry.base.pendingConfirmation };
    void submitText(retry.text, retryBase, new Date(retry.now), state);
  }, [state, submitText]);

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

export async function requestAiRecordParse(input: string, context: { now: Date; pendingClarification?: TimelyState["pendingClarification"] }, signal: AbortSignal): Promise<AiRecordParseResult> {
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

function sessionVersion(state: TimelyState) {
  return JSON.stringify([state.writeSession ?? null, state.pendingConfirmation ?? null]);
}

async function requestInputDecision(input: string, context: { now: Date; pending: WriteContext }, signal: AbortSignal) {
  const response = await fetch("/api/input-decision", {
    method: "POST", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, now: context.now.toISOString(), pending: context.pending })
  });
  const body = await response.json();
  if (!response.ok) throw Error(body?.error === "invalid_decision" ? "invalid_decision" : "provider_unavailable");
  return inputDecisionSchema.parse(body.result);
}
