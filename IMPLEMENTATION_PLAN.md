# Timely 事件记录实施计划

> 依据：`PRD.md` v0.4
> 创建日期：2026-06-10
> 当前目标：先把“记录事件”闭环做好

---

## 1. 建设目标

Timely 当前不是提醒工具、时间规划工具或效率工具，而是一个自然语言记录 App。

第一阶段只证明事件记录闭环：

```text
用户输入一句自然语言
  -> 本地解析器提取时间点和事件标题
  -> 程序写入本地 CalendarEvent
  -> 对话里给出一句确认
  -> 事件记录页展示这条记录
```

账目记录属于后续独立记录类型；本阶段不实现。

---

## 2. 实施原则

- **先记录，后扩展**：本阶段只处理事件记录，不做提醒、规划、统计或账目。
- **过去未来都保存**：解析到过去时间点时直接记录，不当作错误。
- **解析和执行分离**：解析逻辑放在纯函数模块，React 组件只负责调用和展示。
- **本地优先**：继续使用 `localStorage` 持久化。
- **测试先行**：事件解析、澄清、状态写入用单元测试覆盖。
- **小闭环优先**：每次输入要么创建事件，要么只问一个必要问题。

---

## 3. 当前模块拆分

### 3.1 类型层

文件：`lib/types.ts`

职责：

- 定义 `CalendarEvent`。
- 定义 `ConversationMessage`。
- 定义 `PendingClarification`。
- 定义 `TimelyState`。
- 当前保留 `Reminder` 类型和 `reminders` 空数组，用于避免后续迁移成本，但 UI 不使用。

### 3.2 事件记录解析与执行层

文件：`lib/event-recording.ts`

职责：

- 从自然语言输入中解析日期、时间和标题。
- 支持未来和过去时间点。
- 在缺少时间时创建 `pendingClarification`。
- 在用户补充时间后创建事件并清空澄清状态。
- 返回更新后的 `TimelyState`，不包含 UI 逻辑。

### 3.3 UI 层

文件：`components/timely-app.tsx`

职责：

- 提供对话输入。
- 调用 `resolveEventRecordInput` 写入状态。
- 展示事件记录列表。
- 支持取消事件。
- 设置页展示本地事件数量和澄清状态。

### 3.4 测试层

文件：`tests/record-events.test.ts`

职责：

- 验证未来事件创建。
- 验证过去事件创建。
- 验证缺少时间时反问。
- 验证澄清补全后创建事件。

---

## 4. 已完成的当前闭环

- 新增 `lib/event-recording.ts`，替换组件内硬编码样例解析。
- 新增 `tests/record-events.test.ts`。
- 对话输入可以创建任意标题事件。
- `6月13日下午3点`、`6月9日下午4点`、`昨天晚上8点` 等时间点可解析。
- 缺少时间时反问 `什么时候？`。
- 澄清补充时间后写入事件。
- 主导航收敛为：对话、记录、设置。
- 示例数据改为事件记录，不再展示提醒示例。

---

## 5. 下一步推荐顺序

1. 扩展事件时间解析。
   - 支持 `下周三`、`周五`、`月底` 等表达。
   - 增加对应测试。

2. 完善事件查询。
   - 例如 `6月13号记录了什么`。
   - 查询只读，不写入。

3. 完善事件修改和取消的自然语言入口。
   - 单条匹配直接修改或取消。
   - 多条匹配时只反问一个选择问题。

4. 设计账目记录模型。
   - 独立于 `CalendarEvent`。
   - 不影响事件记录闭环。

5. 再评估是否需要提醒。
   - 提醒不是当前产品主目标。
   - 如果以后加入，应作为事件记录的可选附加能力。

---

## 6. 验收命令

事件记录单元测试：

```bash
./node_modules/.bin/tsc tests/record-events.test.ts lib/event-recording.ts lib/types.ts --module commonjs --target ES2022 --moduleResolution node --types node --skipLibCheck --esModuleInterop --outDir /tmp/timely-record-tests
node /tmp/timely-record-tests/tests/record-events.test.js
```

项目类型检查：

```bash
./node_modules/.bin/tsc --noEmit
```

生产构建：

```bash
npm run build
```
