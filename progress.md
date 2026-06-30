# Timely 项目进度

更新时间：2026-06-30

## 当前阶段结论

Timely 当前已经从单一写入 workflow 扩展为 **Supervisor + Write Agent + Query Agent** 的多 agent 架构。它仍保持本地优先和个人记录定位，不做账号、云同步、通知或任务管理器：

```text
自然语言输入
  -> LangGraph supervisor 识别写入/查询/轻量聊天
  -> 写入走 record workflow
  -> 查询走 local query workflow
  -> 查询结果输出 UI_POPUP JSON block
  -> localStorage 持久化
  -> 事件进入日历；账目进入流水页；查询结果弹出结构化卡片
```

当前已经完成一轮 **统一记录硬化 + 温润高级 UI 打磨 + LangGraph workflow/eval dataset + 查询弹窗 agent**。下一阶段建议继续扩充 query eval，并接入 LangSmith/LangFuse/W&B Weave 之一做可观测记录。

## 产品范围

- 当前产品定位仍是自然语言个人记录 App，不是提醒、规划或效率分析工具。
- 事件记录仍使用 `CalendarEvent`；账目流水使用独立的 `LedgerEntry`，不复用日历事件模型。
- 查询 agent 可以读取本地 `events` 和 `ledgerEntries`，并输出结构化弹窗结果；待办/任务查询当前只返回结构化 empty state，不引入任务系统。
- `Reminder` 类型和 `reminders` 字段仍保留在状态结构中，但 UI 暂不使用。
- 默认时区固定为 `Asia/Shanghai`。
- Next app 是主业务入口；`public` 静态版本仅作为预览/兼容入口，不应继续扩展为第二套长期业务实现。

## 已完成

### 1. 移动端主界面

- 首页为手机优先的 Timely app shell。
- 左上角菜单可打开侧边栏。
- 侧边栏包含四个主界面：对话、记录、流水、设置。
- 顶部右侧按钮已按当前页面切换职责：
  - 对话/设置页：清空聊天记录。
  - 日历页：显示/隐藏“已取消记录”。
- 底部输入栏支持自然语言记录输入。
- 麦克风按钮目前是禁用态占位，尚未接入真实语音识别。
- 本轮继续打磨了 Next app 的温润高级视觉方向：
  - 统一 focus-visible、hover、active、disabled 等交互状态。
  - 输入栏增加 `focus-within` 的柔和聚焦层。
  - 抽屉、picker、流水底部抽屉、取消记录面板增加更一致的软玻璃层次。
  - 增加 `prefers-reduced-motion` 降低动画偏好支持。

### 2. 自然语言创建事件

- 支持输入类似“帮我记录一下6月13日下午3点开会”。
- 支持过去和未来时间点，例如 `6月9日下午4点`、`昨天晚上8点`。
- 支持出行类事件输入，例如“下个月六号我要去广州，六点的飞机”，可解析为 `7月6日 06:00，去广州`。
- 缺少时间时会追问“什么时候？”。
- 用户补充时间后会创建事件并清空澄清状态。
- AI 解析失败或返回不可用结果时，前端会回退到本地解析逻辑。
- 已校验非法真实日期，避免 `6月31日下午3点开会` 生成脏事件。

### 3. 自然语言取消事件

- 支持删除/取消/清除已有事件。
- 支持示例：
  - “帮我删除6月13日的会议”
  - “把这周六的会议给我删除了”
- 删除语义不会直接物理移除事件，而是将事件标记为 `cancelled`。
- active 日历只展示未取消事件。
- 如果找不到匹配记录，会回复“没找到这条记录。”。
- 如果同一天有多条同名记录，会追问具体时间。

### 4. 日历记录界面

- 记录页使用日历形式展示 active 事件。
- 年份和月份可点击选择。
- 已取消“上下滑动浏览多个月”的设计；当前日历只展示所选月份。
- 点击某一天后进入单日时间轴。
- 单日视图中可查看当天记录，并可取消对应事件。
- 日历页右上角按钮可开关“已取消记录”面板，默认不占用日历空间。
- “已取消记录”面板支持：
  - 恢复记录，恢复后重新出现在 active 日历中。
  - 彻底删除记录，从本地事件列表中物理移除。

