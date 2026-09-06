# Record System Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in the current session. User approved the four-stage sequence and inline execution.

**Goal:** 明确记录存取、工具执行和查询计划之间的边界，并能比较规则与模型查询。
**Architecture:** React 保持会话状态；Repository 负责记录访问与提交；tools 校验参数；Query Agent 编排计划、工具、UI_POPUP。
**Tech Stack:** Next.js 14, React 18, TypeScript, LangGraph, Zod, localStorage.
**Spec:** `docs/superpowers/specs/2026-09-06-record-system-design.md`

## Global Constraints

Asia/Shanghai；保留原 storage key；不新增依赖、数据库或任务模型；模型只规划；确认写入只由 UI 发起；保持旧规则基线。

## 1. 固定契约与样例

- [x] 创建 `lib/query-contract.ts`、`evals/query-cases.json`、`tests/query-system.test.ts`。
- [x] 固定 `QueryPlan` schema 和时间/空值语义；正常样例明确预期 IDs、金额和范围。
- [x] 运行 `npm run test:query-system`，先确认缺失能力与已知边界失败。

## 2. Repository

- [x] 创建 `lib/repository/record-repository.ts`、`state-storage.ts`。
- [x] `createRecordRepository(snapshot)` 返回快照、查询和提交接口；所有返回值隔离引用。
- [x] `commit(candidate, expectedBefore?)` 返回 `ok/value` 或 `conflict/invalid`，比较完整记录而非只比较 updatedAt。
- [x] state-storage 读写只使用注入的 getItem/setItem；hook 保持兼容并展示错误。
- [x] 测试非法写入、重复提交、冲突、引用隔离、损坏 JSON 和 quota 错误。

## 3. Tool Layer

- [x] 创建 `lib/tools/record-tools.ts`，校验 QueryPlan 后调用 Repository，结果带稳定错误码。
- [x] `confirmRecordDraft` 通过仅供 UI 的提交入口，保留当前消息与草稿语义。
- [x] Query Agent 只使用 query tools，不获得 commit 能力。
- [x] 回归确认前不写入、确认一次、并发修改不覆盖。

## 4. Query Agent 与评测

- [x] 抽出 `lib/query-baseline.ts` 与 `lib/query-result.ts`，保留现有规则计划生成。
- [x] Query workflow 注入 planner，校验失败回退 baseline，返回 plan/source 元信息。
- [x] `server/ai/deepseek-query-planner.ts` 仅输出计划，显式 live eval 时使用现有 DEEPSEEK 配置。
- [x] `scripts/eval-queries.ts` 同一 fixture 比较规则、模型计划/结果，默认离线。
- [x] `npm test`、typecheck、lint、build、diff 检查；更新 AGENTS/README/progress。

代码步骤以各阶段的失败测试、实现和复测作为检查点；不自动提交或推送。
