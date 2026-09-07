# Query Agent v2 Implementation Plan

执行状态（2026-09-07）：contract、planner、executor、workflow、benchmark 已实现并通过本地测试；真实模型单轮 test 12/18，规则清理测试词汇后全集 25/28。失败保留并记录在 `docs/evals/query-benchmark-v2.md`。以下为原始执行步骤，不将未保留逐步运行证据的历史检查追认为完成；最终验证以 progress 与 eval 报告为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Timely Query Agent 从只能生成 QueryPlan v1 的单一路径，升级为能安全区分 execute、clarify、unsupported，并由本地 deterministic executor 完成聚合的 Query Agent v2。

**Architecture:** DeepSeek 或规则 planner 只输出严格校验的 QueryDecisionV2。execute 分支把 QueryPlanV2 交给唯一的 `queryRecords` capability，再由本地 executor 完成过滤结果上的 count/sum/average/max/min；clarify 和 unsupported 分支直接格式化响应并结束，绝不读取记录。现有 UI_POPUP 继续作为展示适配层，避免把内部 v2 contract 泄漏到 UI。

**Tech Stack:** Next.js 14, React 18, TypeScript, Zod, LangGraph, Node test runner, DeepSeek chat completions API。

**Spec:** 当前会话已确认的 Query Agent v2 设计；实现前需以本计划和该设计共同作为验收依据。

## Global Constraints

- LLM 只负责自然语言到 QueryDecisionV2/QueryPlanV2 的转换，不接收用户记录、不计算金额、不生成最终查询结果。
- `queryRecords` 是唯一查询工具；clarify 和 unsupported 分支的工具调用数必须为 0。
- Repository 只负责 records retrieval/filtering；聚合必须在 deterministic executor 中完成。
- Query Agent 对 records read-only，不能修改 `events`、`ledgerEntries`、`reminders`；可以追加 messages 和独立的 pendingQueryClarification。
- 默认时区保持 `Asia/Shanghai`，所有 benchmark 使用固定 `now`。
- 保留 v1 adapter 和现有 UI_POPUP 兼容性，直到旧测试和调用方完成迁移。
- 不为固定 benchmark case 编写 case-specific 分支；规则 baseline 只能实现通用语义规则。
- 每个任务先写会失败的测试，再写最小实现；每个任务结束运行对应测试和 `git diff --check`。

---

### Task 1: 固定 v2 contract 与 v1 compatibility adapter

**Files:**
- Modify: `lib/query-contract.ts`
- Modify: `lib/query-planning.ts`
- Create: `tests/query-decision.test.ts`
- Modify: `tests/repository.test.ts`

**Interfaces:**
- Consumes: 现有 `QueryPlan`, `queryPlanSchema`, `QueryPlanner`, `QuerySource`。
- Produces: `QueryPlanV2`, `QueryDecisionV2`, `queryPlanV2Schema`, `queryDecisionV2Schema`，以及接受 v1 plan 并返回 v2 execute decision 的 adapter。

- [ ] **Step 1: 写 contract 失败测试**：覆盖 execute、clarify、unsupported；覆盖 `filters` 和六种 aggregation；拒绝 schedule 上的 amount aggregation、ledger 上的 title、无效时间、额外字段和未知 decision。
- [ ] **Step 2: 运行 `node --test tests/query-decision.test.ts`，确认新类型/schema 尚不存在或测试失败。**
- [ ] **Step 3: 在 `lib/query-contract.ts` 增加 v2 discriminated union 和 Zod refine，保留 v1 schema 不变。**
- [ ] **Step 4: 在 `lib/query-planning.ts` 增加 v1→v2 adapter，并定义 v2 planner 返回 `unknown` 后必须先 safeParse 的入口。**
- [ ] **Step 5: 运行 `node --test tests/query-decision.test.ts tests/repository.test.ts`，确认 contract 和旧 Repository 测试均通过。**
- [ ] **Step 6: 运行 `git diff --check`。**

### Task 2: 将 rules baseline 和 DeepSeek planner 改为输出 QueryDecisionV2