### 5. 状态与持久化硬化

- 本地状态使用 `timely-event-record-state-v1` 存入 localStorage。
- `useLocalStorageState` 已接入状态 normalizer。
- `normalizeTimelyState` 可兼容：
  - 坏 JSON。
  - 旧版不完整状态。
  - 缺少 `reminders` 字段的状态。
  - 缺少 `ledgerEntries` 字段的旧状态。
  - 缺少 `status` 的旧事件，默认归为 active。
- `.gitignore` 已覆盖 `tsconfig.tsbuildinfo`。

### 5.1 账目流水记录

- 新增独立 `LedgerEntry` 数据类型，字段包含收支方向、金额分、币种、分类、发生时间、备注和原始输入。
- `TimelyState` 新增 `ledgerEntries`，仍通过同一个 localStorage key 本地持久化。
- 聊天输入现在优先请求 `/api/record-input` 进行统一解析：
  - 日程输入仍创建或删除 `CalendarEvent`。
  - 流水输入创建 `LedgerEntry`。
  - AI 失败时回退到本地解析。
- 本地流水解析支持：
  - “今天午饭花了38”
  - “昨天打车26.5”
  - “收到工资12000”
- 流水没有日期时默认使用当前上海时间；只给相对日期但没有具体几点时，使用当前时分。
- 缺少金额时追问“金额是多少？”；收支方向不清时追问“这是收入还是支出？”。
- 新增“流水”视图，展示本月收入、支出、净额，以及按日期分组的流水列表。
- 流水视图顶部支持月份选择，默认显示“本月”，可切换到同一年其他月份。
- 流水视图支持“本年”汇总，年度列表按 12 个月展示每月支出；点击月份会回到该月流水列表。
- 月流水列表左侧按分类自动展示 Emoji 容器，日期分组与下方卡片保持同一毛玻璃聚合风格。
- 月流水列表的单条 item 不展示录入时分，只在有备注时展示备注，避免把“告诉 App 的时间”误读为消费发生时间。
- 流水列表支持兜底纠错：点击条目可用底部半屏面板编辑金额和分类，右侧低存在感删除按钮可物理移除单条流水。
- 流水页标题右侧入口已改为手动添加流水；点击后打开底部半屏面板，可手动选择支出/收入、分类、备注和金额并保存到本地流水。
- 流水金额解析已改为上下文识别：日期数字、时间数字和数量词不会被当作金额；缺少有效金额时会进入追问，例如“请问抽湿机花了多少钱？”。
- 流水金额追问期间，用户只回复纯数字或带金额单位的短答会继续补全原流水，不会重新回落到日程解析。
- `pendingClarification` 已改为毫秒时间戳并加入 5 分钟生命周期；旧 ISO 字符串 pending 会在状态归一化时迁移。
- 多轮澄清期间输入“算了 / 取消 / 不要了 / 不记了”等取消词会清除当前 pending，并回复“好的一声，已取消当前记录。”。
- 流水 pending 期间如果用户输入明显的新日程意图，例如“明天上午10点开会”，会释放旧 pending 并改走日程创建路由。

### 5.2 统一记录输入硬化

- 事件删除的多轮消歧已补强：
  - “下午那个”会在当前候选集里继续按时段缩小范围。
  - “六点那个”可继承上文时段，例如上文已说“下午”时匹配 18:00。
  - “第二条”会在当前候选集内按时间选择第二条，避免把“第二条”当事件标题。
  - 如果补充语仍不能唯一命中，会继续追问，不会误删。
- 事件时间 pending 期间，如果用户改说明显流水输入，例如“今天午饭花了38”，会释放旧事件 pending 并创建流水。
- AI 事件结果新增真实日期校验；如果 AI 返回类似 `2026-06-31T15:00:00+08:00` 的非法日期，会回退本地解析，不直接创建脏事件。
- 流水金额/备注解析继续硬化：
  - 日期、时间和数量词不会被当作金额。
  - “买了2个抽湿机”会追问抽湿机金额，不把“2个”写入备注。

