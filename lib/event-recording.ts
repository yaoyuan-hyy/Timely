import type { CalendarEvent, ConversationMessage, TimelyState } from "./types";
import { createLocalId } from "./local-id";
import { buildShanghaiIso, getShanghaiParts, isValidShanghaiDateParts, toShanghaiDayKey, toShanghaiIso } from "./time";

type ResolveOptions = {
  now?: Date;
  createId?: (prefix: string) => string;
};

export type AiEventParseResult = {
  intent: "create_event" | "delete_event" | "needs_clarification" | "unsupported";
  title: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  targetDate?: string | null;
  clarificationQuestion: "什么时候？" | "记录什么？" | null;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type TimeParts = {
  hour: number;
  minute: number;
};

type DeleteTarget = {
  title: string | null;
  targetDate: string | null;
  startsAt: string | null;
  time: TimeParts | null;
  period: "morning" | "afternoon" | "evening" | null;
};

export function resolveEventRecordInput(
  current: TimelyState,
  input: string,
  options: ResolveOptions = {}
): TimelyState {
  const now = options.now ?? new Date();
  const createId = options.createId ?? createLocalId;
  const createdAt = toShanghaiIso(now);
  const createdAtMs = now.getTime();
  const rawText = input.trim();
  const normalizedText = normalizeText(rawText);

  if (!normalizedText) {
    return current;
  }

  if (current.pendingClarification?.kind === "event_delete" || isDeleteRequest(normalizedText)) {
    return resolveDeleteInput(current, rawText, options);
  }

  const userMessage = createMessage("user", rawText, createdAt, createId);

  if (current.pendingClarification?.kind === "event_time") {
    const combinedText = normalizeText(`${current.pendingClarification.sourceText} ${rawText}`);
    const startsAt = parseDateTime(combinedText, now) ?? parseDateTime(normalizedText, now);

    if (!startsAt) {
      return {
        ...current,
        messages: [...current.messages, userMessage, createMessage("assistant", "什么时候？", createdAt, createId)]
      };
    }

    const event = createEvent({
      title: current.pendingClarification.title,
      startsAt,
      sourceText: `${current.pendingClarification.sourceText} ${rawText}`,
      createdAt,
      createId
    });

    return {
      ...current,
      pendingClarification: null,
      events: [event, ...current.events],
      messages: [
        ...current.messages,
        userMessage,
        createMessage("assistant", buildRecordedReply(event), createdAt, createId)
      ]
    };
  }

  if (isReminderRequest(normalizedText)) {
    return appendAssistant(current, userMessage, "我可以帮你记录事件。", createdAt, createId);
  }

  const startsAt = parseDateTime(normalizedText, now);
  const title = extractTitle(normalizedText);

  if (startsAt && title) {
    const event = createEvent({ title, startsAt, sourceText: rawText, createdAt, createId });

    return {
      ...current,
      events: [event, ...current.events],
      messages: [
        ...current.messages,
        userMessage,
        createMessage("assistant", buildRecordedReply(event), createdAt, createId)
      ]
    };
  }

  if (startsAt && !title) {
    return appendAssistant(current, userMessage, "记录什么？", createdAt, createId);
  }

  if (isLikelyEventRecord(normalizedText)) {
    if (!title) {
      return appendAssistant(current, userMessage, "记录什么？", createdAt, createId);
    }

    return {
      ...current,
      pendingClarification: {
        kind: "event_time",
        title,
        sourceText: rawText,
        createdAt: createdAtMs
      },
      messages: [...current.messages, userMessage, createMessage("assistant", "什么时候？", createdAt, createId)]
    };
  }

  return appendAssistant(current, userMessage, "我可以帮你记录事件。", createdAt, createId);
}

export function resolveEventRecordInputWithAi(
  current: TimelyState,
  input: string,
  result: AiEventParseResult,
  options: ResolveOptions = {}
): TimelyState {
  if (result.intent === "delete_event") {
    return resolveDeleteInput(current, input, options, {
      title: result.title,
      targetDate: result.targetDate ?? dateKeyFromIso(result.startsAt),
      startsAt: result.startsAt,
      time: null,
      period: null
    });
  }

  if (result.intent !== "create_event" || !result.title || !result.startsAt) {
    return resolveEventRecordInput(current, input, options);
  }

  const now = options.now ?? new Date();
  const createId = options.createId ?? createLocalId;
  const createdAt = toShanghaiIso(now);
  const rawText = input.trim();
  const userMessage = createMessage("user", rawText, createdAt, createId);
  const event = createEvent({
    title: result.title,
    startsAt: result.startsAt,
    endsAt: result.endsAt,
    location: result.location,
    notes: result.notes,
    sourceText: rawText,
    createdAt,
    createId
  });

  return {
    ...current,
    pendingClarification: null,
    events: [event, ...current.events],
    messages: [
      ...current.messages,
      userMessage,
      createMessage("assistant", buildRecordedReply(event), createdAt, createId)
    ]
  };
}

function resolveDeleteInput(
  current: TimelyState,
  input: string,
  options: ResolveOptions = {},
  aiTarget: DeleteTarget | null = null
): TimelyState {
  const now = options.now ?? new Date();
  const createId = options.createId ?? createLocalId;
  const createdAt = toShanghaiIso(now);
  const createdAtMs = now.getTime();
  const rawText = input.trim();
  const normalizedText = normalizeText(rawText);
  const userMessage = createMessage("user", rawText, createdAt, createId);
  const pending = current.pendingClarification?.kind === "event_delete" ? current.pendingClarification : null;
  const parsedTarget = parseDeleteTarget(normalizedText, now);
  const startsAt =
    aiTarget?.startsAt ?? parsedTarget.startsAt ?? buildPendingDateTime(pending?.targetDate, parsedTarget.time);
  const targetDate =
    aiTarget?.targetDate ?? dateKeyFromIso(startsAt) ?? parsedTarget.targetDate ?? pending?.targetDate ?? null;
  const title = cleanTitle(aiTarget?.title) ?? parsedTarget.title ?? pending?.title ?? null;
  const period = parsedTarget.period ?? aiTarget?.period ?? null;

  if (!title) {
    return appendAssistant(current, userMessage, "删除什么？", createdAt, createId);
  }

  if (!targetDate && !startsAt) {
    const titleOnlyMatches = findDeleteMatches(current.events, {
      title,
      targetDate: null,
      startsAt: null,
      time: null,
      period
    });

    if (titleOnlyMatches.length === 1) {
      return deleteMatchedEvent(current, userMessage, titleOnlyMatches[0], createdAt, createId);
    }

    if (titleOnlyMatches.length > 1) {
      return {
        ...current,
        pendingClarification: {
          kind: "event_delete",
          title,
          targetDate: null,
          sourceText: rawText,
          createdAt: createdAtMs
        },
        messages: [
          ...current.messages,
          userMessage,
          createMessage("assistant", `有多条${title}记录，请再告诉是哪天几点的。`, createdAt, createId)
        ]
      };
    }

    return {
      ...current,
      pendingClarification: null,
      messages: [...current.messages, userMessage, createMessage("assistant", "没找到这条记录。", createdAt, createId)]
    };
  }

  const matches = findDeleteMatches(current.events, {
    title,
    targetDate,
    startsAt,
    time: parsedTarget.time,
    period
  });

  if (matches.length === 0) {
    return {
      ...current,
      pendingClarification: null,
      messages: [...current.messages, userMessage, createMessage("assistant", "没找到这条记录。", createdAt, createId)]
    };
  }

  if (matches.length > 1) {
    return {
      ...current,
      pendingClarification: {
        kind: "event_delete",
        title,
        targetDate,
        sourceText: pending ? `${pending.sourceText} ${rawText}` : rawText,
        createdAt: createdAtMs
      },
      messages: [
        ...current.messages,
        userMessage,
        createMessage("assistant", `这天有多条${title}记录，请再告诉我是几点的。`, createdAt, createId)
      ]
    };
  }

  const [matchedEvent] = matches;
  return deleteMatchedEvent(current, userMessage, matchedEvent, createdAt, createId);
}

function deleteMatchedEvent(
  current: TimelyState,
  userMessage: ConversationMessage,
  matchedEvent: CalendarEvent,
  createdAt: string,
  createId: (prefix: string) => string
): TimelyState {
  return {
    ...current,
    pendingClarification: null,
    events: current.events.map((event) =>
      event.id === matchedEvent.id ? { ...event, status: "cancelled", updatedAt: createdAt } : event
    ),
    messages: [
      ...current.messages,
      userMessage,
      createMessage("assistant", buildDeletedReply(matchedEvent), createdAt, createId)
    ]
  };
}

function appendAssistant(
  current: TimelyState,
  userMessage: ConversationMessage,
  reply: string,
  createdAt: string,
  createId: (prefix: string) => string
): TimelyState {
  return {
    ...current,
    messages: [...current.messages, userMessage, createMessage("assistant", reply, createdAt, createId)]
  };
}

function createEvent({
  title,
  startsAt,
  endsAt = null,
  location = null,
  notes = null,
  sourceText,
  createdAt,
  createId
}: {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  notes?: string | null;
  sourceText: string;
  createdAt: string;
  createId: (prefix: string) => string;
}): CalendarEvent {
  return {
    id: createId("event"),
    title,
    startsAt,
    endsAt,
    location,
    notes,
    status: "active",
    sourceText,
    createdAt,
    updatedAt: createdAt
  };
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

function parseDateTime(text: string, now: Date) {
  const date = parseDate(text, now);
  const time = parseTime(text);

  if (!date || !time || !isValidShanghaiDateParts(date.year, date.month, date.day)) {
    return null;
  }

  return buildShanghaiIso(date.year, date.month, date.day, time.hour, time.minute);
}

function parseDeleteTarget(text: string, now: Date): DeleteTarget {
  const date = parseDate(text, now);
  const time = parseTime(text);
  const validDate = date && isValidShanghaiDateParts(date.year, date.month, date.day) ? date : null;
  const startsAt =
    validDate && time ? buildShanghaiIso(validDate.year, validDate.month, validDate.day, time.hour, time.minute) : null;

  return {
    title: extractDeleteTitle(text),
    targetDate: validDate ? formatDateKey(validDate) : null,
    startsAt,
    time,
    period: parsePeriod(text)
  };
}

function parseDate(text: string, now: Date): DateParts | null {
  const current = getShanghaiParts(now);
  const explicitYear = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})[日号]?/);

  if (explicitYear) {
    return {
      year: Number(explicitYear[1]),
      month: Number(explicitYear[2]),
      day: Number(explicitYear[3])
    };
  }

  const monthDay = text.match(/(\d{1,2})月\s*(\d{1,2})[日号]?/);

  if (monthDay) {
    let year = current.year;
    if (/明年/.test(text)) {
      year += 1;
    }
    if (/去年/.test(text)) {
      year -= 1;
    }

    return {
      year,
      month: Number(monthDay[1]),
      day: Number(monthDay[2])
    };
  }

  const weekday = text.match(/(上|下|这|本)?(?:周|星期|礼拜)([日天一二三四五六])/);

  if (weekday) {
    return parseWeekdayDate(current, weekday[1], weekday[2]);
  }

  const relativeMonthDay = text.match(/(上个月|上月|这个月|本月|下个月|下月)([零〇一二两三四五六七八九十]{1,3}|\d{1,2})[日号]/);

  if (relativeMonthDay) {
    const day = parseNumberText(relativeMonthDay[2]);
    if (day === null) {
      return null;
    }

    return shiftMonthDate(current, relativeMonthOffset(relativeMonthDay[1]), day);
  }

  if (/今天/.test(text)) {
    return current;
  }

  if (/明天/.test(text)) {
    return addDays(current, 1);
  }

  if (/昨天/.test(text)) {
    return addDays(current, -1);
  }

  const dayOnly = text.match(/(\d{1,2})[日号]/);

  if (dayOnly) {
    return {
      year: current.year,
      month: current.month,
      day: Number(dayOnly[1])
    };
  }

  return null;
}

