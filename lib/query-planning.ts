import { buildQueryPlan } from "./query-baseline";
import { queryDecisionV2Schema, queryPlanSchema } from "./query-contract";
import type { QueryDecisionV2, QueryPlan, QueryPlanner, QuerySource } from "./query-contract";
import type { QueryPlanV2 } from "./query-contract";
import { buildShanghaiIso, getShanghaiParts, isValidShanghaiDateParts } from "./time";
export function adaptQueryPlanV1(plan: QueryPlan): { version: 2; decision: "execute"; query: QueryPlanV2 } {
  const valid = queryPlanSchema.parse(plan);
  return { version: 2, decision: "execute", query: { version: 2, kind: valid.kind, timeRange: valid.timeRange, filters: { title: valid.title, category: valid.category, direction: valid.direction }, aggregation: { op: "none" } } };
}
export async function planQuery(input: string, now: Date, planner?: QueryPlanner): Promise<{ plan: QueryPlan; source: QuerySource; fallbackReason: string | null }> {
  const baseline = () => queryPlanSchema.parse(buildQueryPlan(input, now));
  if (!planner) return { plan: baseline(), source: "rules", fallbackReason: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([planner(input, { now }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("planner_timeout")), 15000); })]);
    const parsed = queryPlanSchema.safeParse(value);
    if (!parsed.success) return { plan: baseline(), source: "rules_fallback", fallbackReason: "invalid_plan" };
    return { plan: parsed.data, source: "model", fallbackReason: null };
  } catch { return { plan: baseline(), source: "rules_fallback", fallbackReason: "planner_failed" }; }
  finally { if (timer) clearTimeout(timer); }
}

function dayRange(year: number, month: number, day: number, label: string) {
  return { label, from: buildShanghaiIso(year, month, day, 0, 0), to: `${buildShanghaiIso(year, month, day, 23, 59).replace(":00+08:00", ":59+08:00")}` };
}

function nextWeekRange(now: Date) {
  const p = getShanghaiParts(now);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const mondayOffset = date.getUTCDay() === 0 ? -6 : 1 - date.getUTCDay();
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day + mondayOffset + 7));
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));
  return { label: "下周", from: buildShanghaiIso(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0), to: `${buildShanghaiIso(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), 23, 59).replace(":00+08:00", ":59+08:00")}` };
}

function unwrapFollowup(input: string) {
  const original = input.match(/原问题：([\s\S]*?)(?:\n|$)/)?.[1] ?? input;
  const supplement = input.match(/用户补充：([\s\S]*)/)?.[1]?.trim();
  if (!supplement) return { text: input, followup: false, original, supplement: "" };
  return { text: `查询${original.replace(/最近|这段时间|之前|那个|那一笔|之前那个/g, "")}${supplement}`, followup: true, original, supplement };
}

