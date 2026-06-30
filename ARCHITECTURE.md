# Timely 技术架构记录

> 更新日期：2026-06-30
> 产品形态：手机优先、本地优先的自然语言个人记录 Web/PWA
> 当前重点：LangGraph supervisor + write agent + query agent + local JSON datastore

---

## 1. 架构结论

Timely 当前采用 **Next.js 14 + React 18 + TypeScript + Plain CSS** 构建。产品不是提醒 App、任务管理器、效率分析工具或完整记账软件，而是一个手机优先的自然语言个人记录 App。

当前架构已经从单一事件解析扩展为多 agent workflow：

```text
用户自然语言输入
  -> ChatView / useRecordSubmit
  -> LangGraph supervisor agent
      -> query_agent：查询本地个人数据并输出 UI_POPUP
      -> write_agent：写入事件或流水，AI 解析失败时本地 fallback
      -> chat_agent：轻量兜底聊天
  -> TimelyState
  -> localStorage: timely-event-record-state-v1
  -> Calendar / Ledger / Chat popup / Settings
```

核心原则：

- 本地优先：当前没有账号、云同步、后端数据库或权限系统。
- 数据主源：浏览器 `localStorage` 中的一份 `TimelyState` JSON。
- AI 只负责解析，不直接写状态。
- 写入和查询都通过 domain/helper 层处理，UI 不重写解析逻辑。
- 查询个人数据时，assistant 回复不能只给纯文本，必须包含 `UI_POPUP` 结构化 JSON block。

---

## 2. 运行时分层

```text
app/
  layout.tsx
  page.tsx
  globals.css

components/
  timely-app.tsx              # App shell、视图切换、本地状态装配
  timely/chat-view.tsx        # 输入、消息、UI_POPUP 弹窗渲染
  timely/calendar-view.tsx    # 月历、单日时间轴、已取消记录
  timely/ledger-view.tsx      # 本地流水列表、手动新增/编辑
  timely/settings-view.tsx    # 本地状态摘要

hooks/
  use-local-storage-state.ts  # localStorage read/write
  use-record-submit.ts        # 提交输入并调用 LangGraph supervisor
  use-timely-actions.ts       # 取消/恢复事件、流水手动操作

lib/
  agent/app-workflow.ts       # LangGraph supervisor
  agent/record-workflow.ts    # LangGraph write workflow
  agent/query-workflow.ts     # LangGraph query workflow
  record-input.ts             # 统一写入入口：event + ledger + pending
  event-recording.ts          # 事件创建/取消/删除消歧
  ledger-recording.ts         # 流水解析和 pending 补全
  ledger-state.ts             # 流水手动增删改
  state.ts                    # localStorage 状态 normalizer
  time.ts                     # Asia/Shanghai 时间工具
  ui-popup.ts                 # UI_POPUP payload 构造/解析
  types.ts                    # 共享数据模型
```

`public/app.js` 仍只是静态预览/兼容入口，不是长期业务实现。

---

## 3. LangGraph 总体搭建

Timely 使用 `@langchain/langgraph` 的 `StateGraph` 搭建三个 workflow：

1. `app-workflow.ts`：总控 supervisor agent。
2. `record-workflow.ts`：写入 agent，用于事件/流水创建、事件取消、澄清。
3. `query-workflow.ts`：查询 agent，用于本地个人数据查询和弹窗结果生成。

使用 LangGraph 的原因：

- 把“识别意图 -> 路由 -> 调工具/本地函数 -> 汇总结果”拆成显式节点。
- 每次运行都有 `trace`，后续容易接 LangSmith、LangFuse 或 W&B Weave。
- 写入和查询可以作为独立子图演进，不把所有逻辑堆进 React hook。
- AI parser 可依赖注入，测试和 eval 可以不打真实网络。

---

## 4. Supervisor Agent

文件：`lib/agent/app-workflow.ts`

图结构：

```text
START
  -> classify_intent
  -> conditional route
      -> query_agent -> END
      -> write_agent -> END
      -> chat_agent  -> END
```

Supervisor state：

```ts
{
  currentState: TimelyState;
  input: string;
  normalizedInput: string;
  now: Date;
  agent: "query" | "write" | "chat" | null;
  outcome: RecordWorkflowOutcome | "query_answered" | "chat_replied" | null;
  state: TimelyState | null;
  trace: Array<"classify_intent" | "query_agent" | "write_agent" | "chat_agent">;
}
```