**Files:**
- Modify: `lib/query-baseline.ts`
- Modify: `lib/query-planning.ts`
- Modify: `server/ai/deepseek-query-planner.ts`
- Create: `tests/query-planning-v2.test.ts`
- Modify: `tests/query-evaluation.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `QueryDecisionV2` schema、固定 `now` 和现有 v1 baseline 规则。
- Produces: `buildQueryDecisionV2(text, now)` 和 `parseDeepSeekQueryDecision(input, { now })`；provider 只收到 `{ input, now }`。

- [ ] **Step 1: 写 planner 失败测试**：普通查询返回 execute；“最近花了多少钱”返回 clarify；混合读写返回 clarify 或 unsupported；average/max 产生合法 aggregation；provider 返回 records 或金额字段时被拒绝。
- [ ] **Step 2: 运行 `node --test tests/query-planning-v2.test.ts tests/query-evaluation.test.ts`，确认失败。**
- [ ] **Step 3: 扩展 rules baseline：保留“普通查询缺少日期默认今天”，对未定义时间范围、无上下文指代和混合意图返回 clarification decision。**
- [ ] **Step 4: 修改 DeepSeek system contract，让模型只返回 v2 decision JSON；继续使用 `DEEPSEEK_API_KEY`、15 秒超时、temperature 0 和不发送 records。**
- [ ] **Step 5: 修改 planner fallback，使 provider 失败回到 v2 rules decision，并保留 source/fallbackReason。**
- [ ] **Step 6: 运行上述测试并执行 `npm run typecheck`。**

### Task 3: 抽出 deterministic query executor 和 v2 Repository/Tool 接口

**Files:**
- Create: `lib/query-executor.ts`
- Modify: `lib/repository/record-repository.ts`
- Modify: `lib/tools/record-tools.ts`
- Create: `tests/query-executor.test.ts`
- Modify: `tests/repository.test.ts`
- Modify: `tests/query-system.test.ts`

**Interfaces:**
- Consumes: `QueryPlanV2`, `RecordRepository.query`, `queryRecords` tool。
- Produces: `executeQuery(plan, repository)` 或等价纯函数，返回 `QueryExecutionResult`；aggregation value 以 cents 整数表示，空 average/max/min 返回 `null`。

- [ ] **Step 1: 写 executor 失败测试**：分别覆盖 none/count/sum/average/max/min、空集合、收入/支出 filter、整数 cents 平均值、并列 max/min，以及输入 state 不变。
- [ ] **Step 2: 运行 `node --test tests/query-executor.test.ts`，确认失败。**
- [ ] **Step 3: 在 Repository 中将 query 接口改为 QueryPlanV2，只读取并筛选 records；不得加入 aggregation 或语言判断。**
- [ ] **Step 4: 在 Tool 中校验 v2 plan、记录真实调用 trace，并保持只有 `queryRecords` 且没有 commit/delete capability。**
- [ ] **Step 5: 实现 deterministic executor，先取得 filtered records，再按 plan.aggregation 计算结果。**
- [ ] **Step 6: 运行 executor、Repository、query-system 测试，确认旧只读约束仍通过。**
- [ ] **Step 7: 运行 `npm run typecheck` 和 `git diff --check`。**

### Task 4: 重构 LangGraph workflow，加入 conditional routing 和 clarification path

**Files:**
- Modify: `lib/agent/query-workflow.ts`
- Modify: `lib/query-result.ts`
- Modify: `lib/types.ts`（仅在现有 pending clarification 类型不足时扩展）
- Create: `tests/query-workflow-v2.test.ts`
- Modify: `tests/query-system.test.ts`

**Interfaces:**
- Consumes: Task 2 的 decision planner、Task 3 的 executor 和 query tool。
- Produces: `QueryAgentResult`，至少包含 `decision`, `outcome`, `execution`, `toolCalls`, `trace`；clarify/unsupported 的 `plan` 和 `execution` 为 `null`。

- [ ] **Step 1: 写 workflow 失败测试**：execute 走 query→aggregate→format；clarify 走 clarification→END 且 0 tool calls；unsupported 走 unsupported→END 且 0 tool calls；所有分支保持 records 不变。
- [ ] **Step 2: 运行 `node --test tests/query-workflow-v2.test.ts`，确认失败。**
- [ ] **Step 3: 将节点拆成 `normalize_query`、`decide_query`、`validate_query_plan`、`query_records`、`aggregate_records`、`format_query_result`、`format_clarification`、`format_unsupported`。**
- [ ] **Step 4: 增加 conditional edge：`clarify` 和 `unsupported` 不得进入 query 节点，`execute` 才能继续。**
- [ ] **Step 5: 让 `query-result.ts` 只把 `QueryExecutionResult` 转换成现有 UI_POPUP；补充 average/max/min metrics 和 empty formatting。**
- [ ] **Step 6: 运行 workflow、query-system 和现有 agent tests，确认旧消息和 UI_POPUP 兼容。**
- [ ] **Step 7: 运行 `npm run typecheck`、`npm run lint` 和 `git diff --check`。**

### Task 5: 迁移 benchmark 到 v2 分层评分

**Files:**
- Create: `evals/query-benchmark-v2.json`
- Modify: `lib/query-benchmark.ts`
- Modify: `scripts/benchmark-queries.ts`
- Create: `tests/query-benchmark-v2.test.ts`
- Modify: `docs/evals/query-benchmark-v1.md`
- Create: `docs/evals/query-benchmark-v2.md`

**Interfaces:**
- Consumes: v1 的 28 条 fixture/gold、Task 4 的 QueryAgentResult 和 tool trace。
- Produces: decision accuracy、plan accuracy、execution accuracy、tool selection accuracy、end-to-end accuracy，以及每个 case 的失败层级。

- [ ] **Step 1: 将 v1 18 条 regression expected 迁移为 v2 decision/query/aggregation gold；保留原 case IDs 和 fixture，不改变用户语义。**
- [ ] **Step 2: 写 scorer 失败测试：decision 错、plan 错、aggregation 错、execution 错、clarify 调用工具、fallback 和 state mutation 都必须被正确区分。**
- [ ] **Step 3: 运行 `node --test tests/query-benchmark-v2.test.ts`，确认失败。**
- [ ] **Step 4: 扩展 scorer，按层分别计算指标，E2E 仍要求一条 case 的所有适用检查全部通过。**
- [ ] **Step 5: 更新 runner 的 `--compare`、hash、split、runs 和 regression gate，使 v1/v2 报告不可被错误混比。**
- [ ] **Step 6: 离线运行规则基线 v2，确认 benchmark 能执行；再在用户提供 token 后运行 DeepSeek v2。**
- [ ] **Step 7: 验收当前 18 条：平均值、最大值和 ambiguous cases 可表达、可执行、可评分；不得通过 case-specific hardcode。**

### Task 6: 完整回归、文档和发布前检查

**Files:**
- Modify: `docs/progress.md`
- Modify: `docs/architecture/ARCHITECTURE.md`
- Modify: `README.md`
- Modify: `AGENTS.md`（仅同步已确认的新 contract 和测试命令）
- Modify: `docs/evals/query-benchmark-v2.md`

**Interfaces:**
- Consumes: Tasks 1–5 的最终 contract、workflow、executor 和 benchmark reports。
- Produces: 可复现的迁移说明、验收数字、已知限制和下一步 holdout 计划。

- [ ] **Step 1: 更新架构文档，画出 decision→conditional route→executor→UI 的 v2 数据流。**
- [ ] **Step 2: 更新 benchmark 文档，分别记录 decision/plan/execution/E2E 指标、模型来源、运行次数、hash 和 fallback 规则。**
- [ ] **Step 3: 运行 `npm test`。**
- [ ] **Step 4: 运行 `npm run typecheck`、`npm run lint`、`npm run build` 和 `node --check public/app.js`。**
- [ ] **Step 5: 运行 `git diff --check`，确认未加入 `.env.local`、API token 或 benchmark 私有记录。**
- [ ] **Step 6: 生成 v2 baseline/model reports，并记录 18 条 regression 的 wins、regressions、分层准确率和 E2E 结果。**

## Final acceptance criteria

- QueryDecisionV2 能严格表达 execute、clarify、unsupported。
- QueryPlanV2 能严格表达 kind、timeRange、filters 和 none/count/sum/average/max/min。
- LLM 请求只包含 input 和 now，不包含任何用户 records。
- 聚合结果完全由 deterministic executor 产生。
- clarify/unsupported 路径的 `queryRecords` 调用数为 0。
- Repository 没有 LLM decision logic，也没有 aggregation logic。
- Query Agent 保持 read-only。
- 现有 18 条 regression 无回退；average、max 和 ambiguous cases 均进入可表达、可执行、可评测路径。
- Benchmark 能分别报告 decision、plan、execution 和 end-to-end accuracy。
- 所有 npm tests、typecheck、lint、build 和 diff check 通过。