### 6. 时间工具硬化

- 时间显示和日期归属统一按 `Asia/Shanghai` 处理。
- 已新增/使用：
  - `formatShanghaiTime`
  - `formatShanghaiDate`
  - `toShanghaiDayKey`
  - `toShanghaiIso`
  - `isValidShanghaiDateParts`
- 已覆盖跨运行时区的日期归属和凌晨显示测试。

### 7. MiniMax-M3 / API route

- 当前统一解析入口为 `/api/record-input`，旧的 `/api/record-event` 仍保留用于事件解析兼容。
- 请求体支持 `{ input: string, now?: string }`。
- 响应仍保持 `{ result }`。
- MiniMax 统一解析器支持：
  - `create_event`
  - `delete_event`
  - `create_ledger`
  - `needs_clarification`
  - `unsupported`
- MiniMax 统一解析 prompt 已改为“语义审阅 -> 结构化 JSON”：模型先理解用户真正要记录的对象、时间、金额和上下文，再按 schema 输出事件、流水、澄清或 unsupported。
- MiniMax 流水解析已补强无单位金额语义，例如“机票花了我600”应提取为 `amountCents=60000`；adapter 同时兼容字符串/浮点金额，并在金额仍无效时降级为流水金额澄清。
- MiniMax 原始返回日志已限制为非 production 环境输出，避免生产日志长期保存用户输入内容。
- MiniMax 请求已加入超时控制。
- route 会使用客户端传入的 `now`，降低前后端时间基准不一致的问题。
- route 失败时由前端 fallback 到本地解析。

### 7.1 LangGraph Agent workflow / Eval dataset

- 新增 `lib/agent/app-workflow.ts` 作为 supervisor agent：
  - `classify_intent`
  - `query_agent`
  - `write_agent`
  - `chat_agent`
- `hooks/use-record-submit.ts` 当前调用 `runTimelyAgentWorkflow`，由 supervisor 决定进入写入、查询或轻量聊天路径。
- 新增 `lib/agent/record-workflow.ts`，使用 `@langchain/langgraph` 搭建统一记录 workflow：
  - `normalize_input`
  - `call_ai_parser`
  - `apply_ai_result`
  - `apply_local_fallback`
  - `summarize_outcome`
- workflow 的 AI parser 通过依赖注入接入，当前前端注入 `/api/record-input`；测试和 eval 默认不打真实网络。
- AI parser 抛错时，workflow 会记录 `aiError` 并进入本地 fallback，不让 UI 因模型超时或网络失败中断。
- workflow 输出 `route`、`outcome` 和 `trace`，便于后续接 LangSmith、LangFuse 或 W&B Weave 做观测。
- 新增 `evals/record-input-cases.jsonl` 作为离线中文语料集，目前覆盖：
  - 事件创建。
  - 出行类事件创建。
  - 缺失事件时间澄清。
  - 事件删除。
  - 流水支出/收入创建。
  - 缺失流水金额澄清。
  - 数量词和日期数字不误判为金额。
  - reminder 请求保持 unsupported。
- 新增 `scripts/eval-record-workflow.ts` 和 `scripts/eval-record-workflow.mjs`：
  - TS 模块负责加载 JSONL、Zod 校验、调用 workflow、评分和汇总。
  - MJS wrapper 负责无 ts-node 环境下编译并运行 eval。
- 新增 `npm run test:agent` 和 `npm run eval:records`。

### 7.2 查询 Agent / UI_POPUP 弹窗协议

- 新增 `lib/agent/query-workflow.ts`，用于识别并执行本地个人数据查询：
  - 日程/会议查询：读取 active `CalendarEvent`。
  - 财务/开销查询：读取 `LedgerEntry` 并汇总收入、支出和净额。
  - 待办/任务查询：当前不引入任务系统，返回结构化 empty popup。
