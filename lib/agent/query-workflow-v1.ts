import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { createLocalId } from "../local-id";
import { toShanghaiIso } from "../time";
import { buildQueryPlan } from "../query-baseline";
import { buildQueryResult, buildEmptyQueryResult, buildAssistantIntro } from "../query-result";
import type { QueryPlan, QueryPlanner, QuerySource } from "../query-contract";
import { planQuery } from "../query-planning";
import type { QueryToolCall } from "../tools/record-tools";
import { buildUiPopupMessage } from "../ui-popup";
import type { UiPopupPayload } from "../ui-popup";
import type { ConversationMessage, TimelyState } from "../types";

type QueryAgentOptions = {
  now?: Date;
  createId?: (prefix: string) => string;
  parseQueryPlan?: QueryPlanner;
};

export type QueryAgentOutcome = "query_answered";

export type QueryAgentTraceStep =
  | "normalize_query"
  | "classify_query"
  | "query_local_database"
  | "format_popup_response";

export type QueryAgentResult = {
  state: TimelyState;
  outcome: QueryAgentOutcome;
  queryResult: UiPopupPayload;
  plan: QueryPlan;
  source: QuerySource;
  fallbackReason: string | null;
  toolCalls: QueryToolCall[];
  trace: QueryAgentTraceStep[];
};

const QueryWorkflowAnnotation = Annotation.Root({
  currentState: Annotation<TimelyState>(),
  input: Annotation<string>(),
  normalizedInput: Annotation<string>(),
  now: Annotation<Date>(),
  queryPlan: Annotation<QueryPlan | null>(),
  source: Annotation<QuerySource>(),
  fallbackReason: Annotation<string | null>(),
  toolCalls: Annotation<QueryToolCall[]>(),
  queryResult: Annotation<UiPopupPayload | null>(),
  state: Annotation<TimelyState | null>(),
  trace: Annotation<QueryAgentTraceStep[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  })
});

type QueryWorkflowState = typeof QueryWorkflowAnnotation.State;

export function createQueryAgentWorkflow(options: QueryAgentOptions = {}) {
  const now = options.now ?? new Date();
  const createId = options.createId ?? createLocalId;

  function normalizeQuery(state: QueryWorkflowState) {
    return {
      normalizedInput: normalizeText(state.input),
      trace: ["normalize_query" as const]
    };
  }

  async function classifyQuery(state: QueryWorkflowState) {
    const decision = await planQuery(state.input, now, options.parseQueryPlan);
    return {
      queryPlan: decision.plan,
      source: decision.source,
      fallbackReason: decision.fallbackReason,
      trace: ["classify_query" as const]
    };
  }

  function queryLocalDatabase(state: QueryWorkflowState) {
    const plan = state.queryPlan ?? buildQueryPlan(state.normalizedInput, now);
    const toolCalls: QueryToolCall[] = [];
    const queryResult = buildQueryResult(state.currentState, plan, call => toolCalls.push(call));
    return {
      queryResult,
      toolCalls,
      trace: ["query_local_database" as const]
    };
  }

  function formatPopupResponse(state: QueryWorkflowState) {
    const queryResult = state.queryResult ?? buildEmptyQueryResult(buildQueryPlan(state.normalizedInput, now));
    const createdAt = toShanghaiIso(now);
    const rawText = state.input.trim();
    const assistantIntro = buildAssistantIntro(queryResult);
    const userMessage = createMessage("user", rawText, createdAt, createId);
    const assistantMessage = createMessage("assistant", buildUiPopupMessage(assistantIntro, queryResult), createdAt, createId);

    return {
      state: {
        ...state.currentState,
        messages: [...state.currentState.messages, userMessage, assistantMessage],
        pendingClarification: null
      },
      trace: ["format_popup_response" as const]
    };
  }

  return new StateGraph(QueryWorkflowAnnotation)
    .addNode("normalize_query", normalizeQuery)
    .addNode("classify_query", classifyQuery)
    .addNode("query_local_database", queryLocalDatabase)
    .addNode("format_popup_response", formatPopupResponse)
    .addEdge(START, "normalize_query")
    .addEdge("normalize_query", "classify_query")
    .addEdge("classify_query", "query_local_database")
    .addEdge("query_local_database", "format_popup_response")
    .addEdge("format_popup_response", END)
    .compile({
      name: "timely-query-agent-workflow",
      description: "Extracts personal-data query intent, queries TimelyState, and emits a UI_POPUP payload."
    });
}

export async function runQueryAgentWorkflow(
  currentState: TimelyState,
  input: string,
  options: QueryAgentOptions = {}
): Promise<QueryAgentResult> {
  const now = options.now ?? new Date();
  const workflow = createQueryAgentWorkflow({ ...options, now });
  const result = await workflow.invoke({
    currentState,
    input,
    normalizedInput: "",
    now,
    queryPlan: null,
    source: "rules",
    fallbackReason: null,
    toolCalls: [],
    queryResult: null,
    state: null,
    trace: []
  });
  const queryResult = result.queryResult ?? buildEmptyQueryResult(buildQueryPlan(normalizeText(input), now));

  return {
    state: result.state ?? currentState,
    outcome: "query_answered",
    queryResult,
    plan: result.queryPlan ?? buildQueryPlan(normalizeText(input), now),
    source: result.source,
    fallbackReason: result.fallbackReason,
    toolCalls: result.toolCalls,
    trace: result.trace
  };
}

export function isLikelyQueryIntent(input: string) {
  const text = normalizeText(input);

  return (
    (/(有什么|还有什么|哪些|多少|几点|查询|查一下|查查|查看|看看|看一下|统计|汇总|有没有|没做|[？?])/.test(text) || /^(?:(?:今天|明天|昨天|这周|本周|下周|本月|这个月|上个月|下个月)的?)?(?:日程|安排|账单|账目|流水|待办|任务)$/.test(text)) &&
    !/^(帮我|给我)?(记录|记一下|记一笔|新增|添加|加一个|加个|删除|取消|清除)/.test(text)
  );
}

function createMessage(
  role: "user" | "assistant",
  content: string,
  createdAt: string,
  createId: (prefix: string) => string
): ConversationMessage {
  return {
    id: createId("message"),
    role,
    content,
    createdAt
  };
}

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, "");
}
