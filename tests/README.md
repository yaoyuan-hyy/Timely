# Timely 测试说明

本文档说明当前 `tests/` 目录里的测试覆盖范围、重点场景和运行方式。

## 测试文件概览

当前共有 3 个测试文件：

- `record-events.test.ts`
- `minimax-api.test.ts`
- `ui-shell.test.ts`

这些测试分成三类：

- 事件记录行为测试：验证自然语言输入最终如何改变日程状态。
- MiniMax API 接入测试：验证 AI prompt、schema、API route 关键能力是否存在。
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

## 3. `ui-shell.test.ts`

这个测试读取 `components/timely-app.tsx`，验证关键 UI 结构还在。

### 覆盖内容

测试确认存在：

- 左上角菜单按钮：`menu-trigger`
- 侧边栏遮罩：`drawer-backdrop`
- 侧边栏：`side-drawer`
- 麦克风按钮：`voice-action`
- `/api/record-event` 调用
- `resolveEventRecordInputWithAi` 接线
- 提交中状态：`isSubmitting`
- 日历月视图：`calendar-month`
- 年份选择：`year-select`
- 月份选择：`month-select`
- 上下滑动日历：`calendar-scroll`
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

由于 `record-events.test.ts` 是 TypeScript 文件，当前做法是先编译到 `/tmp/timely-cjs`，再用 Node test runner 运行：

```bash
npx tsc tests/record-events.test.ts lib/event-recording.ts lib/types.ts --module commonjs --moduleResolution node --target ES2020 --outDir /tmp/timely-cjs --esModuleInterop --skipLibCheck --strict
node --test /tmp/timely-cjs/tests/record-events.test.js
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
