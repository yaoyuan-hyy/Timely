import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { createLocalId } from "../local-id";
import { buildShanghaiIso, getShanghaiParts, toShanghaiDayKey, toShanghaiIso } from "../time";
import { buildUiPopupMessage } from "../ui-popup";
import type { UiPopupPayload, UiPopupQueryKind } from "../ui-popup";
import type { CalendarEvent, ConversationMessage, LedgerEntry, TimelyState } from "../types";

type QueryAgentOptions = {
  now?: Date;
  createId?: (prefix: string) => string;
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
  trace: QueryAgentTraceStep[];
};

type QueryPlan = {
  kind: UiPopupQueryKind;
  timeRange: TimeRange;
  category: string | null;
  title: string | null;
};

type TimeRange = {
  label: string;
  from: string;
  to: string;
};

const QueryWorkflowAnnotation = Annotation.Root({
  currentState: Annotation<TimelyState>(),
  input: Annotation<string>(),
  normalizedInput: Annotation<string>(),
  now: Annotation<Date>(),
  queryPlan: Annotation<QueryPlan | null>(),
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

  function classifyQuery(state: QueryWorkflowState) {
    return {
      queryPlan: buildQueryPlan(state.normalizedInput, now),
      trace: ["classify_query" as const]
    };
  }

  function queryLocalDatabase(state: QueryWorkflowState) {
    const plan = state.queryPlan ?? buildQueryPlan(state.normalizedInput, now);
    return {
      queryResult: buildQueryResult(state.currentState, plan),
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
    queryResult: null,
    state: null,
    trace: []
  });
  const queryResult = result.queryResult ?? buildEmptyQueryResult(buildQueryPlan(normalizeText(input), now));

  return {
    state: result.state ?? currentState,
    outcome: "query_answered",
    queryResult,
    trace: result.trace
  };
}

export function isLikelyQueryIntent(input: string) {
  const text = normalizeText(input);

  return (
    /(有什么|哪些|多少|几点|查|查询|看看|看一下|统计|汇总|花了多少钱|支出了多少|开销|消费|安排|日程|会议|账单|账目|流水|外卖|待办|任务|没做)/.test(text) &&
    !/^(帮我|给我)?(记录|记一下|记一笔|新增|添加|加一个|加个|删除|取消|清除)/.test(text)
  );
}

function buildQueryPlan(text: string, now: Date): QueryPlan {
  return {
    kind: inferQueryKind(text),
    timeRange: inferTimeRange(text, now),
    category: inferLedgerCategory(text),
    title: inferEventTitle(text)
  };
}

function inferQueryKind(text: string): UiPopupQueryKind {
  if (/待办|任务|没做|重要事情/.test(text)) {
    return "task";
  }

  if (/花了多少钱|支出了多少|开销|消费|账单|账目|流水|外卖|午饭|晚饭|早饭|早餐|工资|收入|报销/.test(text)) {
    return "ledger";
  }

  return "schedule";
}

function inferTimeRange(text: string, now: Date): TimeRange {
  const current = getShanghaiParts(now);

  if (/明天|明早|明晚/.test(text)) {
    return dayRangeWithSegment(addDaysToParts(current, 1), "明天", text);
  }

  if (/后天/.test(text)) {
    return dayRangeWithSegment(addDaysToParts(current, 2), "后天", text);
  }

  if (/昨天|昨晚/.test(text)) {
    return dayRangeWithSegment(addDaysToParts(current, -1), "昨天", text);
  }

  if (/上个月|上月/.test(text)) {
    return monthRange(shiftMonth(current, -1), "上个月");
  }

  if (/下个月|下月/.test(text)) {
    return monthRange(shiftMonth(current, 1), "下个月");
  }

  const weekdayMatch = text.match(/(上|下|这|本)?(?:周|星期|礼拜)([日天一二三四五六])/);
  if (weekdayMatch) {
    return dayRangeWithSegment(
      parseWeekdayDate(current, weekdayMatch[1], weekdayMatch[2]),
      weekdayLabel(weekdayMatch[1], weekdayMatch[2]),
      text
    );
  }

  if (/本月|这个月/.test(text)) {
    return monthRange({ year: current.year, month: current.month }, "本月");
  }

  return dayRangeWithSegment(current, "今天", text);
}

function buildQueryResult(state: TimelyState, plan: QueryPlan): UiPopupPayload {
  const events = plan.kind === "ledger" ? [] : queryEvents(state.events, plan);
  const ledgerEntries = plan.kind === "schedule" || plan.kind === "task" ? [] : queryLedgerEntries(state.ledgerEntries, plan);
  const totalExpenseCents = ledgerEntries
    .filter((entry) => entry.direction === "expense")
    .reduce((total, entry) => total + entry.amountCents, 0);
  const totalIncomeCents = ledgerEntries
    .filter((entry) => entry.direction === "income")
    .reduce((total, entry) => total + entry.amountCents, 0);
  const hasResults = events.length > 0 || ledgerEntries.length > 0;
  const title = buildPopupTitle(plan);

  return {
    type: "timely_query_result",
    query_kind: plan.kind,
    query_status: hasResults ? "success" : "empty",
    title,
    summary: hasResults ? buildSummary(plan, events.length, ledgerEntries.length, totalExpenseCents, totalIncomeCents) : "暂无记录",
    time_range: plan.timeRange,
    metrics: buildMetrics(plan, events.length, ledgerEntries.length, totalExpenseCents, totalIncomeCents),
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      location: event.location,
      notes: event.notes
    })),
    ledger: {
      entries: ledgerEntries.map((entry) => ({
        id: entry.id,
        direction: entry.direction,
        amountCents: entry.amountCents,
        category: entry.category,
        occurredAt: entry.occurredAt,
        note: entry.note
      })),
      totalExpenseCents,
      totalIncomeCents,
      netCents: totalIncomeCents - totalExpenseCents
    }
  };
}