function parseTime(text: string): TimeParts | null {
  const colonTime = text.match(/([01]?\d|2[0-3])[:：]([0-5]\d)/);

  if (colonTime) {
    return normalizeHour(text, Number(colonTime[1]), Number(colonTime[2]));
  }

  const hourTime = text.match(/(\d{1,2})点(?:(半)|(\d{1,2})分?)?/);

  if (!hourTime) {
    const chineseHourTime = text.match(/([零〇一二两三四五六七八九十]{1,3})点(?:(半)|([零〇一二两三四五六七八九十]{1,3})分?)?/);

    if (!chineseHourTime) {
      return null;
    }

    const hour = parseChineseNumber(chineseHourTime[1]);
    const minute = chineseHourTime[2] ? 30 : parseChineseNumber(chineseHourTime[3] ?? "零");

    if (hour === null || minute === null) {
      return null;
    }

    return normalizeHour(text, hour, minute);
  }

  const minute = hourTime[2] ? 30 : Number(hourTime[3] ?? 0);
  return normalizeHour(text, Number(hourTime[1]), minute);
}

function parseChineseNumber(text: string) {
  const digits: Record<string, number> = {
    零: 0,
    "〇": 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };

  if (text === "十") {
    return 10;
  }

  if (text.startsWith("十")) {
    return 10 + (digits[text[1]] ?? 0);
  }

  if (text.includes("十")) {
    const [tens, ones = ""] = text.split("十");
    return (digits[tens] ?? 0) * 10 + (ones ? digits[ones] ?? 0 : 0);
  }

  return digits[text] ?? null;
}

