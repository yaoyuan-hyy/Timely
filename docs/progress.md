# Timely 项目进度

更新时间：2026-09-07

## 2026-09-07：上下文恢复落地

- 新增 `writeSession.recovery`：与有效草稿隔离，保存未决原话、每轮时间/ID、版本、失败原因/问题和有效期；不接纳失败模型字段。最多 4 轮 / 12000 字符 / 15 分钟，下一次输入检查过期，刷新或取消清除。
- 决策明确 continue/replace，旧字段有来源轮次，相对日期按来源时间计算；恢复 create/revise 和草稿身份由实际状态决定。对未处理的输入做覆盖检查，允许一次携带程序校验反馈的重新解析，共享 15 秒截止时间。
- UI 显示未决输入；未完成的补充同时阻止确认按钮和确认 Tool 提交旧预览。新旧异步结果、失败重试仍经过会话状态比较，不覆盖当前记录。
- 全量测试、类型、lint、build、diff 检查通过，Write v2 测试 34 项。真实恢复专项 6/6（8 次请求，含 2 次修复，fallback 0）；原七条严格 6/7，日期丢失修复，剩余分类 `午饭`/`餐饮` 差异。详见 `docs/evals/input-recovery.md`。

## 2026-09-07：Write Flow v2 真实多轮评测

- 已解除沙箱网络限制完成真实 DeepSeek 三轮评测，同一 7 条合成样例每轮严格 6/7（85.7%），累计 18/21，fallback 0、网络/HTTP 失败 0。仅 7 个独立样例，不代表生产泛化准确率。
- 失败都在“昨天午饭 → 花35元”：初轮解析/校验失败后未保留原输入上下文，下一轮作为新建，日期变为今天。初轮模型决策有波动，包含无效金额与错误查询过滤；分类和意图 gold 也需要明确产品规则。
- 三轮所有输入均未提前修改记录；日期金额纠正、清空可选字段、时间补充、非法日期拒绝、多操作澄清和确认写入六个样例通过。
- 本轮仅补强计分器和评测记录，未改生产 prompt 或用例答案。报告、复现命令和覆盖限制见 `docs/evals/2026-09-07-write-flow-v2-live.md`。Write v2 尚不能因此标记为全面验收完成。

## 2026-09-07：真实 v2 评测与界面重构

- 改版前全量 `npm test` 通过，真实模型 test 集严格 12/18（66.7%），3 条规则回退单独计数；完整结果保存到 `docs/evals/query-benchmark-v2-results.json`。
- 平均值/最大值通过；剩余错误为标题过滤遗漏与 planner failure。审查移除了为可见样例扩充的标题词汇后，规则全集为 25/28；保留失败，不将回归分数作为泛化准确率。
- UI 改为桌面常驻侧栏、手机底部导航，移除固定手机外框；聊天增加可编辑的输入示例，重整最近记录与输入区；流水采用统一线性图标。
- 统一日历、流水、设置、结果与编辑弹窗的排版、色彩、边框和反馈；弹窗支持 Escape、Tab 焦点约束与关闭后焦点恢复。
- 改版后 `npm test`、typecheck、lint、生产 build、静态 JS 语法与 diff 检查通过；构建发现并修复了 CSS 格式化引入的伪类空格错误。已查看 1280px 桌面与 390px 手机界面，验证示例填入和记账弹窗 Escape 关闭/焦点恢复。查询提交后的最终手机弹窗及更窄屏幕尚未完成浏览器验收：工具自动审批因 usage limit 拒绝后续操作，不将这些项目记为已通过。

## 2026-09-06：Query Agent v2

- Query Agent 已升级为 `QueryDecisionV2`：`execute`、`clarify`、`unsupported` 三种决策；clarify/unsupported 不调用查询工具。
- `QueryPlanV2` 统一承载 kind、Shanghai 时间范围、filters 和 none/count/sum/average/max/min 聚合；`lib/query-executor.ts` 负责确定性计算，LLM 不接收记录、不计算金额。
- Repository 只做 records retrieval/filtering，仍由单一只读 `queryRecords` capability 执行；查询结果继续适配现有 UI_POPUP。
- 新增查询澄清状态和 15 分钟短答上下文；明确新的记录输入会离开查询澄清路径。
- 新增 v2 benchmark：保留 v1 的 28 条样例和 IDs，分开统计 decision、plan、execution、tool selection、read-only 与 E2E；真实测量见 2026-09-07 更新。
- v2 实现计划位于 `docs/superpowers/plans/2026-09-06-query-agent-v2.md`；当前尚未提交 commit。

## 2026-09-06：Query benchmark v1

- 增加 28 条人工定义查询样例（10 dev / 18 冻结回归 test），覆盖时间、filter、aggregation、工具调用、empty、ambiguous 和多条件。
- 在真实工具调用边界记录 name/kind；增加严格端到端评分、维度诊断、数据不变性、fallback 分离、延迟、报告 hashes、重复执行及前后逐例比较。
- 同一 18 条 test 当次测量：规则 7/18（38.9%），DeepSeek 11/18（61.1%），4 项改善、0 项退步；均无降级或运行错误。样本很小，不能外推为生产准确率。
- 未改 planner 提示词或补齐能力来迎合分数。平均值/最大值及歧义澄清共七项系统能力缺口继续显式计失败。
- 方法和完整机器报告位于 `docs/evals/query-benchmark-v1.md` 与相邻 JSON；原六题评测仍只作为 smoke suite。