function buildEmptyQueryResult(plan: QueryPlan): UiPopupPayload {
  return {
    type: "timely_query_result",
    query_kind: plan.kind,
    query_status: "empty",
    title: buildPopupTitle(plan),
    summary: "暂无记录",
    time_range: plan.timeRange,
    metrics: [],
    events: [],
    ledger: {
      entries: [],
      totalExpenseCents: 0,
      totalIncomeCents: 0,
      netCents: 0
    }
  };
}

function queryEvents(events: CalendarEvent[], plan: QueryPlan) {
  return events
    .filter((event) => event.status === "active")
    .filter((event) => event.startsAt >= plan.timeRange.from && event.startsAt <= plan.timeRange.to)
    .filter((event) => !plan.title || event.title.includes(plan.title))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function queryLedgerEntries(entries: LedgerEntry[], plan: QueryPlan) {
  return entries
    .filter((entry) => entry.occurredAt >= plan.timeRange.from && entry.occurredAt <= plan.timeRange.to)
    .filter((entry) => !plan.category || entry.category === plan.category || entry.note?.includes(plan.category))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

function buildAssistantIntro(result: UiPopupPayload) {
  if (result.query_status === "empty") {
    return `我查了一下，${result.time_range.label}暂无相关记录。`;
  }

  if (result.query_kind === "ledger") {
    return `我查到了，${result.time_range.label}${result.summary}。`;
  }

  return `我查到了，${result.time_range.label}有 ${result.events.length} 条安排。`;
}

function buildPopupTitle(plan: QueryPlan) {
  if (plan.kind === "ledger") {
    return `${plan.timeRange.label}收支`;
  }

  if (plan.kind === "task") {
    return `${plan.timeRange.label}待办`;
  }

  return `${plan.timeRange.label}安排`;
}

function buildSummary(
  plan: QueryPlan,
  eventCount: number,
  ledgerCount: number,
  totalExpenseCents: number,
  totalIncomeCents: number
) {
  if (plan.kind === "ledger") {
    return `支出 ${formatAmount(totalExpenseCents)} 元，收入 ${formatAmount(totalIncomeCents)} 元，共 ${ledgerCount} 条流水`;
  }

  return `找到 ${eventCount} 条安排`;
}

function buildMetrics(
  plan: QueryPlan,
  eventCount: number,
  ledgerCount: number,
  totalExpenseCents: number,
  totalIncomeCents: number
) {
  if (plan.kind === "ledger") {
    return [
      { label: "支出", value: `${formatAmount(totalExpenseCents)} 元` },
      { label: "收入", value: `${formatAmount(totalIncomeCents)} 元` },
      { label: "流水", value: `${ledgerCount} 条` }
    ];
  }

  return [{ label: "安排", value: `${eventCount} 条` }];
}

function inferLedgerCategory(text: string) {
  if (/外卖|午饭|晚饭|早饭|早餐|餐|饭|咖啡|奶茶/.test(text)) {
    return "餐饮";
  }

  if (/打车|地铁|公交|出租|车费|高铁|机票/.test(text)) {
    return "交通";
  }

  if (/工资|薪水|奖金/.test(text)) {
    return "工资";
  }

  if (/报销/.test(text)) {
    return "报销";
  }

  return null;
}

function inferEventTitle(text: string) {
  if (/会议|开会/.test(text)) {
    return "会议";
  }

  return null;
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

function dayRange(parts: { year: number; month: number; day: number }, label: string): TimeRange {
  return {
    label,
    from: buildShanghaiIso(parts.year, parts.month, parts.day, 0, 0),
    to: rangeEndIso(parts, 23, 59)
  };
}

function dayRangeWithSegment(parts: { year: number; month: number; day: number }, label: string, text: string): TimeRange {
  const segment = inferDaySegment(text);

  if (!segment) {
    return dayRange(parts, label);
  }

  return {
    label: `${label}${segment.label}`,
    from: buildShanghaiIso(parts.year, parts.month, parts.day, segment.fromHour, segment.fromMinute),
    to: rangeEndIso(parts, segment.toHour, segment.toMinute)
  };
}

function rangeEndIso(parts: { year: number; month: number; day: number }, hour: number, minute: number) {
  return buildShanghaiIso(parts.year, parts.month, parts.day, hour, minute).replace(":00+08:00", ":59+08:00");
}

function monthRange(parts: { year: number; month: number }, label: string): TimeRange {
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();

  return {
    label,
    from: buildShanghaiIso(parts.year, parts.month, 1, 0, 0),
    to: `${buildShanghaiIso(parts.year, parts.month, lastDay, 23, 59).replace(":00+08:00", ":59+08:00")}`
  };
}

function addDaysToParts(parts: { year: number; month: number; day: number }, days: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function shiftMonth(parts: { year: number; month: number }, offset: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1));

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1
  };
}

function parseWeekdayDate(current: { year: number; month: number; day: number }, prefix: string | undefined, weekdayText: string) {
  const currentDate = new Date(Date.UTC(current.year, current.month - 1, current.day));
  const currentWeekday = toMondayBasedWeekday(currentDate.getUTCDay());
  const targetWeekday = toMondayBasedWeekday(weekdayIndex(weekdayText));
  let diff = targetWeekday - currentWeekday;

  if (prefix === "下") {
    diff += 7;
  } else if (prefix === "上") {
    diff -= 7;
  }

  return addDaysToParts(current, diff);
}

function inferDaySegment(text: string) {
  if (/凌晨/.test(text)) {
    return { label: "凌晨", fromHour: 0, fromMinute: 0, toHour: 5, toMinute: 59 };
  }

  if (/早上|早晨|清早|明早|今早/.test(text)) {
    return { label: "早上", fromHour: 6, fromMinute: 0, toHour: 10, toMinute: 59 };
  }

  if (/上午/.test(text)) {
    return { label: "上午", fromHour: 6, fromMinute: 0, toHour: 11, toMinute: 59 };
  }

  if (/中午/.test(text)) {
    return { label: "中午", fromHour: 11, fromMinute: 0, toHour: 13, toMinute: 59 };
  }

  if (/下午/.test(text)) {
    return { label: "下午", fromHour: 12, fromMinute: 0, toHour: 17, toMinute: 59 };
  }

  if (/晚上|夜里|今晚|明晚|昨晚/.test(text)) {
    return { label: "晚上", fromHour: 18, fromMinute: 0, toHour: 23, toMinute: 59 };
  }

  return null;
}

function toMondayBasedWeekday(weekday: number) {
  return weekday === 0 ? 6 : weekday - 1;
}

function weekdayIndex(text: string) {
  const values: Record<string, number> = {
    日: 0,
    天: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6
  };

  return values[text] ?? 0;
}

function weekdayLabel(prefix: string | undefined, weekdayText: string) {
  return `${prefix ?? "本"}周${weekdayText}`;
}

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, "");
}

function formatAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}