function normalizeHour(text: string, hour: number, minute: number): TimeParts | null {
  if (hour > 23 || minute > 59) {
    return null;
  }

  let normalizedHour = hour;
  if (/(下午|晚上|傍晚)/.test(text) && normalizedHour < 12) {
    normalizedHour += 12;
  }
  if (/中午/.test(text) && normalizedHour > 0 && normalizedHour < 11) {
    normalizedHour += 12;
  }

  return {
    hour: normalizedHour,
    minute
  };
}

function extractTitle(text: string) {
  return text
    .replace(/\d{4}年\s*\d{1,2}月\s*\d{1,2}[日号]?/g, "")
    .replace(/(?:今年|明年|去年)?\d{1,2}月\s*\d{1,2}[日号]?/g, "")
    .replace(/(?:上个月|上月|这个月|本月|下个月|下月)(?:[零〇一二两三四五六七八九十]{1,3}|\d{1,2})[日号]/g, "")
    .replace(/(上|下|这|本)?(?:周|星期|礼拜)[日天一二三四五六]/g, "")
    .replace(/今天|明天|昨天/g, "")
    .replace(/(?:上午|早上|下午|晚上|傍晚|中午)?\d{1,2}[:：][0-5]\d/g, "")
    .replace(/(?:上午|早上|下午|晚上|傍晚|中午)?\d{1,2}点(?:半|\d{1,2}分?)?/g, "")
    .replace(/(?:上午|早上|下午|晚上|傍晚|中午)?[零〇一二两三四五六七八九十]{1,3}点(?:半|[零〇一二两三四五六七八九十]{1,3}分?)?/g, "")
    .replace(/^(我想|我要|我需要|需要|要)/g, "")
    .replace(/[，。,.、；;：:\s]?的?(飞机|航班|高铁|火车|车票|机票)$/g, "")
    .replace(/^(请|麻烦)?(帮我|给我)?(记录一下|记录|记一下|记一笔|记|新增|添加|加一个|加个|加)(一下)?/g, "")
    .replace(/^(我想|我要|需要|要)?(记录一下|记录|记一下|记一笔|记|新增|添加|加一个|加个|加)(一下)?/g, "")
    .replace(/^(有一个|有个|有一场|有一次|一个|一场|一次|有)/g, "")
    .replace(/[，。,.、；;：:\s]/g, "")
    .replace(/^(有一个|有个|有一场|有一次|一个|一场|一次|有)/g, "")
    .replace(/^的/g, "")
    .replace(/(这件事|这个事情|这件事情)$/g, "")
    .trim();
}

