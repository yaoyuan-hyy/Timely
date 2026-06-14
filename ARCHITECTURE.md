# Timely 技术架构记录

> 更新日期：2026-06-10
> 产品形态：手机优先的 Web/PWA 客户端
> 依据：`PRD.md` v0.4、`IMPLEMENTATION_PLAN.md`

---

## 1. 架构结论

Timely 当前采用 **Next.js + React + TypeScript** 构建手机优先的本地记录 App。第一阶段不拆独立后端，不做账号系统，不做云同步。

当前闭环：

```text
Mobile-first Next.js App
├─ React 客户端界面
├─ 事件记录本地解析器
├─ TimelyState 本地状态
└─ localStorage 持久化
```

重点是先验证“自然语言 -> 事件记录 -> 本地可见”的记录体验。

---

## 2. 为什么先不做后端

当前阶段的核心能力是：

- 用户输入一句自然语言。
- 本地解析器提取事件标题和明确时间点。
- App 写入 `CalendarEvent`。
- 用户在事件记录页查看或取消记录。

这些能力可以完全在浏览器本地完成。独立后端、登录、数据库、同步和权限系统不会直接提升第一版事件记录体验。

---

## 3. 前端框架

- `Next.js`
- `React`
- `TypeScript`
- Plain CSS
- `lucide-react` icons

UI 原则：

- 手机优先。
- 首屏就是事件录入。
- 不做营销落地页。
- 主导航只保留：
  - 对话
  - 记录
  - 设置

---

## 4. 数据架构

MVP 使用浏览器本地存储保存数据。

```ts
type TimelyState = {
  events: CalendarEvent[];
  reminders: Reminder[];
  messages: ConversationMessage[];
  pendingClarification: PendingClarification | null;
};
```

当前业务只使用 `events`、`messages` 和 `pendingClarification`。`reminders` 保留为空数组，避免后续迁移时破坏状态形状。

推荐存储 key：

```text
timely-event-record-state-v1
```

---

## 5. 事件记录解析器

文件：`lib/event-recording.ts`

职责：

- 解析绝对日期、无年份日期、今天、明天、昨天。
- 解析 `下午3点`、`15:00`、`晚上8点半` 等时间。
- 从输入中提取事件标题。
- 缺少时间时创建 `pendingClarification`。
- 用户补充时间后创建事件。
- 返回新的 `TimelyState`，不直接操作 UI。

React 组件通过 `resolveEventRecordInput(current, text)` 调用这层逻辑。

---

## 6. 当前文件组织

```text
app/
  layout.tsx
  page.tsx
  globals.css
components/
  timely-app.tsx
hooks/
  use-local-storage-state.ts
lib/
  event-recording.ts
  seed-data.ts
  stats.ts
  time.ts
  types.ts
tests/
  record-events.test.ts
```

---

## 7. 扩展节点

### 7.1 账目记录

账目记录应作为独立记录类型设计，例如 `LedgerEntry`，不要塞进 `CalendarEvent`。

### 7.2 查询、修改和取消

自然语言查询、修改和取消可以复用事件解析器中的时间解析能力，但需要单独增加匹配层。

### 7.3 真实 AI Agent

只有当本地解析器无法覆盖常见表达时，再接入真实 AI Agent。AI 仍只负责解析，不直接写状态。

---

## 8. 当前第一步范围

- 事件记录解析。
- 过去和未来时间点保存。
- 一轮澄清补全时间。
- 本地持久化。
- 手机优先 UI。
- 单元测试覆盖事件记录核心行为。

当前不做提醒、通知、时间规划、效率建议或账目记录。