路由规则：

- `query_agent`：命中“有什么、哪些、多少、几点、查询、统计、安排、账单、流水、待办”等查询表达，且不是“记录/新增/删除/取消”开头。
- `write_agent`：命中记录、删除、取消、花费、收入、会议、开会、日期时间等写入表达。
- `chat_agent`：非数据操作的兜底轻量回复。

---

## 5. Write Agent

文件：`lib/agent/record-workflow.ts`

图结构：

```text
START
  -> normalize_input
  -> call_ai_parser
  -> conditional route
      -> apply_ai_result
      -> apply_local_fallback
  -> summarize_outcome
  -> END
```

Write workflow state：

```ts
{
  currentState: TimelyState;
  input: string;
  normalizedInput: string;
  now: Date;
  aiResult: AiRecordParseResult | null;
  aiError: string | null;
  route: "ai_result" | "local_fallback" | null;
  outcome:
    | "event_created"
    | "event_cancelled"
    | "ledger_created"
    | "clarification_requested"
    | "pending_cancelled"
    | "unsupported"
    | "assistant_reply"
    | "no_change"
    | null;
  state: TimelyState | null;
  trace: Array<
    | "normalize_input"
    | "call_ai_parser"
    | "apply_ai_result"
    | "apply_local_fallback"
    | "summarize_outcome"
  >;
}
```

写入路径：

```text
useRecordSubmit
  -> runTimelyAgentWorkflow
  -> write_agent
  -> runRecordAgentWorkflow
  -> optional /api/record-input
  -> resolveRecordInputWithAi 或 resolveRecordInput
  -> new TimelyState
```

`/api/record-input` 请求/响应：

```json
{
  "input": "帮我记录一下明天下午4点开会",
  "now": "2026-06-30T10:00:00.000Z"
}
```

```json
{
  "result": {
    "intent": "create_event",
    "title": "开会",
    "startsAt": "2026-07-01T16:00:00+08:00",
    "endsAt": null,
    "location": null,
    "notes": null
  }
}
```

AI 结果进入 domain 层后仍会校验字段自洽性。不自洽、超时或报错时，workflow 会走 `local_fallback`，不会让 UI 中断。

---

## 6. Query Agent

文件：`lib/agent/query-workflow.ts`

图结构：

```text
START
  -> normalize_query
  -> classify_query
  -> query_local_database
  -> format_popup_response
  -> END
```

Query workflow state：

```ts
{
  currentState: TimelyState;
  input: string;
  normalizedInput: string;
  now: Date;
  queryPlan: {
    kind: "schedule" | "ledger" | "task";
    timeRange: {
      label: string;
      from: string;
      to: string;
    };
    category: string | null;
    title: string | null;
  } | null;
  queryResult: UiPopupPayload | null;
  state: TimelyState | null;
  trace: Array<
    | "normalize_query"
    | "classify_query"
    | "query_local_database"
    | "format_popup_response"
  >;
}
```

查询能力：

- 日程/会议查询：读取 `events` 中 `status === "active"` 的事件。
- 财务/开销查询：读取 `ledgerEntries`，汇总支出、收入和净额。
- 待办/任务查询：当前没有任务模型，因此返回结构化 empty popup。
- 时间窗口：支持今天、明天、后天、昨天、上个月、下个月、本月、上/下/本周几，以及上午、下午、晚上等日内窗口。
- 类别推断：外卖/午饭/晚饭等归为餐饮，打车/地铁等归为交通，工资/报销归为对应收入分类。

查询结果会写入 `messages`：

````text
assistant message =
  简短垫话
  +
  ```json UI_POPUP
  { ...structured payload... }
  ```
````

即使没有记录，也必须输出 `query_status: "empty"` 的 `UI_POPUP`，让前端显示“暂无记录”的结构化窗口。

---

## 7. UI_POPUP 协议

文件：`lib/ui-popup.ts`

payload 结构：

