export type MiniMaxEventParseResult = {
  intent: "create_event" | "delete_event" | "needs_clarification" | "unsupported";
  title: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  targetDate: string | null;
  clarificationQuestion: "什么时候？" | "记录什么？" | null;
};

type ParseOptions = {
  now?: Date;
  signal?: AbortSignal;
};

type MiniMaxChoice = {
  message?: {
    content?: string;
  };
};

const DEFAULT_OPENAI_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_MINIMAX_MODEL = "MiniMax-M3";

const eventParseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["create_event", "delete_event", "needs_clarification", "unsupported"]
    },
    title: {
      type: ["string", "null"],
      description: "Canonical event title only. Remove command words, pronouns, dates and times; for example 我要健身 -> 健身."
    },
    startsAt: {
      type: ["string", "null"],
      description: "Asia/Shanghai ISO datetime, for example 2026-06-13T15:00:00+08:00"
    },
    endsAt: {
      type: ["string", "null"]
    },
    location: {
      type: ["string", "null"]
    },
    notes: {
      type: ["string", "null"]
    },
    targetDate: {
      type: ["string", "null"],
      description: "Asia/Shanghai date for deleting an existing event, for example 2026-06-13"
    },
    clarificationQuestion: {
      type: ["string", "null"],
      enum: ["什么时候？", "记录什么？", null]
    }
  },
  required: ["intent", "title", "startsAt", "endsAt", "location", "notes", "targetDate", "clarificationQuestion"]
} as const;

export async function parseMiniMaxEventInput(
  input: string,
  options: ParseOptions = {}
): Promise<MiniMaxEventParseResult> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or MINIMAX_API_KEY is not configured");
  }

  const response = await fetch(getMiniMaxChatCompletionsUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildMiniMaxRequest(input, options.now ?? new Date())),
    signal: options.signal
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`MiniMax API request failed: ${response.status} ${detail.slice(0, 240)}`);
  }

  const data = (await response.json()) as { choices?: MiniMaxChoice[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("MiniMax API response did not include message content");
  }

  return normalizeMiniMaxResult(JSON.parse(extractMiniMaxJsonContent(content)));
}

function buildMiniMaxRequest(input: string, now: Date) {
  return {
    model: process.env.OPENAI_MODEL ?? process.env.MINIMAX_MODEL ?? DEFAULT_MINIMAX_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "你是 Timely 的事件记录解析器，只把用户输入解析成 JSON。",
          "Timely 只记录事件，不创建提醒，不做规划。",
          "用户可以记录过去或未来的明确时间点。",
          "用户也可以删除、取消、清除已经记录的事件；这类输入使用 delete_event。",
          "删除、取消、清除、移除、去掉不是新增记录，也不是缺少标题。",
          "默认时区是 Asia/Shanghai。",
          "无年份日期使用当前年份；即使日期已经过去，也不要自动改到明年。",
          "title 必须是用户真正要记录或删除的事项名，不能包含“帮我、我要、我想、加一个、记录、删除、明天、周六、下午四点”等命令词、主语、日期或时间。",
          "例如“我明天下午五点要健身”必须返回 title=健身。",
          "例如“下周三上午十点半产品评审”必须返回 title=产品评审。",
          "只要标题和开始时间明确，就必须使用 create_event；endsAt 可以是 null。",
          "create_event 必须有 title 和 startsAt。",
          "delete_event 必须尽量给出 title 和 targetDate；如果用户给了具体时间，必须给出 startsAt。",
          "delete_event 缺少具体时刻时不要反问，targetDate 明确即可。",
          "例如“帮我删除6月13日的会议”必须返回 intent=delete_event,title=会议,targetDate=2026-06-13。",
          "例如在当前时间 2026/06/14 时，“帮我把周六下午四点的会议删掉”必须返回 intent=delete_event,title=会议,targetDate=2026-06-20,startsAt=2026-06-20T16:00:00+08:00。",
          "不要因为缺少结束时间、地点或备注而反问。",
          "缺少时间时 clarificationQuestion 必须是“什么时候？”。",
          "缺少标题时 clarificationQuestion 必须是“记录什么？”。",
          "不是事件记录时 intent 使用 unsupported。"
        ].join("\n")
      },
      {
        role: "user",
        content: "当前时间：2026/06/10 10:00:00\n用户输入：帮我删除6月13日的会议"
      },
      {
        role: "assistant",
        content: JSON.stringify({
          intent: "delete_event",
          title: "会议",
          startsAt: null,
          endsAt: null,
          location: null,
          notes: null,
          targetDate: "2026-06-13",
          clarificationQuestion: null
        })
      },
      {
        role: "user",
        content: "当前时间：2026/06/14 10:00:00\n用户输入：我明天下午五点要健身"
      },
      {
        role: "assistant",
        content: JSON.stringify({
          intent: "create_event",
          title: "健身",
          startsAt: "2026-06-15T17:00:00+08:00",
          endsAt: null,
          location: null,
          notes: null,
          targetDate: null,
          clarificationQuestion: null
        })
      },
      {
        role: "user",
        content: "当前时间：2026/06/14 10:00:00\n用户输入：帮我把周六下午四点的会议删掉"
      },
      {
        role: "assistant",
        content: JSON.stringify({
          intent: "delete_event",
          title: "会议",
          startsAt: "2026-06-20T16:00:00+08:00",
          endsAt: null,
          location: null,
          notes: null,
          targetDate: "2026-06-20",
          clarificationQuestion: null
        })
      },
      {
        role: "user",
        content: `当前时间：${formatShanghaiContext(now)}\n用户输入：${input}`
      }
    ],
    response_format: {
      type: "json_object",
      schema: eventParseSchema
    }
  };
}

