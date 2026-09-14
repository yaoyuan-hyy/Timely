# 评测与证据索引

不同日期、数据集和方法分开报告。首次请求、校验修复和本地 fallback 不是同一概念；一次逻辑输入可能触发两次 HTTP 请求。整条 case 任意必要断言失败即 E2E 失败。

| 证据 | 结果 | 来源和限制 |
| --- | --- | --- |
| Query v1，2026-09-06 | DeepSeek 11/18（61.1%） | [方法](../evals/query-benchmark-v1.md)，旧契约缺少部分聚合与澄清能力 |
| Query v2，2026-09-07 | 严格 12/18（66.7%）；3 条回退单列 | [报告](../evals/query-benchmark-v2-results.json)，契约和能力发生变化，不能只减百分比宣称泛化提升 |
| Write，2026-09-12 | 6/7；13 次请求，fallback 0 | [报告](../evals/write-flow-v2-correction-recovery.json)，唯一失败是非法日期首轮返回类型与 gold 不同，最终记录正确 |
| 独立纠正对话，2026-09-12 | 3/3；7 次请求 | [数据](../../evals/write-correction-dialogues.json) / [报告](../evals/write-correction-dialogues-results.json)，只跑一次、小样例 |
| 条件恢复，2026-09-12 | 6/6；7 次请求，含一次修复 | [报告](../evals/input-recovery-correction-results.json)，首轮注入故障，随后使用真实模型 |
| 自动化检查，2026-09-12 | Write 40/40；全量测试、类型、lint、build 通过 | [本轮记录](../evals/2026-09-12-input-correction.md)，不等于真实模型或用户总体成功率 |
| 真实用户研究 | 尚未开展 | [测试材料](../research/usability-study.md)，没有虚构访谈、效率提升或留存数据 |

## 怎样判断改得更好

保留原始输入和期望，固定参考时间、数据集与程序版本；比较逐条差异，同时报告整体严格通过、错误类型、模型请求次数、回退和耗时。改动后检查收益是否以其他路径退步为代价。

Query 的 decision、plan、execution 与 E2E 已有分层指标；写入当前主要为逐轮字段与最终记录断言，尚无完善的独立 planner 准确率指标。语义误判、协议错误、网络故障需分别归因。

不得把同一七条运行三次当成 21 个独立样本，不把小专项 100% 写成总体 Agent 准确率，不将手工演示当成随机用户测试。若重定义合理澄清的 gold，创建新版本和对照说明，保留旧分数。

## 复现入口

```bash
npm test
npm run test:query-v2
npm run bench:queries:v2 -- --live
```

Query live 需要配置 API token，会产生模型请求。[写入与恢复的复现命令](../evals/2026-09-12-input-correction.md)。历史报告不自动代表当前 HEAD：机器报告保留源码哈希和/或提交信息，运行时可能包含未提交改动。
