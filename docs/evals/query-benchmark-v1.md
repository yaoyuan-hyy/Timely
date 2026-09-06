# Query Agent Benchmark v1

## 评测对象与口径

评测的是 Query Agent 从查询原文到结构化计划、只读工具执行、结果卡片数据的完整链路。**不包含 supervisor 的写入/查询路由、浏览器交互或用户满意度**，不使用“回复读起来合理”作为准确率。

28 条人工定义的合成用例：10 条开发集、18 条冻结回归测试集，覆盖 time、filter、aggregation、tool_selection、empty、ambiguous、multi_condition。每条固定 now、Asia/Shanghai 时间语义、数据、期望计划/IDs/金额/工具调用与 decision。开发与测试案例由版本文件明确划分；当前测试集已被开发者看到，不称为独立盲测集。未来新增匿名真实语料时按语义场景分组隔离同义改写，另建未用于调参的盲测集。

Gold 在 `evals/query-benchmark-v1.json`；fixture 在 `evals/query-benchmark-fixture.ts`。预期 IDs/金额是人工定义，不从被测 planner 或 Repository 生成。

| 维度 | 判定方式 |
| --- | --- |
| 时间 | 实际时间戳的起止边界精确相等，包含跨年、闰日、整周、UTC/+08:00 等价记录 |
| Filter | kind/title/category/direction 精确匹配；结果 ID 列表也必须正确，防止“条件错但碰巧没数据”得分 |
| Aggregation | 对用户要求的总和、净额、计数、平均值、最大值比较精确的分值；不支持的操作必须计失败 |
| Tool selection | 来自真实调用边界的工具名、记录类型与调用次数；不能从最终文案推测。当前只支持单个 queryRecords 工具，**不是多工具自由规划准确率** |
| Empty | 正确计划、空 ID 列表和 empty 状态均正确；不能把查询失败当成查无记录 |
| Ambiguous | 未定义的“最近”、无上下文指代与不明确混合写请求应 clarify，且不执行查询工具。明确普通查询缺少日期仍遵守今天的产品默认值 |
| 多条件 | 时间、类别、收支、事项等条件组合全部成立 |

主指标 pass@1 = 一次执行中所有适用检查均通过的案例数 / 案例总数。辅助指标：各检查正确率、按标签切片的端到端正确率、ID precision/recall、只读不变量、fallback/error 次数、P50/P95 延迟。标签可能重叠，切片分母不能加总。

模型降级后即使结果正确，也只记 effectivePassed，不记模型通过。`--runs 3` 测试稳定性；主指标仍按每例第一次执行计分，重复执行不能冒充更多独立样本。报告中的 stablePassed 在 runs=1 时没有额外稳定性证据。

## 当次测量（2026-09-06）

| 同一冻结测试集，单次执行 | 规则基线 | DeepSeek v4 flash |
| --- | --- | --- |
| 严格端到端通过 | 7/18，38.9% | 11/18，61.1% |
| 时间切片 | 3/5 | 5/5 |
| Filter 切片 | 2/5 | 5/5 |
| 聚合切片 | 1/3 | 1/3 |
| Tool selection 切片 | 1/2 | 1/2 |
| Empty 切片 | 4/5 | 5/5 |
| Ambiguous 切片 | 0/5 | 0/5 |
| 多条件切片 | 2/3 | 3/3 |
| fallback / error | 0 / 0 | 0 / 0 |
| P50 / P95 | 2 / 18 ms | 763 / 1005 ms |

模型相对规则新增通过四例：整周时间、通用事项名、未命中事项、下午+事项多条件；无反向退步。所有 28 条（含开发集）的规则结果另为 16/28=57.1%，不能与模型 11/18 混用分母。

七条模型失败来自平均值/最大值未提供，以及五条应澄清问题仍被当作查询执行。当前 QueryPlan 缺少 aggregation operator 和 clarify decision，因此 benchmark 会明确暴露能力缺口；本次没有为了分数修改模型提示词或实现这些能力。

18 条样本很小，模型 Wilson 95% 区间约 38.6%–79.7%；而且样例不是随机抽样，这个区间也不能外推为真实用户分布保证。四胜零负的配对结果说明这些用例有所改善，不能据此宣称已达到统计显著的总体提升。旧六条 smoke 的 6/6 不能表述为产品准确率 100%。

## 如何知道改好了

1. 冻结数据、fixture 和评分规则，记录它们的 hash，以及代码 hash、Git commit/dirty 状态、模型、温度、运行次数。
2. 改动前后跑同一测试集，逐条比较 wins/regressions，分别报告端到端结果和错误所在层。
3. `--compare` 在数据/评分规则/分组/次数不一致时拒绝比较；出现原来通过、现在失败的案例时返回非零退出码。
4. 更大规模上线前补至少 100–200 条覆盖真实分布的独立盲测样例，重复评测观察稳定性，并结合配对统计检查差异。开发集用于调试；不要反复照着冻结测试答案调 prompt 后仍称之为泛化效果。

```bash
# 默认只运行冻结测试集；离线，不调用模型
npm run bench:queries -- --out .timely-test/benchmarks/before.json

# 显式模型模式；只发送合成查询和 now，不发送个人记录
npm run bench:queries -- --live --out .timely-test/benchmarks/model.json

# 比较代码或 planner 改动，报告进步与退步
npm run bench:queries -- --compare .timely-test/benchmarks/before.json

# 稳定性测量（真实模型会发生 18×3 次调用）
npm run bench:queries -- --live --runs 3

# 全集分析；--gate 要求全部通过，当前能力缺口会使其失败
npm run bench:queries -- --split all --gate
```

默认退出 0 表示测量成功完成，不代表准确率 100%。`npm test` 验证评分器能拒绝错误时间、错误聚合、错误工具、重复 IDs、数据修改和伪装成成功的 fallback；它与 benchmark 中的产品能力得分是两种检查。

完整当次机器报告保存在 `docs/evals/query-benchmark-v1-results.json`。报告记录 dirty=true，因此通过 sourceHash 标识实际被测实现，不能把结果错误归到尚未包含这些代码的 Git commit。