```ts
type UiPopupPayload = {
  type: "timely_query_result";
  query_kind: "schedule" | "ledger" | "task";
  query_status: "success" | "empty";
  title: string;
  summary: string;
  time_range: {
    label: string;
    from: string;
    to: string;
  };
  metrics: Array<{
    label: string;
    value: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    startsAt: string;
    location: string | null;
    notes: string | null;
  }>;
  ledger: {
    entries: Array<{
      id: string;
      direction: "expense" | "income";
      amountCents: number;
      category: string;
      occurredAt: string;
      note: string | null;
    }>;
    totalExpenseCents: number;
    totalIncomeCents: number;
    netCents: number;
  };
};
```

成功示例：

````text
我查到了，明天下午有 1 条安排。

```json UI_POPUP
{"type":"timely_query_result","query_kind":"schedule","query_status":"success","title":"明天下午安排","summary":"找到 1 条安排","time_range":{"label":"明天下午","from":"2026-07-01T12:00:00+08:00","to":"2026-07-01T17:59:59+08:00"},"metrics":[{"label":"安排","value":"1 条"}],"events":[{"id":"event-1","title":"产品评审","startsAt":"2026-07-01T15:00:00+08:00","location":"会议室 A","notes":null}],"ledger":{"entries":[],"totalExpenseCents":0,"totalIncomeCents":0,"netCents":0}}
```
````

空结果示例：

````text
我查了一下，今天暂无相关记录。

```json UI_POPUP
{"type":"timely_query_result","query_kind":"task","query_status":"empty","title":"今天待办","summary":"暂无记录","time_range":{"label":"今天","from":"2026-06-30T00:00:00+08:00","to":"2026-06-30T23:59:59+08:00"},"metrics":[],"events":[],"ledger":{"entries":[],"totalExpenseCents":0,"totalIncomeCents":0,"netCents":0}}
```
````

前端 `ChatView` 会：

- 用 `extractUiPopupFromMessage` 解析最近一条弹窗 payload。
- 用 `stripUiPopupBlock` 从聊天气泡中隐藏 JSON block。
- 渲染 `query-popup-panel`，展示指标、日程卡片、流水卡片或 empty state。

---

## 8. 本地数据库 JSON 结构

当前“数据库”是浏览器 `localStorage` 的 JSON 文档。

存储 key：

```text
timely-event-record-state-v1
```

顶层结构：

```ts
type TimelyState = {
  events: CalendarEvent[];
  reminders: Reminder[];
  ledgerEntries: LedgerEntry[];
  messages: ConversationMessage[];
  pendingClarification: PendingClarification | null;
};
```

完整 JSON 示例：

