import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { createLocalId } from "../local-id";
import { toShanghaiIso } from "../time";
import { planQueryV2 } from "../query-planning";
import { queryPlanV2Schema } from "../query-contract";
import type { QueryDecisionV2, QueryPlanV2, QueryPlanner, QuerySource } from "../query-contract";
import { createRecordRepository } from "../repository/record-repository";
import type { RecordSnapshot } from "../repository/record-repository";
import { createQueryTools } from "../tools/record-tools";
import type { QueryToolCall } from "../tools/record-tools";
import { aggregateQueryRecords } from "../query-executor";
import type { QueryExecutionResult } from "../query-executor";
import { formatQueryExecution, buildAssistantIntro } from "../query-result";
import { buildUiPopupMessage } from "../ui-popup";
import type { UiPopupPayload } from "../ui-popup";
import type { TimelyState } from "../types";

type QueryAgentOptions = { now?: Date; createId?: (prefix: string) => string; parseQueryPlan?: QueryPlanner; parseQueryDecision?: QueryPlanner };
export type QueryAgentOutcome = "query_answered" | "query_clarification" | "query_unsupported";
export type QueryAgentTraceStep = "normalize_query" | "decide_query" | "validate_query_plan" | "query_records" | "aggregate_records" | "format_query_result" | "format_clarification" | "format_unsupported";
type ResultBase = { state: TimelyState; source: QuerySource; fallbackReason: string | null; toolCalls: QueryToolCall[]; trace: QueryAgentTraceStep[] };
export type QueryAgentResult = ResultBase & (
  | { outcome: "query_answered"; decision: Extract<QueryDecisionV2, { decision: "execute" }>; plan: QueryPlanV2; execution: QueryExecutionResult; queryResult: UiPopupPayload }
  | { outcome: "query_clarification" | "query_unsupported"; decision: Exclude<QueryDecisionV2, { decision: "execute" }>; plan: null; execution: null; queryResult: null }
);

const State = Annotation.Root({
  currentState: Annotation<TimelyState>(), input: Annotation<string>(), normalizedInput: Annotation<string>(), referenceNow: Annotation<Date>(),
  decision: Annotation<QueryDecisionV2 | null>(), plan: Annotation<QueryPlanV2 | null>(), records: Annotation<RecordSnapshot | null>(),
  execution: Annotation<QueryExecutionResult | null>(), queryResult: Annotation<UiPopupPayload | null>(), state: Annotation<TimelyState | null>(),
  source: Annotation<QuerySource>(), fallbackReason: Annotation<string | null>(), toolCalls: Annotation<QueryToolCall[]>(),
  trace: Annotation<QueryAgentTraceStep[]>({ reducer: (a, b) => a.concat(b), default: () => [] })
});
type GraphState = typeof State.State;