function getMiniMaxChatCompletionsUrl() {
  if (process.env.OPENAI_CHAT_COMPLETIONS_URL) {
    return process.env.OPENAI_CHAT_COMPLETIONS_URL;
  }

  if (process.env.MINIMAX_API_URL) {
    return process.env.MINIMAX_API_URL;
  }

  const baseUrl = process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL;
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function normalizeMiniMaxResult(value: unknown): MiniMaxEventParseResult {
  if (!isRecord(value)) {
    throw new Error("MiniMax API returned invalid JSON");
  }

  const normalizedValue = normalizeMiniMaxShape(value);
  if (!normalizedValue) {
    throw new Error("MiniMax API returned invalid JSON");
  }

  return finalizeMiniMaxResult(normalizedValue);
}

function normalizeMiniMaxShape(value: Record<string, unknown>) {
  if (Array.isArray(value.events) && isRecord(value.events[0])) {
    return {
      ...value,
      title: value.title ?? value.events[0].title,
      startsAt: value.startsAt ?? value.events[0].startsAt,
      endsAt: value.endsAt ?? value.events[0].endsAt,
      location: value.location ?? value.events[0].location,
      notes: value.notes ?? value.events[0].notes,
      targetDate: value.targetDate ?? value.events[0].targetDate
    };
  }

  if (isRecord(value.event)) {
    return {
      ...value,
      title: value.title ?? value.event.title,
      startsAt: value.startsAt ?? value.event.startsAt,
      endsAt: value.endsAt ?? value.event.endsAt,
      location: value.location ?? value.event.location,
      notes: value.notes ?? value.event.notes,
      targetDate: value.targetDate ?? value.event.targetDate
    };
  }

  return value;
}

function finalizeMiniMaxResult(value: Record<string, unknown>): MiniMaxEventParseResult {
  const intent = value.intent;
  if (intent !== "create_event" && intent !== "delete_event" && intent !== "needs_clarification" && intent !== "unsupported") {
    throw new Error("MiniMax API returned invalid intent");
  }

  const result: MiniMaxEventParseResult = {
    intent,
    title: nullableString(value.title),
    startsAt: normalizeMiniMaxDateTime(value.startsAt),
    endsAt: normalizeMiniMaxDateTime(value.endsAt),
    location: nullableString(value.location),
    notes: nullableString(value.notes),
    targetDate: normalizeMiniMaxDate(value.targetDate) ?? dateKeyFromDateTime(value.startsAt),
    clarificationQuestion: normalizeQuestion(value.clarificationQuestion)
  };

  if (result.intent === "create_event" && !result.title) {
    return {
      ...result,
      intent: "needs_clarification",
      clarificationQuestion: "记录什么？"
    };
  }

  if (result.intent === "create_event" && !result.startsAt) {
    return {
      ...result,
      intent: "needs_clarification",
      clarificationQuestion: "什么时候？"
    };
  }

  if (result.intent === "delete_event" && !result.title) {
    return {
      ...result,
      intent: "needs_clarification",
      clarificationQuestion: "记录什么？"
    };
  }

  return result;
}

function normalizeMiniMaxDate(value: unknown) {
  const text = nullableString(value);
  if (!text) {
    return null;
  }

  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return text;
  }

  const slashDate = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!slashDate) {
    return text;
  }

  const [, year, month, day] = slashDate;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function dateKeyFromDateTime(value: unknown) {
  const dateTime = normalizeMiniMaxDateTime(value);
  return dateTime ? dateTime.slice(0, 10) : null;
}

function normalizeMiniMaxDateTime(value: unknown) {
  const text = nullableString(value);
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\+08:00|Z)$/.test(text)) {
    return text;
  }

  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return text;
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second.padStart(2, "0")}+08:00`;
}

function extractMiniMaxJsonContent(content: string) {
  const fencedJson = content.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson?.[1]) {
    return fencedJson[1].trim();
  }

  const candidates = collectJsonObjects(content);
  const lastCandidate = candidates.at(-1);
  if (lastCandidate) {
    return lastCandidate;
  }

  throw new Error("MiniMax API response did not include JSON content");
}

function collectJsonObjects(content: string) {
  const candidates: string[] = [];
  let searchStart = 0;

  while (searchStart < content.length) {
    const start = content.indexOf("{", searchStart);
    if (start === -1) {
      return candidates;
    }

    const candidate = readJsonObjectAt(content, start);
    if (candidate) {
      candidates.push(candidate.value);
      searchStart = candidate.end + 1;
    } else {
      searchStart = start + 1;
    }
  }

  return candidates;
}

function readJsonObjectAt(content: string, start: number) {
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          value: content.slice(start, index + 1),
          end: index
        };
      }
    }
  }

  return null;
}

function normalizeQuestion(value: unknown) {
  if (value === "什么时候？" || value === "记录什么？") {
    return value;
  }

  return null;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatShanghaiContext(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}