function extractDeleteTitle(text: string) {
  return cleanTitle(
    extractTitle(text)
      .replace(/(上|下|这|本)?(?:周|星期|礼拜)[日天一二三四五六]/g, "")
      .replace(/(\d{1,2})[日号]/g, "")
      .replace(/(?:到|至|-|—)\s*(?:上午|早上|下午|晚上|傍晚|中午)?\d{1,2}点(?:半|\d{1,2}分?)?/g, "")
      .replace(/^(请|麻烦)?(帮我|给我)?把?/g, "")
      .replace(/(帮我|给我|把)/g, "")
      .replace(/(删除|删掉|删了|清除|取消|移除|去掉)(一下|了)?/g, "")
      .replace(/(上午|早上|下午|晚上|傍晚|中午)/g, "")
      .replace(/(这个|那个|这条|那条|的|记录|事件|日程)/g, "")
  );
}

function isLikelyEventRecord(text: string) {
  if (isReminderRequest(text)) {
    return false;
  }

  return /(记录|记一下|记一笔|新增|添加|会议|开会|日程|事情|事项|有个|有一个|有一场|有一次|我要去|要去|去.+?(?:飞机|航班|高铁|火车|车票|机票)|飞机|航班|高铁|火车)/.test(text);
}

function isDeleteRequest(text: string) {
  return /(删除|删掉|删了|清除|取消|移除|去掉)/.test(text);
}

function isReminderRequest(text: string) {
  return /提醒/.test(text);
}

function buildRecordedReply(event: CalendarEvent) {
  return `已记录。${formatRecordDateTime(event.startsAt)}，${event.title}。`;
}

function buildDeletedReply(event: CalendarEvent) {
  return `已删除。${formatRecordDateTime(event.startsAt)}，${event.title}。`;
}

