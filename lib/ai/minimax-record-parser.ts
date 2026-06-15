import type { AiRecordParseResult } from "@/lib/record-input";
import type { AiEventParseResult } from "@/lib/event-recording";

type ParseOptions = {
  now?: Date;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type MiniMaxChoice = {
  message?: {
    content?: string;
  };
};

const DEFAULT_OPENAI_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_MINIMAX_MODEL = "MiniMax-M3";
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

const recordParseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["create_event", "delete_event", "create_ledger", "needs_clarification", "unsupported"]
    },
    title: {
      type: ["string", "null"]
    },
    startsAt: {
      type: ["string", "null"]
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
      type: ["string", "null"]
    },
    direction: {
      type: ["string", "null"],
      enum: ["expense", "income", null]
    },
    amountCents: {
      type: ["integer", "null"]
    },
    currency: {
      type: ["string", "null"],
      enum: ["CNY", null]
    },
    category: {
      type: ["string", "null"]
    },
    occurredAt: {
      type: ["string", "null"]
    },
    counterparty: {
      type: ["string", "null"]
    },
    note: {
      type: ["string", "null"]
    },
    clarificationQuestion: {
      type: ["string", "null"],
      enum: ["什么时候？", "记录什么？", "金额是多少？", "这是收入还是支出？", null]
    }
  },
  required: [
    "intent",
    "title",
    "startsAt",
    "endsAt",
    "location",
    "notes",
    "targetDate",
    "direction",
    "amountCents",
    "currency",
    "category",
    "occurredAt",
    "counterparty",
    "note",
    "clarificationQuestion"
  ]
} as const;

export async function parseMiniMaxRecordInput(
  input: string,
  options: ParseOptions = {}
): Promise<AiRecordParseResult> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or MINIMAX_API_KEY is not configured");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);

  const response = await fetch(getMiniMaxChatCompletionsUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildMiniMaxRequest(input, options.now ?? new Date())),
    signal
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

  return normalizeMiniMaxRecordResult(JSON.parse(extractMiniMaxJsonContent(content)));
}

function buildMiniMaxRequest(input: string, now: Date) {
  return {
    model: process.env.OPENAI_MODEL ?? process.env.MINIMAX_MODEL ?? DEFAULT_MINIMAX_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "你是 Timely 的自然语言记录解析器，只把用户输入解析成 JSON。",
          "Timely 可以记录事件，也可以记录记账流水；不要创建提醒、规划或任务。",
          "默认时区是 Asia/Shanghai。",
          "事件仍使用 create_event 或 delete_event，规则与 Timely 事件记录解析器一致。",
          "流水使用 create_ledger。",
          "流水 direction 只能是 expense 或 income。",
          "流水 amountCents 是人民币分，例如 38 元返回 3800，26.5 元返回 2650。",
          "流水 currency 固定为 CNY。",
          "流水 category 使用简短中文分类，例如 餐饮、交通、工资、报销、购物；无法判断时用 未分类。",
          "流水 occurredAt 是 Asia/Shanghai ISO datetime。",
          "如果流水没有日期或时间，默认记为当前时间。",
          "如果用户说昨天、前天或明确日期，但没有具体几点，使用当前时间的时分。",
          "缺少流水金额时 clarificationQuestion 必须是“金额是多少？”。",
          "流水收支方向无法判断时 clarificationQuestion 必须是“这是收入还是支出？”。",
          "例如“今天午饭花了38”必须返回 intent=create_ledger,direction=expense,amountCents=3800,category=餐饮。",
          "例如“昨天打车26.5”必须返回 intent=create_ledger,direction=expense,amountCents=2650,category=交通。",
          "例如“收到工资12000”必须返回 intent=create_ledger,direction=income,amountCents=1200000,category=工资。",
          "不是事件或流水记录时 intent 使用 unsupported。"
        ].join("\n")
      },
      {
        role: "user",
        content: "当前时间：2026/06/15 12:10:00\n用户输入：今天午饭花了38"
      },
      {
        role: "assistant",
        content: JSON.stringify({
          intent: "create_ledger",
          title: null,
          startsAt: null,
          endsAt: null,
          location: null,
          notes: null,
          targetDate: null,
          direction: "expense",
          amountCents: 3800,
          currency: "CNY",
          category: "餐饮",
          occurredAt: "2026-06-15T12:10:00+08:00",
          counterparty: null,
          note: null,
          clarificationQuestion: null
        })
      },
      {
        role: "user",
        content: "当前时间：2026/06/15 12:10:00\n用户输入：帮我记录一下6月20日下午4点开会"
      },
      {
        role: "assistant",
        content: JSON.stringify({
          intent: "create_event",
          title: "开会",
          startsAt: "2026-06-20T16:00:00+08:00",
          endsAt: null,
          location: null,
          notes: null,
          targetDate: null,
          direction: null,
          amountCents: null,
          currency: null,
          category: null,
          occurredAt: null,
          counterparty: null,
          note: null,
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
      schema: recordParseSchema
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

function normalizeMiniMaxRecordResult(value: unknown): AiRecordParseResult {
  if (!isRecord(value)) {
    throw new Error("MiniMax API returned invalid JSON");
  }

  const intent = value.intent;

  if (intent === "create_ledger") {
    return {
      intent,
      direction: value.direction === "expense" || value.direction === "income" ? value.direction : null,
      amountCents: normalizeAmountCents(value.amountCents),
      currency: value.currency === "CNY" ? "CNY" : null,
      category: nullableString(value.category),
      occurredAt: normalizeMiniMaxDateTime(value.occurredAt),
      counterparty: nullableString(value.counterparty),
      note: nullableString(value.note),
      clarificationQuestion: normalizeLedgerQuestion(value.clarificationQuestion)
    };
  }

  if (intent !== "create_event" && intent !== "delete_event" && intent !== "needs_clarification" && intent !== "unsupported") {
    throw new Error("MiniMax API returned invalid intent");
  }

  const result: AiEventParseResult = {
    intent,
    title: nullableString(value.title),
    startsAt: normalizeMiniMaxDateTime(value.startsAt),
    endsAt: normalizeMiniMaxDateTime(value.endsAt),
    location: nullableString(value.location),
    notes: nullableString(value.notes),
    targetDate: normalizeMiniMaxDate(value.targetDate) ?? dateKeyFromDateTime(value.startsAt),
    clarificationQuestion: normalizeEventQuestion(value.clarificationQuestion)
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

  return result;
}

function normalizeAmountCents(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
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

function normalizeEventQuestion(value: unknown) {
  if (value === "什么时候？" || value === "记录什么？") {
    return value;
  }

  return null;
}

function normalizeLedgerQuestion(value: unknown) {
  if (value === "金额是多少？" || value === "这是收入还是支出？") {
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
