# Timely 测试说明

本文档说明当前 `tests/` 目录里的测试覆盖范围、重点场景和运行方式。

## 测试文件概览

当前测试覆盖静态结构、业务行为、Agent workflow 和离线 eval：

- `record-events.test.ts`
- `record-input.test.ts`
- `ledger-recording.test.ts`
- `ledger-state.test.ts`
- `ledger-stats.test.ts`
- `time.test.ts`
- `state.test.ts`
- `minimax-api.test.ts`
- `package-scripts.test.ts`
- `ui-shell.test.ts`
- `record-workflow.test.ts`
- `query-workflow.test.ts`
- `app-workflow.test.ts`
- `ui-popup.test.ts`
- `eval-record-workflow.test.ts`

这些测试分成几类：

- 事件记录行为测试：验证自然语言输入最终如何改变日程状态。
- 统一记录行为测试：验证事件和流水输入如何通过同一个入口分流。
- 流水记录测试：验证金额、日期、数量词和 pending 补全。
- MiniMax API 接入测试：验证 AI prompt、schema、API route 关键能力是否存在。
- LangGraph workflow 测试：验证 supervisor 路由、写入 workflow、查询 workflow、UI_POPUP 协议。
- Eval dataset 测试：验证 JSONL 语料可加载、可评分、可汇总。
- UI 结构测试：验证首页、侧边栏、输入栏、日历视图等关键 UI 壳层没有被误删。

## 1. `record-events.test.ts`

这是最重要的业务行为测试，直接测试 `lib/event-recording.ts`。

它不调用真实 MiniMax API，而是测试两条路径：

- 本地 fallback 解析：`resolveEventRecordInput`
- AI 结构化结果落库：`resolveEventRecordInputWithAi`

### 覆盖的新增事件场景

测试包括：

- `帮我记录一下6月13号下午3点有一个会议`
  - 应新增事件：`会议`
  - 时间：`2026-06-13T15:00:00+08:00`

- `帮我记录6月9日下午4点复盘`
  - 应新增事件：`复盘`
  - 时间：`2026-06-09T16:00:00+08:00`

- `明天下午四点复盘`
  - 应新增事件：`复盘`
  - 验证中文数字时间“四点”

- `下周三上午十点半产品评审`
  - 应新增事件：`产品评审`
  - 验证相对星期和中文时间“十点半”

### 覆盖的多轮补全场景

测试包括：

- 用户先说：`帮我记录一个会议`
- App 追问：`什么时候？`
- 用户再说：`6月13日下午3点`
- 最终应新增事件：`会议`

还覆盖了更自然的多轮表达：

- 用户先说：`帮我加一个周六的会议`
- App 追问：`什么时候？`
- 用户再说：`下午四点`
- 最终应新增事件：`会议`

这里重点验证：

- App 会保留前文里的“周六”和“会议”。
- 第二句只说“下午四点”时，也能和前文合并解析。
- 标题不会被写成“帮我加一个周六的会议”。

### 覆盖的 AI 落库场景

测试模拟 AI 已经返回结构化 JSON，例如：

- `intent: create_event`
- `title: 健身`
- `startsAt: 2026-06-15T17:00:00+08:00`

它验证本地状态写入层会直接使用 AI 给出的干净 title。

例如：

- 用户输入：`我明天下午五点要健身`
- AI 应返回：`title: 健身`
- App 日历中应显示：`健身`

### 覆盖的删除事件场景

测试包括：

- `帮我删除6月13日的会议`
  - 应找到对应 active 事件。
  - 将事件状态改为 `cancelled`。
  - 回复：`已删除。6月13日 15:00，会议。`

- `帮我删除6月14日的会议`
  - 找不到记录。
  - 回复：`没找到这条记录。`

- `帮我把周六下午四点的会议删掉`
  - 应匹配 `2026-06-20T16:00:00+08:00` 的会议。
  - 删除时不是物理移除，而是改为 `cancelled`。

### 覆盖的不支持场景

测试包括：

- `明天下午3点提醒我取快递`

当前 MVP 只做“记录事件”，不做提醒，所以应回复：

- `我可以帮你记录事件。`

## 2. `minimax-api.test.ts`

这个测试不调用真实网络 API。

它读取：

- `lib/ai/minimax-event-parser.ts`
- `app/api/record-event/route.ts`

然后验证 MiniMax 接入的关键内容是否存在。

### 覆盖内容

测试确认 parser 中包含：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `MINIMAX_API_KEY`
- `MINIMAX_MODEL`
- `MiniMax-M3`
- `response_format`
- `json_object`
- `parseMiniMaxEventInput`
- JSON 提取逻辑 `extractMiniMaxJsonContent`
- 日期时间归一化 `normalizeMiniMaxDateTime`

### 覆盖 prompt 约束

测试确认 prompt 中明确要求：

- `create_event` 必须有 `title` 和 `startsAt`
- `delete_event` 支持 `targetDate`
- `title` 必须是用户真正要记录或删除的事项名
- `我要健身` 应变成 `title=健身`
- `帮我把周六下午四点的会议删掉` 删除时必须给出具体 `startsAt`