```json
{
  "events": [
    {
      "id": "event-1",
      "title": "产品评审",
      "startsAt": "2026-07-01T15:00:00+08:00",
      "endsAt": null,
      "location": "会议室 A",
      "notes": null,
      "status": "active",
      "sourceText": "明天下午3点产品评审",
      "createdAt": "2026-06-30T09:00:00+08:00",
      "updatedAt": "2026-06-30T09:00:00+08:00"
    }
  ],
  "reminders": [],
  "ledgerEntries": [
    {
      "id": "ledger-1",
      "direction": "expense",
      "amountCents": 3800,
      "currency": "CNY",
      "category": "餐饮",
      "occurredAt": "2026-06-29T12:30:00+08:00",
      "counterparty": null,
      "note": "外卖",
      "sourceText": "昨天点外卖花了38",
      "createdAt": "2026-06-29T12:30:00+08:00",
      "updatedAt": "2026-06-29T12:30:00+08:00"
    }
  ],
  "messages": [
    {
      "id": "message-1",
      "role": "user",
      "content": "明天下午有什么安排？",
      "createdAt": "2026-06-30T10:00:00+08:00"
    },
    {
      "id": "message-2",
      "role": "assistant",
      "content": "我查到了，明天下午有 1 条安排。\n\n```json UI_POPUP\n{\"type\":\"timely_query_result\",\"query_kind\":\"schedule\",\"query_status\":\"success\",\"title\":\"明天下午安排\",\"summary\":\"找到 1 条安排\",\"time_range\":{\"label\":\"明天下午\",\"from\":\"2026-07-01T12:00:00+08:00\",\"to\":\"2026-07-01T17:59:59+08:00\"},\"metrics\":[{\"label\":\"安排\",\"value\":\"1 条\"}],\"events\":[{\"id\":\"event-1\",\"title\":\"产品评审\",\"startsAt\":\"2026-07-01T15:00:00+08:00\",\"location\":\"会议室 A\",\"notes\":null}],\"ledger\":{\"entries\":[],\"totalExpenseCents\":0,\"totalIncomeCents\":0,\"netCents\":0}}\n```",
      "createdAt": "2026-06-30T10:00:00+08:00"
    }
  ],
  "pendingClarification": null
}
```

字段说明：

- `events`：日程主表。取消事件不物理删除，而是把 `status` 设为 `cancelled`，便于恢复。
- `reminders`：兼容字段，当前 UI 不使用。
- `ledgerEntries`：独立流水表，不复用 `CalendarEvent`。
- `messages`：聊天历史，也是 `UI_POPUP` block 的承载位置。
- `pendingClarification`：一轮澄清状态，支持事件时间、事件删除、流水金额和流水方向。

---

## 9. Pending Clarification JSON

`pendingClarification` 可能是以下几类。

事件缺时间：

```json
{
  "kind": "event_time",
  "title": "会议",
  "sourceText": "帮我记录一个会议",
  "createdAt": 1782794400000
}
```

事件删除消歧：

```json
{
  "kind": "event_delete",
  "title": "会议",
  "targetDate": "2026-07-01",
  "sourceText": "删除明天的会议",
  "createdAt": 1782794400000
}
```

流水缺金额：

```json
{
  "kind": "ledger_amount",
  "direction": "expense",
  "category": "购物",
  "occurredAt": "2026-06-30T20:00:00+08:00",
  "counterparty": null,
  "note": "抽湿机",
  "sourceText": "晚上8点买了抽湿机",
  "createdAt": 1782794400000
}
```

流水缺方向：

```json
{
  "kind": "ledger_direction",
  "amountCents": 1200000,
  "category": "未分类",
  "occurredAt": "2026-06-30T10:00:00+08:00",
  "counterparty": null,
  "note": null,
  "sourceText": "12000",
  "createdAt": 1782794400000
}
```

pending 有 5 分钟 TTL；用户输入“算了 / 取消 / 不要了 / 不记了”等取消词时会清除 pending。

---

## 10. 状态读取、迁移与容错

文件：`lib/state.ts`

`normalizeTimelyState` 是 localStorage 的边界层：

- localStorage 为空或 JSON 损坏时，回退到 `initialState`。
- 老数据没有 `ledgerEntries` 时补为空数组。
- 老事件缺少 `status` 时默认为 `active`。
- 非法 event、ledger、message 会被过滤。
- `reminders` 保留兼容，但当前不新增 reminder UI。

所有时间默认使用 `Asia/Shanghai`，格式统一为：

```text
YYYY-MM-DDTHH:mm:ss+08:00
```

金额使用 `amountCents` 存储整数分，避免浮点误差。

---

## 11. 测试与 Eval

主要命令：

```bash
node --test tests/ui-shell.test.ts
npm test
npm run test:agent
npm run eval:records
npm run typecheck
node --check public/app.js
npm run lint
git diff --check
npm run build
```

测试覆盖：

- `tests/record-events.test.ts`：事件创建、删除、澄清、消歧。
- `tests/record-input.test.ts`：统一记录入口、AI fallback、自洽校验。
- `tests/ledger-recording.test.ts`：流水金额、日期、数量词、防误判。
- `tests/record-workflow.test.ts`：LangGraph write workflow。
- `tests/query-workflow.test.ts`：查询 agent、时间窗口、UI_POPUP。
- `tests/app-workflow.test.ts`：supervisor 路由。
- `tests/ui-popup.test.ts`：弹窗 payload 构造/解析。
- `evals/record-input-cases.jsonl`：离线中文语料集。

当前 eval runner 默认走稳定的本地 fallback，后续可以单独加真实模型 eval 开关，并把 `route`、`outcome`、`trace`、耗时和错误原因上报到 LangSmith、LangFuse 或 W&B Weave。

---

## 12. 当前边界

当前已支持：

- 自然语言创建事件。
- 自然语言取消事件。
- 独立流水记录。
- 本地个人数据查询。
- 查询结果结构化弹窗。
- 本地持久化和状态 normalizer。
- LangGraph supervisor/write/query workflow。
- 离线 eval dataset。

当前不做：

- 账号系统、云同步、远端数据库。
- 系统日历同步。
- 通知和提醒。
- 完整任务系统。
- 完整财务分析、预算、投资或报表。
- 真实语音输入。