- 查询结果不会只用纯文本回复；assistant message 会包含：
  - 简短自然语言垫话。
  - ````json UI_POPUP` 代码块，payload 类型为 `timely_query_result`。
- `query_status` 支持：
  - `success`：查询命中记录。
  - `empty`：没有命中记录，但仍触发前端弹窗。
- 新增 `lib/ui-popup.ts`：
  - `buildUiPopupMessage`
  - `extractUiPopupFromMessage`
  - `stripUiPopupBlock`
- `components/timely/chat-view.tsx` 会解析最近一条 `UI_POPUP`，并显示移动端底部弹窗卡片。
- 查询时间窗口已补强：
  - “明天下午”会收窄到 12:00-17:59，不误带上午日程。
  - “下周三”会解析为下一自然周的周三，而不是本周三。
  - “上个月点外卖支出了多少？”会按月份和餐饮/外卖类别查询流水。
- 新增测试：
  - `tests/query-workflow.test.ts`
  - `tests/app-workflow.test.ts`
  - `tests/ui-popup.test.ts`

### 8. 组件拆分

- 主 app 已从单文件继续拆分为：
  - `components/timely-app.tsx`
  - `components/timely/chat-view.tsx`
  - `components/timely/calendar-view.tsx`
  - `components/timely/ledger-view.tsx`
  - `components/timely/nav-button.tsx`
  - `components/timely/settings-view.tsx`
- 主视图状态操作已拆到 `hooks/use-timely-actions.ts`，自然语言提交与 AI fallback 已拆到 `hooks/use-record-submit.ts`。
- 事件统计、流水统计、时间工具、本地 ID、状态 normalizer、AI 解析器分别放在 `lib/` 下。

## 最近验证情况

本轮完整验证通过：

- `node --test tests/ui-shell.test.ts`
- `npm test`
- `npm run test:agent`
- `npm run eval:records`
- `npm run typecheck`
- `node --check public/app.js`
- `npm run lint`
- `git diff --check`
- `npm run build`

说明：

- `npm run lint` 和 `npm run build` 仍会显示外部环境警告：`NODE_TLS_REJECT_UNAUTHORIZED=0`。
- 该警告不是 lint/build 错误，但后续应清理它的来源，避免真实 HTTPS 请求被错误降级。

## 当前已知注意点

- 数据仍只保存在浏览器 localStorage，没有账号、云同步或数据库。
- “取消事件”保留可恢复历史；只有“已取消记录”里的彻底删除才会物理移除事件。
- 自然语言删除的多轮消歧已覆盖“下午那个”“六点那个”“第二条”等常见补充说法；后续仍应继续补真实用户语料。
- LangGraph workflow 已扩展为 supervisor + write/query agents，但尚未接入 LangSmith/LangFuse/W&B Weave 远端观测。
- 离线 eval 当前默认使用本地 fallback，适合 CI 稳定回归；真实模型 eval 后续应单独加开关，避免 CI 受网络和模型波动影响。
- 查询 agent 当前是规则型本地查询；后续可接入 AI 结构化查询解析，但必须保持 `UI_POPUP` JSON block 协议。
- 麦克风按钮仍是占位入口，未接入浏览器语音识别。
- `public/app.js` 仍保留静态预览逻辑，会与 Next app 形成重复维护压力。
- `.env.local` 用于本地真实 API 测试，不应提交。

## 建议下一步

1. 轮换本地 `.env.local` 中使用过的 MiniMax/OpenAI API key，并在 Vercel 中配置新的生产环境变量。
2. 清理 `NODE_TLS_REJECT_UNAUTHORIZED=0` 的环境来源。
3. 明确 `public` 静态版本定位：只做视觉预览，或移除业务逻辑，避免双实现。
4. 为日历页补更接近真实交互的端到端/截图验证，覆盖已取消记录开关、恢复和彻底删除。
5. 接入 LangSmith/LangFuse/W&B Weave 之一，把 `route`、`outcome`、`trace`、耗时和失败原因记录成可观测面板。
6. 继续扩充 `evals/record-input-cases.jsonl`，把真实中文输入沉淀成可重复 eval，而不是只堆 prompt。
7. 继续压缩 `components/timely-app.tsx` 的业务职责，把 AI 请求和事件操作抽成更清晰的本地 hook 或 service。
8. 流水记录后续可继续补充编辑、删除、筛选和更细分类；真实语音输入、提醒和云同步仍放在后续评估。