这些测试是为了防止之后改 prompt 时，把核心 AI 解析规则删掉。

## 3. `record-workflow.test.ts`

这个测试直接覆盖 `lib/agent/record-workflow.ts`，不调用真实网络。

它验证：

- 没有 AI parser 时，workflow 走 `local_fallback`。
- AI 返回有效结构化结果时，workflow 走 `ai_result` 并写入本地状态。
- AI parser 抛错时，workflow 捕获 `aiError` 并回到本地解析。
- trace 会记录 `normalize_input`、`call_ai_parser`、`apply_*`、`summarize_outcome`。

## 4. `eval-record-workflow.test.ts`

这个测试覆盖离线 eval runner：

- 从 JSONL 文本加载 eval case。
- 调用 `scoreRecordEvalCase` 跑 LangGraph workflow。
- 汇总通过率。

正式语料集在 `evals/record-input-cases.jsonl`，可用下面命令运行：

```bash
npm run eval:records
```

## 5. `query-workflow.test.ts`

这个测试覆盖 `lib/agent/query-workflow.ts`：

- “明天下午有什么安排？”会查询 active event，并输出 `UI_POPUP`。
- “明天下午”会限定到下午时间窗口，不误返回上午日程。
- “下周三的会议是几点？”会落到下一自然周的周三。
- “我昨天点外卖支出了多少？”会汇总 ledger 支出。
- “上个月点外卖支出了多少？”会按上个月和餐饮/外卖类别查询流水。
- 没有记录时仍输出 `query_status: "empty"` 的弹窗 payload。

## 6. `app-workflow.test.ts`

这个测试覆盖 supervisor agent：

- 查询类输入路由到 `query_agent`。
- 记录类输入路由到 `write_agent`。

## 7. `ui-popup.test.ts`

这个测试覆盖 `lib/ui-popup.ts`：

- 构造 ````json UI_POPUP` 消息。
- 从消息中解析 payload。
- 从聊天气泡文本中剥离 UI block。

## 8. `ui-shell.test.ts`

这个测试读取 `components/timely-app.tsx`，验证关键 UI 结构还在。

### 覆盖内容

测试确认存在：

- 左上角菜单按钮：`menu-trigger`
- 侧边栏遮罩：`drawer-backdrop`
- 侧边栏：`side-drawer`
- 麦克风按钮：`voice-action`
- `/api/record-input` 调用
- `runTimelyAgentWorkflow` 接线
- 查询结果弹窗结构：`query-popup-backdrop`、`query-popup-panel`
- 提交中状态：`isSubmitting`
- 日历月视图：`calendar-month`
- 年份选择：`year-select`
- 月份选择：`month-select`
- 单日详情：`day-detail`
- 时间轴：`timeline-grid`

也确认旧 UI 没有回退：

- 不应出现旧的 `bottom-nav`
- 不应出现旧的 `calendar-actions`
- 不应出现旧的 `round-icon-button`

## 如何运行测试

### 运行 UI 测试

```bash
node --test tests/ui-shell.test.ts
```

### 运行 MiniMax 接入结构测试

```bash
node --test tests/minimax-api.test.ts
```

### 运行事件行为测试

行为测试统一由 npm script 编译并运行：

```bash
npm run test:behavior
```

### 运行 Agent workflow 测试

```bash
npm run test:agent
```

### 运行离线 eval

```bash
npm run eval:records
```

### 运行类型检查

```bash
npx tsc --noEmit
```

注意：这个命令可能生成 `tsconfig.tsbuildinfo` 缓存文件。该文件不需要提交。

### 运行生产构建

```bash
npm run build
```

## 真实 API 验证说明

上面的自动测试默认不打真实 MiniMax API。

真实 API 验证通常通过本地 dev server 手动测试：

```bash
npm run dev -- -p 3004
```

然后请求：

```bash
curl -sS -X POST http://localhost:3004/api/record-event \
  -H 'Content-Type: application/json' \
  --data '{"input":"我明天下午五点要健身"}'
```

期望返回类似：

```json
{
  "result": {
    "intent": "create_event",
    "title": "健身",
    "startsAt": "2026-06-15T17:00:00+08:00"
  }
}
```

删除场景：

```bash
curl -sS -X POST http://localhost:3004/api/record-event \
  -H 'Content-Type: application/json' \
  --data '{"input":"帮我把周六下午四点的会议删掉"}'
```

期望返回类似：

```json
{
  "result": {
    "intent": "delete_event",
    "title": "会议",
    "startsAt": "2026-06-20T16:00:00+08:00",
    "targetDate": "2026-06-20"
  }
}
```

## 后续建议补充的测试

后续可以继续补：

- 多条同名事件的删除消歧。
- 用户说“下午那个”“第二个”时的多轮删除。
- 更丰富的账目记录测试。
- 真实语音输入接入后的端到端测试。
- 用 Playwright 做日历 UI 的真实点击和可视化回归测试。