function findDeleteMatches(events: CalendarEvent[], target: DeleteTarget) {
  return events.filter((event) => {
    if (event.status !== "active") {
      return false;
    }

    if (target.targetDate && dayKeyFromIso(event.startsAt) !== target.targetDate) {
      return false;
    }

    if (target.startsAt && !isSameEventMinute(event.startsAt, target.startsAt)) {
      return false;
    }

    if (target.period && !isInPeriod(event.startsAt, target.period)) {
      return false;
    }

    return titleMatches(event.title, target.title);
  });
}

function titleMatches(eventTitle: string, targetTitle: string | null) {
  const normalizedEventTitle = normalizeTitleForMatch(eventTitle);
  const normalizedTargetTitle = normalizeTitleForMatch(targetTitle ?? "");

  if (!normalizedTargetTitle) {
    return true;
  }

  if (normalizedEventTitle.includes(normalizedTargetTitle) || normalizedTargetTitle.includes(normalizedEventTitle)) {
    return true;
  }

  return isMeetingTitle(normalizedEventTitle) && isMeetingTitle(normalizedTargetTitle);
}

function normalizeTitleForMatch(title: string) {
  return title.replace(/[，。,.、；;：:\s]/g, "").trim();
}

function isMeetingTitle(title: string) {
  return /(会议|开会|会$)/.test(title);
}

function isSameEventMinute(firstIso: string, secondIso: string) {
  const first = getShanghaiParts(new Date(firstIso));
  const second = getShanghaiParts(new Date(secondIso));

  return (
    first.year === second.year &&
    first.month === second.month &&
    first.day === second.day &&
    first.hour === second.hour &&
    first.minute === second.minute
  );
}

function isInPeriod(iso: string, period: DeleteTarget["period"]) {
  const { hour } = getShanghaiParts(new Date(iso));

  if (period === "morning") {
    return hour >= 5 && hour < 12;
  }

  if (period === "afternoon") {
    return hour >= 12 && hour <= 18;
  }

  if (period === "evening") {
    return hour >= 18 || hour < 5;
  }

  return true;
}

function parsePeriod(text: string): DeleteTarget["period"] {
  if (/上午|早上/.test(text)) {
    return "morning";
  }

  if (/下午|中午/.test(text)) {
    return "afternoon";
  }

  if (/晚上|傍晚/.test(text)) {
    return "evening";
  }

  return null;
}

function parseWeekdayDate(current: DateParts, modifier: string | undefined, weekdayText: string): DateParts {
  const targetDay = weekdayIndex(weekdayText);
  const currentDate = new Date(Date.UTC(current.year, current.month - 1, current.day));
  const currentDay = currentDate.getUTCDay();
  let delta = targetDay - currentDay;

  if (modifier === "下") {
    delta += 7;
  }

  if (modifier === "上") {
    delta -= 7;
  }

  if (!modifier && delta < 0) {
    delta += 7;
  }

  return addDays(current, delta);
}

function parseNumberText(text: string) {
  if (/^\d{1,2}$/.test(text)) {
    return Number(text);
  }

  return parseChineseNumber(text);
}

function relativeMonthOffset(text: string) {
  if (/上/.test(text)) {
    return -1;
  }

  if (/下/.test(text)) {
    return 1;
  }

  return 0;
}

function shiftMonthDate(current: DateParts, monthOffset: number, day: number): DateParts {
  const date = new Date(Date.UTC(current.year, current.month - 1 + monthOffset, 1));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day
  };
}

function weekdayIndex(text: string) {
  const indexByText: Record<string, number> = {
    日: 0,
    天: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6
  };

  return indexByText[text] ?? 0;
}

function cleanTitle(value: string | null | undefined) {
  const title = value?.replace(/[，。,.、；;：:\s]/g, "").trim();
  return title || null;
}

function formatRecordDateTime(iso: string) {
  const date = new Date(iso);
  const parts = getShanghaiParts(date);
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");

  return `${parts.month}月${parts.day}日 ${hour}:${minute}`;
}

function normalizeText(text: string) {
  return text
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ":")
    .trim();
}

function addDays(parts: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function formatDateKey(parts: DateParts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function dayKeyFromIso(iso: string) {
  return toShanghaiDayKey(iso);
}

function dateKeyFromIso(iso: string | null | undefined) {
  return iso ? dayKeyFromIso(iso) : null;
}

function buildPendingDateTime(targetDate: string | null | undefined, time: TimeParts | null) {
  if (!targetDate || !time) {
    return null;
  }

  const [year, month, day] = targetDate.split("-").map(Number);
  if (!isValidShanghaiDateParts(year, month, day)) {
    return null;
  }

  return buildShanghaiIso(year, month, day, time.hour, time.minute);
}
