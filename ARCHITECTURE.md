# Timely 技术架构记录

> 创建日期：2026-06-10
> 产品形态：手机界面的 Web/PWA 客户端
> 依据：`PRD.md` v0.3、`IMPLEMENTATION_PLAN.md`

---

## 1. 架构结论

Timely MVP 采用 **Next.js + React + TypeScript** 做手机优先的客户端应用。第一版不单独拆独立后端，不做账号系统，不做云同步。

推荐路线：

```text
Mobile-first Next.js App
├─ React 客户端界面
├─ 本地 Agent 解析器
├─ 本地状态与 localStorage 持久化
├─ 浏览器 Notification API
└─ Next.js API Route
   └─ 后续代理真实 AI 服务
```

这个架构的重点是先快速验证“自然语言记录到内部日历/提醒”的核心闭环。等需要账号、多端同步、正式数据库时，再引入 Supabase 或独立后端。

---

## 2. 为什么不先拆独立后端

MVP 阶段的核心能力是：

- 用户输入一句话。
- Agent 解析为结构化结果。
- App 写入内部日历或提醒。
- 用户在手机界面查看、查询、修改、取消。

这些能力可以先在浏览器本地完成。独立后端、登录、数据库、同步、权限系统会增加实现成本，但不会直接提升第一版可用性。

因此第一版后端只保留一个明确职责：**通过 Next.js API Route 代理真实 AI 服务，保护 API Key**。在真实 AI 接入前，本地 Agent 解析器即可支撑 UI 和流程验证。

---

## 3. 前端框架

### 3.1 框架

- `Next.js`
- `React`
- `TypeScript`

### 3.2 UI 方向

- 手机优先，不做桌面后台式布局。
- 首屏就是对话输入，不做营销落地页。
- 页面最大宽度模拟手机客户端，但在桌面浏览器中居中显示。
- 主导航使用底部 Tab：
  - 对话
  - 日历
  - 提醒
  - 设置

### 3.3 样式

MVP 继续使用 plain CSS。

原因：

- 当前项目已经使用 plain CSS。
- 第一版界面不复杂。
- 可以减少 UI 框架配置和迁移成本。

后续如果组件增多，再考虑 Tailwind CSS 或设计系统。

---

## 4. 数据架构

### 4.1 本地状态

MVP 使用浏览器本地存储保存数据。

```ts
type TimelyState = {
  events: CalendarEvent[];
  reminders: Reminder[];
  messages: ConversationMessage[];
  pendingClarification: PendingClarification | null;
};
```

### 4.2 持久化策略

- 第一版使用 `localStorage`。
- 数据 key 使用新的版本号，避免读取旧规划工具数据。
- 推荐 key：`timely-mobile-state-v1`。
- 后续记录量变大时迁移到 `IndexedDB + Dexie`。

### 4.3 数据模型

- `CalendarEvent`：内部日历事件。
- `Reminder`：独立提醒或事件关联提醒。
- `ConversationMessage`：对话记录。
- `PendingClarification`：一次任务内的澄清上下文。

---

## 5. Agent 架构

### 5.1 阶段一：本地 Agent

第一版先实现本地解析器，不依赖外部 AI。

职责：

- 覆盖 PRD MVP 验收用例。
- 输出和真实 AI Agent 一致的结构化 JSON。
- 支持创建事件、创建提醒、提前提醒、查询、未知意图、缺失时间反问。

### 5.2 阶段二：真实 AI Agent

后续通过 Next.js API Route 调用真实 AI。

规则：

- 前端不暴露 API Key。
- API Route 只发送当前输入、当前时间、时区和必要澄清上下文。
- AI 只输出 JSON。
- JSON 必须校验后才能执行。
- 校验失败不写入本地数据。

---

## 6. 通知架构

MVP 使用浏览器 Notification API。

策略：

- 首次打开 App 不主动请求通知权限。
- 用户第一次创建提醒时再请求权限。
- 权限拒绝时不反复弹窗。
- 即使通知不可用，提醒仍保存在 App 内，并以到期状态展示。

---

## 7. 文件组织建议

```text
app/
  layout.tsx
  page.tsx
  globals.css
components/
  timely-app.tsx
  chat-panel.tsx
  calendar-view.tsx
  reminder-view.tsx
  settings-view.tsx
  app-nav.tsx
hooks/
  use-local-storage-state.ts
  use-timely-state.ts
  use-reminder-ticker.ts
lib/
  types.ts
  seed-data.ts
  time.ts
  store.ts
  calendar-queries.ts
  matching.ts
  notifications.ts
  agent/
    schema.ts
    local-parser.ts
    execute.ts
```

第一步 MVP 可以先把多个 UI 子组件放在 `components/timely-app.tsx` 中，等逻辑稳定后再拆文件。

---

## 8. 扩展节点

### 8.1 什么时候引入 Supabase

满足任一条件再引入：

- 需要账号登录。
- 需要多端同步。
- 需要服务端数据库。
- 需要跨设备提醒状态同步。

### 8.2 什么时候引入 PWA

手机端 UI 基本稳定后再补：

- `manifest.webmanifest`
- App icon
- 安装到桌面提示
- Service Worker 缓存策略

### 8.3 什么时候做原生 App

Web/PWA MVP 完成且验证用户愿意持续使用后，再评估：

- Expo / React Native
- iOS 原生通知
- 系统日历权限

---

## 9. 当前第一步 MVP 范围

第一步只做产品方向和手机客户端外壳：

- 保存本架构文档。
- 清除旧时间规划、任务优先级、专注计时、效率洞察界面。
- 建立手机端 App 外观。
- 建立对话、日历、提醒、设置四个主入口。
- 准备符合 PRD 的 demo 数据。
- 保留本地存储能力。

第一步不接真实 AI，不做完整自然语言解析，不做真实通知触达。
