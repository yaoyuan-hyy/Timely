import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { createLocalId } from "../local-id";
import { toShanghaiIso } from "../time";
import { runQueryAgentWorkflow, isLikelyQueryIntent } from "./query-workflow";
import { runRecordAgentWorkflow } from "./record-workflow";
import type { ParseRecordInput, RecordWorkflowOutcome } from "./record-workflow";
import type { ConversationMessage, TimelyState } from "../types";

export type TimelyAgentName = "query" | "write" | "chat";

export type TimelyAgentOutcome = RecordWorkflowOutcome | "query_answered" | "chat_replied";

export type TimelyAgentTraceStep =
  | "classify_intent"
  | "query_agent"
  | "write_agent"
  | "chat_agent";

type TimelyAgentOptions = {
  now?: Date;
  createId?: (prefix: string) => string;
  pendingClarificationTtlMs?: number;
  parseRecordInput?: ParseRecordInput;
};

export type TimelyAgentWorkflowResult = {
  state: TimelyState;
  agent: TimelyAgentName;
  outcome: TimelyAgentOutcome;
  trace: TimelyAgentTraceStep[];
};

const TimelyAgentWorkflowAnnotation = Annotation.Root({
  currentState: Annotation<TimelyState>(),
  input: Annotation<string>(),
  normalizedInput: Annotation<string>(),
  now: Annotation<Date>(),
  agent: Annotation<TimelyAgentName | null>(),
  outcome: Annotation<TimelyAgentOutcome | null>(),
  state: Annotation<TimelyState | null>(),
  trace: Annotation<TimelyAgentTraceStep[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  })
});

type TimelyAgentWorkflowState = typeof TimelyAgentWorkflowAnnotation.State;

export function createTimelyAgentWorkflow(options: TimelyAgentOptions = {}) {
  const now = options.now ?? new Date();
  const createId = options.createId ?? createLocalId;

  function classifyIntent(state: TimelyAgentWorkflowState) {
    const normalizedInput = normalizeText(state.input);
    return {
      normalizedInput,
      agent: selectAgent(normalizedInput),
      trace: ["classify_intent" as const]
    };
  }

  async function runQueryAgent(state: TimelyAgentWorkflowState) {
    const result = await runQueryAgentWorkflow(state.currentState, state.input, { now, createId });

    return {
      state: result.state,
      outcome: result.outcome,
      trace: ["query_agent" as const]
    };
  }

  async function runWriteAgent(state: TimelyAgentWorkflowState) {
    const result = await runRecordAgentWorkflow(state.currentState, state.input, {
      now,
      createId,
      pendingClarificationTtlMs: options.pendingClarificationTtlMs,
      parseRecordInput: options.parseRecordInput
    });

    return {
      state: result.state,
      outcome: result.outcome,
      trace: ["write_agent" as const]
    };
  }

  function runChatAgent(state: TimelyAgentWorkflowState) {
    const createdAt = toShanghaiIso(now);
    const userMessage = createMessage("user", state.input.trim(), createdAt, createId);
    const assistantMessage = createMessage(
      "assistant",
      "我可以陪你简单聊聊，也可以帮你记录或查询日程和流水。",
      createdAt,
      createId
    );

    return {
      state: {
        ...state.currentState,
        messages: [...state.currentState.messages, userMessage, assistantMessage],
        pendingClarification: null
      },
      outcome: "chat_replied" as const,
      trace: ["chat_agent" as const]
    };
  }

  return new StateGraph(TimelyAgentWorkflowAnnotation)
    .addNode("classify_intent", classifyIntent)
    .addNode("query_agent", runQueryAgent)
    .addNode("write_agent", runWriteAgent)
    .addNode("chat_agent", runChatAgent)
    .addEdge(START, "classify_intent")
    .addConditionalEdges("classify_intent", routeByAgent)
    .addEdge("query_agent", END)
    .addEdge("write_agent", END)
    .addEdge("chat_agent", END)
    .compile({
      name: "timely-supervisor-agent-workflow",
      description: "Routes Timely inputs to query, write, or lightweight chat agents."
    });
}

export async function runTimelyAgentWorkflow(
  currentState: TimelyState,
  input: string,
  options: TimelyAgentOptions = {}
): Promise<TimelyAgentWorkflowResult> {
  const now = options.now ?? new Date();
  const workflow = createTimelyAgentWorkflow({ ...options, now });
  const result = await workflow.invoke({
    currentState,
    input,
    normalizedInput: "",
    now,
    agent: null,
    outcome: null,
    state: null,
    trace: []
  });

  return {
    state: result.state ?? currentState,
    agent: result.agent ?? "chat",
    outcome: result.outcome ?? "chat_replied",
    trace: result.trace
  };
}

function routeByAgent(state: TimelyAgentWorkflowState) {
  return `${state.agent ?? "chat"}_agent`;
}

function selectAgent(input: string): TimelyAgentName {
  if (isLikelyQueryIntent(input)) {
    return "query";
  }

  if (isLikelyWriteIntent(input)) {
    return "write";
  }

  return "chat";
}

function isLikelyWriteIntent(input: string) {
  return (
    /(记录|记一下|记一笔|新增|添加|加一个|加个|删除|取消|清除|花了?|消费|支付|支出|买|收到|收入|工资|报销|转入|进账|入账|奖金|退款|会议|开会|复盘|评审|健身|面试)/.test(
      input
    ) || /(?:今天|明天|后天|周|星期|礼拜|上午|下午|晚上|\d{1,2}月|\d{1,2}[日号点:：])/.test(input)
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
