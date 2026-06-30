import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { resolveRecordInput, resolveRecordInputWithAi } from "../record-input";
import type { AiRecordParseResult } from "../record-input";
import type { CalendarEvent, LedgerEntry, TimelyState } from "../types";

type ResolveOptions = {
  now?: Date;
  createId?: (prefix: string) => string;
  pendingClarificationTtlMs?: number;
};

export type RecordWorkflowRoute = "ai_result" | "local_fallback";

export type RecordWorkflowOutcome =
  | "event_created"
  | "event_cancelled"
  | "ledger_created"
  | "clarification_requested"
  | "pending_cancelled"
  | "unsupported"
  | "assistant_reply"
  | "no_change";

export type RecordWorkflowTraceStep =
  | "normalize_input"
  | "call_ai_parser"
  | "apply_ai_result"
  | "apply_local_fallback"
  | "summarize_outcome";

export type ParseRecordInput = (
  input: string,
  context: {
    now: Date;
  }
) => Promise<AiRecordParseResult>;

export type RecordAgentWorkflowOptions = ResolveOptions & {
  parseRecordInput?: ParseRecordInput;
};

export type RecordAgentWorkflowResult = {
  state: TimelyState;
  route: RecordWorkflowRoute;
  outcome: RecordWorkflowOutcome;
  trace: RecordWorkflowTraceStep[];
  aiResult: AiRecordParseResult | null;
  aiError: string | null;
};

const RecordWorkflowAnnotation = Annotation.Root({
  currentState: Annotation<TimelyState>(),
  input: Annotation<string>(),
  normalizedInput: Annotation<string>(),
  now: Annotation<Date>(),
  aiResult: Annotation<AiRecordParseResult | null>(),
  aiError: Annotation<string | null>(),
  route: Annotation<RecordWorkflowRoute | null>(),
  outcome: Annotation<RecordWorkflowOutcome | null>(),
  state: Annotation<TimelyState | null>(),
  trace: Annotation<RecordWorkflowTraceStep[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  })
});

type RecordWorkflowState = typeof RecordWorkflowAnnotation.State;

export function createRecordAgentWorkflow(options: RecordAgentWorkflowOptions = {}) {
  const now = options.now ?? new Date();
  const resolveOptions = buildResolveOptions(options, now);

  async function normalizeInput(state: RecordWorkflowState) {
    return {
      normalizedInput: state.input.trim(),
      trace: ["normalize_input" as const]
    };
  }

  async function callAiParser(state: RecordWorkflowState) {
    if (!options.parseRecordInput || !state.normalizedInput) {
      return {
        aiResult: null,
        aiError: null,
        trace: ["call_ai_parser" as const]
      };
    }

    try {
      const aiResult = await options.parseRecordInput(state.normalizedInput, { now });
      return {
        aiResult,
        aiError: null,
        trace: ["call_ai_parser" as const]
      };
    } catch (error) {
      return {
        aiResult: null,
        aiError: errorMessage(error),
        trace: ["call_ai_parser" as const]
      };
    }
  }

  function applyAiResult(state: RecordWorkflowState) {
    if (!state.aiResult) {
      return applyLocalFallback(state);
    }

    return {
      state: resolveRecordInputWithAi(state.currentState, state.normalizedInput, state.aiResult, resolveOptions),
      route: "ai_result" as const,
      trace: ["apply_ai_result" as const]
    };
  }

  function applyLocalFallback(state: RecordWorkflowState) {
    return {
      state: resolveRecordInput(state.currentState, state.normalizedInput, resolveOptions),
      route: "local_fallback" as const,
      trace: ["apply_local_fallback" as const]
    };
  }

  function summarizeOutcome(state: RecordWorkflowState) {
    const nextState = state.state ?? state.currentState;

    return {
      state: nextState,
      outcome: inferRecordOutcome(state.currentState, nextState),
      trace: ["summarize_outcome" as const]
    };
  }

  return new StateGraph(RecordWorkflowAnnotation)
    .addNode("normalize_input", normalizeInput)
    .addNode("call_ai_parser", callAiParser)
    .addNode("apply_ai_result", applyAiResult)
    .addNode("apply_local_fallback", applyLocalFallback)
    .addNode("summarize_outcome", summarizeOutcome)
    .addEdge(START, "normalize_input")
    .addEdge("normalize_input", "call_ai_parser")
    .addConditionalEdges("call_ai_parser", routeAfterAiParser)
    .addEdge("apply_ai_result", "summarize_outcome")
    .addEdge("apply_local_fallback", "summarize_outcome")
    .addEdge("summarize_outcome", END)
    .compile({
      name: "timely-record-agent-workflow",
      description: "Routes Timely natural-language records through optional AI parsing, local fallback, and outcome summarization."
    });
}

