# Timely 项目进度

更新时间：2026-06-15

## 当前阶段结论

Timely 当前 MVP 已经完成“事件记录优先”的核心闭环，并开始扩展独立的账目流水记录：

```text
自然语言输入
  -> AI 统一解析，失败时本地 fallback
  -> 写入本地 TimelyState
  -> localStorage 持久化
  -> 事件进入日历；账目进入流水页
```

下一阶段建议继续做 **MVP 硬化和体验打磨**，优先稳住事件与独立流水记录，暂缓提醒、真实语音输入、账号系统和云同步。

## 产品范围

- 当前产品定位仍是自然语言个人记录 App，不是提醒、规划或效率分析工具。
- 事件记录仍使用 `CalendarEvent`；账目流水使用独立的 `LedgerEntry`，不复用日历事件模型。
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

### 2. 自然语言创建事件

- 支持输入类似“帮我记录一下6月13日下午3点开会”。
- 支持过去和未来时间点，例如 `6月9日下午4点`、`昨天晚上8点`。
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
- MiniMax 请求已加入超时控制。
- route 会使用客户端传入的 `now`，降低前后端时间基准不一致的问题。
- route 失败时由前端 fallback 到本地解析。

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

最近一次完整验证通过：

- `node --test tests/ui-shell.test.ts`
- `npm test`
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
- 自然语言删除的多轮消歧仍可继续优化，例如“下午那个”“第二条”这类补充说法。
- 麦克风按钮仍是占位入口，未接入浏览器语音识别。
- `public/app.js` 仍保留静态预览逻辑，会与 Next app 形成重复维护压力。
- `.env.local` 用于本地真实 API 测试，不应提交。

## 建议下一步

1. 清理 `NODE_TLS_REJECT_UNAUTHORIZED=0` 的环境来源。
2. 明确 `public` 静态版本定位：只做视觉预览，或移除业务逻辑，避免双实现。
3. 优化自然语言删除的多轮消歧体验。
4. 为日历页补更接近真实交互的端到端/截图验证，覆盖已取消记录开关、恢复和彻底删除。
5. 继续压缩 `components/timely-app.tsx` 的业务职责，把 AI 请求和事件操作抽成更清晰的本地 hook 或 service。
6. 流水记录后续可继续补充编辑、删除、筛选和更细分类；真实语音输入、提醒和云同步仍放在后续评估。