## 2026-09-06：记录分层与 Query Agent 评测（当前 MVP）

- 已按“回归契约 → Repository → Tool Layer → Query Agent 评测”实施，分支 `codex/record-system-layers`。
- 六条固定查询样例覆盖日期、UTC 等价时间、取消记录、任务空结果、月边界和收支过滤；原有写入/确认/修改回归保留。
- 回归先复现并修复：UTC 记录漏查、任务查询混入日程、只查支出时包含收入。
- 增加 QueryPlan v1 严格契约、隔离快照的 RecordRepository、StateStorage 与只读 Query tools；UI 确认写入检查 expectedBefore。存储读取失败时禁止自动覆盖 fallback。
- 查询拆成规则计划、可注入模型计划、确定性执行和 UI_POPUP 格式化。应用仍默认规则模式；模型只在显式注入/live eval 中启用。
- 当次真实 DeepSeek 对照：规则计划/结果 6/6，模型计划/结果 6/6，模型降级 0。仅六条合成样例，不代表广泛自然语言准确率；不能将 fallback 成功计为模型成功。
- 渐进边界：手动记录操作、写 workflow 候选与备份合并保留现有纯函数；本轮未引入跨标签页事务、数据库或自动发布。
- 验证：全量 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build` 通过；新增分层测试 15 项通过。评测过程与限制见 `docs/evals/2026-09-06-query-evaluation.md`。

## 2026-09-05：输入链路修复与 DeepSeek 接入（当前 MVP）

- 模型与接口统一为 `deepseek-v4-flash` / `https://api.deepseek.com/chat/completions`，使用服务端 `DEEPSEEK_*` 配置。删除两份旧 MiniMax 适配器；旧 `/api/record-event` 作为新路由的兼容别名。
- 追问优先进入写入流程，AI 接收 pending draft；补充 `event_title` 状态，保存明确时间，即使模型澄清时漏回时间也不丢失。流水澄清保留分类、日期等字段，接受 AI 识别的中文金额。
- 调整查询路由，避免“明天三点会议”变查询，同时保留“今天的日程”“这个月的账单”等简写查询。
- Zod 在服务端与客户端验证结果。合法澄清/unsupported 不再作为新记录重猜；调用失败或格式错误保留本地降级。
- 本地支持前天、后天、大后天；未知日期不自动写成今天；结束时间不能早于开始时间。日历未指定结束时间时只显示时间点。
- workflow 结果按增量合并到当前状态，手动操作优先；重复应用同一结果不重复新增，永久删除的记录不会复活。清空聊天与重置数据使在途请求失效。
- 新增模型 HTTP、入口多轮追问、状态提交测试和 `npm run test:ai`。所有新增行为先复现失败后修复。
- 已通过 `npm test`、typecheck、lint、build、静态 JS 语法与 diff 检查。独立代码审查发现的三项边界已加回归并修复。
- 项目 `.env.local` 已由用户配置 DeepSeek key；本轮四条真实 API 示例已通过。该验证为样例冒烟测试，不代表所有自然语言都已覆盖；密钥未写入仓库或文档。
- 安装现有锁定依赖时 npm 报告 Node 23 engine 提示和 8 个 high 依赖问题；本轮未自动升级依赖，避免混入框架升级。

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

当前已经完成 **统一记录确认、自然语言修改、混合最近记录检索、查询跳转、重复保护、本地备份恢复、DeepSeek fallback 与重试 + 温润高级 UI 打磨 + LangGraph workflow/eval dataset + 查询弹窗 agent**。后续可继续扩充 query eval，并接入 LangSmith/LangFuse/W&B Weave 之一做可观测记录。

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

1. 如果旧 MiniMax/OpenAI key 曾在外部暴露，轮换它们；生产环境配置 `DEEPSEEK_*` 变量。
2. 清理 `NODE_TLS_REJECT_UNAUTHORIZED=0` 的环境来源。
3. 明确 `public` 静态版本定位：只做视觉预览，或移除业务逻辑，避免双实现。
4. 为日历页补更接近真实交互的端到端/截图验证，覆盖已取消记录开关、恢复和彻底删除。
5. 接入 LangSmith/LangFuse/W&B Weave 之一，把 `route`、`outcome`、`trace`、耗时和失败原因记录成可观测面板。
6. 继续扩充 `evals/record-input-cases.jsonl`，把真实中文输入沉淀成可重复 eval，而不是只堆 prompt。
7. 继续压缩 `components/timely-app.tsx` 的业务职责，把 AI 请求和事件操作抽成更清晰的本地 hook 或 service。
8. 流水记录后续可继续补充编辑、删除、筛选和更细分类；真实语音输入、提醒和云同步仍放在后续评估。