export function createQueryAgentWorkflow(options: QueryAgentOptions = {}) {
  const now = options.now ?? new Date(), createId = options.createId ?? createLocalId;
  const trace = (step: QueryAgentTraceStep) => [step];
  function append(state: GraphState, content: string): TimelyState {
    const createdAt = toShanghaiIso(now);
    return { ...state.currentState, messages: [...state.currentState.messages,
      { id: createId("message"), role: "user", content: state.input.trim(), createdAt },
      { id: createId("message"), role: "assistant", content, createdAt }], pendingQueryClarification: null };
  }
  return new StateGraph(State)
    .addNode("normalize_query", (state: GraphState) => {
      const pending = state.currentState.pendingQueryClarification;
      const continuing = pending && now.getTime() >= pending.createdAt && now.getTime() - pending.createdAt < 15 * 60 * 1000 && !isLikelyQueryIntent(state.input) && !isNewRecordDuringQuery(state.input);
      return { normalizedInput: continuing ? `原问题：${pending.input}\n追问：${pending.question}\n用户补充：${state.input.trim()}` : state.input.trim(), referenceNow: continuing ? new Date(pending.referenceNow) : now, trace: trace("normalize_query") };
    })
    .addNode("decide_query", async (state: GraphState) => ({ ...await planQueryV2(state.normalizedInput, state.referenceNow, options.parseQueryDecision ?? options.parseQueryPlan), trace: trace("decide_query") }))
    .addNode("validate_query_plan", (state: GraphState) => {
      if (state.decision?.decision !== "execute") throw new Error("missing_execute_decision");
      return { plan: queryPlanV2Schema.parse(state.decision.query), trace: trace("validate_query_plan") };
    })
    .addNode("query_records", (state: GraphState) => {
      if (!state.plan) throw new Error("missing_validated_plan");
      const toolCalls: QueryToolCall[] = [];
      const found = createQueryTools(createRecordRepository(state.currentState), call => toolCalls.push(call)).queryRecords(state.plan);
      if (!found.ok) throw new Error(found.message);
      return { records: found.value, toolCalls, trace: trace("query_records") };
    })
    .addNode("aggregate_records", (state: GraphState) => {
      if (!state.plan || !state.records) throw new Error("missing_query_records");
      return { execution: aggregateQueryRecords(state.plan, state.records), trace: trace("aggregate_records") };
    })
    .addNode("format_query_result", (state: GraphState) => {
      if (!state.execution) throw new Error("missing_query_execution");
      const queryResult = formatQueryExecution(state.execution);
      return { queryResult, state: append(state, buildUiPopupMessage(buildAssistantIntro(queryResult), queryResult)), trace: trace("format_query_result") };
    })
    .addNode("format_clarification", (state: GraphState) => {
      if (state.decision?.decision !== "clarify") throw new Error("missing_clarification");
      return { state: { ...append(state, state.decision.question), pendingQueryClarification: { input: state.normalizedInput, question: state.decision.question, reason: state.decision.reason, createdAt: now.getTime(), referenceNow: state.referenceNow.toISOString() } }, trace: trace("format_clarification") };
    })
    .addNode("format_unsupported", (state: GraphState) => {
      if (state.decision?.decision !== "unsupported") throw new Error("missing_unsupported");
      return { state: append(state, state.decision.message), trace: trace("format_unsupported") };
    })
    .addEdge(START, "normalize_query").addEdge("normalize_query", "decide_query")
    .addConditionalEdges("decide_query", state => {
      if (!state.decision) throw new Error("missing_query_decision");
      return state.decision.decision;
    }, { execute: "validate_query_plan", clarify: "format_clarification", unsupported: "format_unsupported" })
    .addEdge("validate_query_plan", "query_records").addEdge("query_records", "aggregate_records")
    .addEdge("aggregate_records", "format_query_result").addEdge("format_query_result", END)
    .addEdge("format_clarification", END).addEdge("format_unsupported", END)
    .compile({ name: "timely-query-agent-v2" });
}

export async function runQueryAgentWorkflow(currentState: TimelyState, input: string, options: QueryAgentOptions = {}): Promise<QueryAgentResult> {
  const now = options.now ?? new Date();
  const result = await createQueryAgentWorkflow({ ...options, now }).invoke({ currentState, input, normalizedInput: "", referenceNow: now, decision: null, plan: null, records: null, execution: null, queryResult: null, state: null, source: "rules", fallbackReason: null, toolCalls: [], trace: [] });
  if (!result.decision || !result.state) throw new Error("incomplete_query_workflow");
  const common = { state: result.state, source: result.source, fallbackReason: result.fallbackReason, toolCalls: result.toolCalls, trace: result.trace };
  if (result.decision.decision === "execute") {
    if (!result.plan || !result.execution || !result.queryResult) throw new Error("incomplete_query_execution");
    return { ...common, outcome: "query_answered", decision: result.decision, plan: result.plan, execution: result.execution, queryResult: result.queryResult };
  }
  return { ...common, outcome: result.decision.decision === "clarify" ? "query_clarification" : "query_unsupported", decision: result.decision, plan: null, execution: null, queryResult: null };
}

export function isLikelyQueryIntent(input: string) {
  const text = input.trim().replace(/\s+/g, "");
  return (/(有什么|还有什么|哪些|多少|几点|查询|查一下|查查|查看|看看|看一下|统计|汇总|有没有|没做|[？?])/.test(text) || /^(?:(?:今天|明天|昨天|这周|本周|下周|本月|这个月|上个月|下个月)的?)?(?:日程|安排|账单|账目|流水|待办|任务)$/.test(text)) && !/^(帮我|给我)?(记录|记一下|记一笔|新增|添加|加一个|加个|删除|取消|清除)/.test(text);
}

export function isNewRecordDuringQuery(input: string) {
  const text = input.trim();
  return /^(帮我|给我)?(记录|记一下|记一笔|新增|添加|删除|取消)/.test(text) || (!isLikelyQueryIntent(text) && /(?:花了?|支付|消费|收入|收到|支出)\s*\d+(?:\.\d+)?\s*(?:元|块|人民币)?/.test(text));
}
