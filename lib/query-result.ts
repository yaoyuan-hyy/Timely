import type { TimelyState } from "./types";
import type { QueryPlan } from "./query-contract";
import type { UiPopupPayload } from "./ui-popup";
import { createRecordRepository } from "./repository/record-repository";
import { createQueryTools } from "./tools/record-tools";
import type { QueryToolCall } from "./tools/record-tools";

export function buildQueryResult(state: TimelyState, plan: QueryPlan, onToolCall?: (call: QueryToolCall) => void): UiPopupPayload {
  const result = createQueryTools(createRecordRepository(state), onToolCall).queryRecords(plan);
  if (!result.ok) throw new Error(result.message);
  const { events, ledgerEntries } = result.value;
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

export function buildEmptyQueryResult(plan: QueryPlan): UiPopupPayload {
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

export function buildAssistantIntro(result: UiPopupPayload) {
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

function formatAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}