export function buildQueryDecisionV2(input: string, now: Date): QueryDecisionV2 {
  const unwrapped = unwrapFollowup(input);
  if (unwrapped.followup && /最近|这段时间|近期/.test(unwrapped.original) && !/(上个月|上月|下个月|下月|本月|这个月|今天|明天|昨天|后天|下周|上周|本周|这周|\d{1,2}月\d{1,2}日)/.test(unwrapped.supplement)) {
    return { version: 2, decision: "clarify", question: "你想查哪段时间？", reason: "missing_scope" };
  }
  const text = unwrapped.text.trim().replace(/\s+/g, "");
  const hasWrite = /记录|添加|新增|安排一下|记一下|取消|删除|提醒我|记一笔/.test(text) && !/查记录|记录有|记录中|查看记录/.test(text);
  const readIntent = /查|查看|看看|多少|哪些|有什么|记录中|花了|开销|消费|收入|支出|待办|任务|几点|何时/.test(text);
  const queryTopic = /会议|开会|日程|事件|餐饮|交通|工资|报销|流水|账目|账单|面试|聚餐|旅行|电影|约会/.test(text);
  const hasRead = readIntent || (queryTopic && !hasWrite);
  if (hasRead && hasWrite) return { version: 2, decision: "clarify", question: "你是要查询，还是要记录？", reason: "mixed_intent" };
  if (!hasRead && hasWrite) return { version: 2, decision: "unsupported", reason: "write_request", message: "请使用记录流程。" };
  if (/那个|那一笔|之前那个/.test(unwrapped.original) && (!unwrapped.supplement || /^(那个|那一笔|之前那个|这个|那个时间)$/.test(unwrapped.supplement))) {
    return { version: 2, decision: "clarify", question: "你指的是哪一条记录？", reason: "ambiguous_reference" };
  }
  if (/那个|那一笔|之前那个/.test(text)) return { version: 2, decision: "clarify", question: "你指的是哪一条记录？", reason: "ambiguous_reference" };
  if (!hasRead) return { version: 2, decision: "unsupported", reason: "unsupported_query", message: "暂时只支持查询日程、流水和任务。" };
  if (/最近|这段时间|近期|之前/.test(text) && !/上个月|上月|下个月|下月|本月|这个月|今天|明天|昨天|后天|下周|上周|本周|这周|\d{1,2}月\d{1,2}日/.test(text)) {
    return { version: 2, decision: "clarify", question: "你想查哪段时间？", reason: "missing_scope" };
  }
  const adapted = adaptQueryPlanV1(queryPlanSchema.parse(buildQueryPlan(text, now)));
  const query = { ...adapted.query };
  if (/收支|花了多少钱|支出了多少|开销|消费|账单|流水|收入|支出|总共|合计|净额|余额/.test(text)) {
    query.kind = "ledger";
    query.filters.title = null;
    query.filters.direction = /收支/.test(text) ? null : /支出|花了|消费|开销/.test(text) ? "expense" : /收入/.test(text) ? "income" : null;
  }
  if (/(?:下周|下星期)(?![一二三四五六日天])/.test(text)) query.timeRange = nextWeekRange(now);
  const date = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (date) {
    const p = getShanghaiParts(now), month = Number(date[1]), day = Number(date[2]);
    if (isValidShanghaiDateParts(p.year, month, day)) query.timeRange = dayRange(p.year, month, day, `${month}月${day}日`);
    else return { version: 2, decision: "clarify", question: "请提供有效的日期？", reason: "insufficient_information" };
  }
  if (query.kind === "schedule" && !query.filters.title) {
    const title = text.match(/会议|开会|看电影|约会|面试|聚餐|吃饭|旅行|演出/)?.[0];
    if (title) query.filters.title = title === "开会" ? "会议" : title;
  }
  if (/净额|净收入|净支出|收支多少|余额/.test(text)) {
    query.aggregation = { op: "sum", field: "signedAmountCents" };
    query.filters.direction = null;
  }
  else if (/平均|均值/.test(text)) query.aggregation = { op: "average", field: "amountCents" };
  else if (/最高|最多|最大/.test(text)) query.aggregation = { op: "max", field: "amountCents" };
  else if (/最低|最少|最小/.test(text)) query.aggregation = { op: "min", field: "amountCents" };
  else if (/多少条|几笔|几项|数量|多少个/.test(text)) query.aggregation = { op: "count" };
  else if (query.kind === "ledger" && /总共|合计|多少|多少钱/.test(text)) query.aggregation = { op: "sum", field: "amountCents" };
  else query.aggregation = { op: "none" };
  return queryDecisionV2Schema.parse({ version: 2, decision: "execute", query });
}

export async function planQueryV2(input: string, now: Date, planner?: QueryPlanner): Promise<{ decision: QueryDecisionV2; source: QuerySource; fallbackReason: string | null }> {
  const baseline = () => buildQueryDecisionV2(input, now);
  if (!planner) return { decision: baseline(), source: "rules", fallbackReason: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([planner(input, { now }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("planner_timeout")), 15000); })]);
    const parsed = queryDecisionV2Schema.safeParse(value);
    if (!parsed.success) {
      // Keep benchmark callers that inject the historical v1 parser working explicitly.
      const legacy = queryPlanSchema.safeParse(value);
      if (legacy.success) return { decision: adaptQueryPlanV1(legacy.data), source: "model", fallbackReason: null };
      return { decision: baseline(), source: "rules_fallback", fallbackReason: "invalid_decision" };
    }
    return { decision: parsed.data, source: "model", fallbackReason: null };
  } catch { return { decision: baseline(), source: "rules_fallback", fallbackReason: "planner_failed" }; }
  finally { if (timer) clearTimeout(timer); }
}
