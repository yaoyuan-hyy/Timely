import { buildShanghaiIso, getShanghaiParts } from "./time";
import type { QueryPlan, TimeRange } from "./query-contract";
import type { UiPopupQueryKind } from "./ui-popup";

export function buildQueryPlan(text: string, now: Date): QueryPlan {
  text = normalizeText(text);
  return {
    version: 1,
    kind: inferQueryKind(text),
    timeRange: inferTimeRange(text, now),
    category: inferQueryKind(text) === "ledger" ? inferLedgerCategory(text) : null,
    title: inferQueryKind(text) === "schedule" ? inferEventTitle(text) : null,
    direction: inferQueryKind(text) !== "ledger" || /收支/.test(text) ? null : /支出|花了|消费|开销/.test(text) ? "expense" : /收入/.test(text) ? "income" : null
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


