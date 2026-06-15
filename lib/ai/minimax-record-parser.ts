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

  logMiniMaxRawContent(content);

  return normalizeMiniMaxRecordResult(JSON.parse(extractMiniMaxJsonContent(content)));
}

function logMiniMaxRawContent(content: string) {
  if (process.env.NODE_ENV !== "production") {
    console.log("【MiniMax 原始返回】:", content);
  }
}

function buildMiniMaxRequest(input: string, now: Date) {
  return {
    model: process.env.OPENAI_MODEL ?? process.env.MINIMAX_MODEL ?? DEFAULT_MINIMAX_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "你是 Timely 的语义审阅与结构化记录解析器。",
          "不要按关键词或正则猜测；你必须先理解用户真正想记录的对象、时间、金额和上下文，再整理成符合 schema 的 JSON。",
          "只输出符合 schema 的 JSON；不要输出解释、Markdown 或额外字段。",
          "Timely 可以记录两类内容：事件和记账流水；不要创建提醒、规划或任务。",
          "默认时区是 Asia/Shanghai，所有日期时间都要输出为 Asia/Shanghai ISO datetime。",
          "先判断用户真实意图：要做、要去、要参加、删除某个日程 => 事件；花了、买了、收入、报销、工资、转账等资金变动 => 流水；无法归类 => unsupported。",
          "事件创建使用 create_event，事件删除使用 delete_event；缺失关键信息时使用 needs_clarification。",
          "事件 title 必须是用户真正要记录或删除的事项名，不要把自然语言原句直接塞进 title。",
          "出行表达也是事件，例如“我要去广州，六点的飞机”应返回 create_event，title=去广州，notes=飞机。",
          "“下个月六号”“下月6号”“这个月二十号”这类相对月份日期必须结合当前时间换算成具体 Asia/Shanghai 日期。",
          "事件缺少时间时 clarificationQuestion 必须是“什么时候？”。",
          "事件缺少事项名时 clarificationQuestion 必须是“记录什么？”。",
          "流水使用 create_ledger。",
          "流水 direction 只能是 expense 或 income。",
          "流水金额必须是用户语义上付出或收到的钱；不要把日期、时间、序号、数量、楼层等数字当成金额。",
          "即使用户没有说明货币单位（如元、块），只要语境是花费或收入（如‘花了我600’），也必须提取出数字作为金额，例如 600 返回 60000。",
          "流水 amountCents 是人民币分，例如 38 元返回 3800，26.5 元返回 2650。",
          "流水 currency 固定为 CNY。",
          "流水 category 使用简短中文分类，例如 餐饮、交通、工资、报销、购物；无法判断时用 未分类。",
          "流水 occurredAt 是 Asia/Shanghai ISO datetime。",
          "如果流水没有日期或时间，默认记为当前时间。",
          "如果用户说昨天、前天或明确日期，但没有具体几点，使用当前时间的时分。",
          "缺少流水金额时 clarificationQuestion 必须是“金额是多少？”。",
          "流水收支方向无法判断时 clarificationQuestion 必须是“这是收入还是支出？”。",
          "例如“上个月7号买了个抽湿机”只有日期和购买对象，没有金额，必须返回 intent=needs_clarification,clarificationQuestion=金额是多少？。",
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
        content: "当前时间：2026/06/16 02:37:00\n用户输入：下个月六号我要去广州，六点的飞机"
      },
      {
        role: "assistant",
        content: JSON.stringify({
          intent: "create_event",
          title: "去广州",
          startsAt: "2026-07-06T06:00:00+08:00",
          endsAt: null,
          location: null,
          notes: "飞机",
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
    const direction: "expense" | "income" | null =
      value.direction === "expense" || value.direction === "income" ? value.direction : null;
    const amountCents = normalizeAmountCents(value.amountCents);
    const result = {
      intent: "create_ledger" as const,
      direction,
      amountCents,
      currency: value.currency === "CNY" ? ("CNY" as const) : null,
      category: nullableString(value.category),
      occurredAt: normalizeMiniMaxDateTime(value.occurredAt),
      counterparty: nullableString(value.counterparty),
      note: nullableString(value.note),
      clarificationQuestion: normalizeLedgerQuestion(value.clarificationQuestion)
    };

    if (amountCents === null) {
      return {
        ...result,
        intent: "needs_clarification",
        clarificationQuestion: "金额是多少？"
      };
    }

    return {
      ...result,
      amountCents
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
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const amountCents = Math.round(value);
    return Number.isSafeInteger(amountCents) && amountCents > 0 ? amountCents : null;
  }

  if (typeof value === "string") {
    const amountCents = parseInt(value, 10);
    return Number.isSafeInteger(amountCents) && amountCents > 0 ? amountCents : null;
  }

  return null;
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

function normalizeEventQuestion(value: unknown): "什么时候？" | "记录什么？" | null {
  if (value === "什么时候？" || value === "记录什么？") {
    return value;
  }

  return null;
}

function normalizeLedgerQuestion(value: unknown): "金额是多少？" | "这是收入还是支出？" | null {
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