export async function runRecordAgentWorkflow(
  currentState: TimelyState,
  input: string,
  options: RecordAgentWorkflowOptions = {}
): Promise<RecordAgentWorkflowResult> {
  const now = options.now ?? new Date();
  const workflow = createRecordAgentWorkflow({ ...options, now });
  const result = await workflow.invoke({
    currentState,
    input,
    normalizedInput: "",
    now,
    aiResult: null,
    aiError: null,
    route: null,
    outcome: null,
    state: null,
    trace: []
  });

  return {
    state: result.state ?? currentState,
    route: result.route ?? "local_fallback",
    outcome: result.outcome ?? "no_change",
    trace: result.trace,
    aiResult: result.aiResult,
    aiError: result.aiError
  };
}

function routeAfterAiParser(state: RecordWorkflowState) {
  return state.aiResult ? "apply_ai_result" : "apply_local_fallback";
}

function buildResolveOptions(options: RecordAgentWorkflowOptions, now: Date): ResolveOptions {
  return {
    now,
    createId: options.createId,
    pendingClarificationTtlMs: options.pendingClarificationTtlMs
  };
}

function inferRecordOutcome(previous: TimelyState, next: TimelyState): RecordWorkflowOutcome {
  if (next.ledgerEntries.length > previous.ledgerEntries.length) {
    return "ledger_created";
  }

  if (next.events.length > previous.events.length) {
    return "event_created";
  }

  if (cancelledCount(next.events) > cancelledCount(previous.events)) {
    return "event_cancelled";
  }

  if (next.pendingClarification) {
    return "clarification_requested";
  }

  if (previous.pendingClarification && !next.pendingClarification && lastAssistantReply(next) === "好的一声，已取消当前记录。") {
    return "pending_cancelled";
  }

  if (lastAssistantReply(next) === "我可以帮你记录事件。") {
    return "unsupported";
  }

  if (next.messages.length > previous.messages.length) {
    return "assistant_reply";
  }

  return "no_change";
}

function cancelledCount(events: CalendarEvent[]) {
  return events.filter((event) => event.status === "cancelled").length;
}

function lastAssistantReply(state: TimelyState) {
  return [...state.messages].reverse().find((message) => message.role === "assistant")?.content ?? null;
}

export function findWorkflowEvent(state: TimelyState, expected: Partial<Pick<CalendarEvent, "title" | "startsAt" | "status">>) {
  return state.events.find((event) => {
    return (
      (expected.title === undefined || event.title === expected.title) &&
      (expected.startsAt === undefined || event.startsAt === expected.startsAt) &&
      (expected.status === undefined || event.status === expected.status)
    );
  }) ?? null;
}

export function findWorkflowLedgerEntry(
  state: TimelyState,
  expected: Partial<Pick<LedgerEntry, "direction" | "amountCents" | "category" | "occurredAt" | "note">>
) {
  return state.ledgerEntries.find((entry) => {
    return (
      (expected.direction === undefined || entry.direction === expected.direction) &&
      (expected.amountCents === undefined || entry.amountCents === expected.amountCents) &&
      (expected.category === undefined || entry.category === expected.category) &&
      (expected.occurredAt === undefined || entry.occurredAt === expected.occurredAt) &&
      (expected.note === undefined || entry.note === expected.note)
    );
  }) ?? null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
