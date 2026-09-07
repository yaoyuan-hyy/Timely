# Query Agent Benchmark v2

v2 keeps the 28 synthetic scenarios and their IDs, split, fixed `now`, fixture, and expected record IDs from v1. The new gold format expresses a validated `QueryDecisionV2`, a `QueryPlanV2`, and deterministic execution evidence: ordered IDs, matched count, aggregation value and evidence, totals, and status.

The scorer reports decision, plan, execution, tool selection, read-only, and end-to-end checks separately. A wrong decision remains a failure in the decision denominator; it is not removed before plan or execution scoring. Clarification and unsupported cases require null plan and execution plus zero `queryRecords` calls. A rules fallback receives `effectivePassed` when behavior is correct, while strict model pass remains false.

审查发现此前规则为可见 benchmark 增加了特定标题词汇；已删除这部分扩充。当前离线规则 baseline 在完整 28 条集合上为 **25/28**，保留三个标题识别失败，不靠枚举测试词获得满分。这是回归结果，不能当作未见输入准确率。

2026-09-07（上海时间）真实 `deepseek-v4-flash`，冻结 test 18 条、单次运行：严格 E2E **12/18 = 66.7%**；3 条 planner failure 经规则回退后正确，包含回退的产品行为为 15/18。其余 3 条遗漏 title filter。average/max 均通过，5 条 ambiguous 中 4 条由模型正确澄清、1 条通过规则回退澄清。

报告的 decision 18/18、plan 10/13 是 workflow 输出指标，**含回退**；仅模型来源的 decision 为 15/15、plan 为 8/11。独立 gold plan executor 为 13/13，说明给定正确计划时过滤和聚合通过。不是模型计算准确率，也不覆盖浏览器展示。严格 E2E 的 Wilson 95% 区间为 43.7%–83.7%，单轮结果不足以证明稳定改善。v1 的 11/18 为历史测量，v2 使用新契约与 scorer，不能直接声称统计显著提升。

完整机器报告：[query-benchmark-v2-results.json](query-benchmark-v2-results.json)。该次 live 运行在清理规则词汇前，sourceHash 保留当时快照；清理后规则报告为 [query-benchmark-v2-rules-results.json](query-benchmark-v2-rules-results.json)。保留所有失败和 source/fallbackReason；未修改冻结输入或为此次 live 结果调 prompt。应用的查询仍默认规则模式，模型 planner 仅在显式注入与 live eval 中使用。

The runner executes each gold plan independently through a fresh repository and query tool before comparing the workflow result. It records dataset, fixture, scorer, and source hashes and refuses `--compare` across v1/v2, changed data, scorer, split, or run count.

```bash
# offline rules baseline
npm run bench:queries:v2 -- --out .timely-test/benchmarks/v2-before.json

# explicit provider evaluation
npm run bench:queries:v2 -- --live --out .timely-test/benchmarks/v2-model.json

# regression comparison and stability
npm run bench:queries:v2 -- --compare .timely-test/benchmarks/v2-before.json
npm run bench:queries:v2 -- --live --runs 3
```

This suite is a synthetic regression benchmark, not a claim about the distribution of personal queries. Holdout evaluation should use independently sampled real-language cases before drawing product accuracy conclusions.
