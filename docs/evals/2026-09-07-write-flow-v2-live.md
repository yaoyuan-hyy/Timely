# Write Flow v2 真实模型评测

评测用 `evals/write-flow-v2-live.json` 的 7 个合成多轮 case 驱动 `runInputSession` 和真实的 `parseDeepSeekInputDecision`。模型每轮只接收当前输入、上海时区 reference time 和允许的 pending projection；数据集不包含用户记录，也没有为 case 添加 few-shot 或生产分支。

覆盖范围：多轮补充金额、同时修正日期和金额、显式清空可选字段、模糊时间补充、非法日期、多个操作澄清，以及确认前记录数组保持不变并只在确认后提交。评测按整 case 严格通过：任意轮次断言或最终记录断言失败，整个 case 失败。`model`、`local`、`failed` 来源分别计数；fallback 单独报告，不混入模型成功率。

运行命令（使用项目已有 TypeScript，无需安装 ts-node；运行时清空外层变量，由 `loadEnvConfig` 读取 `.env.local`）：

```bash
./node_modules/.bin/tsc scripts/eval-write-flow-v2-live.ts --module commonjs --moduleResolution node --target ES2020 \
  --outDir .timely-test/write-live-cjs --esModuleInterop --skipLibCheck --strict
env -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL \
  node .timely-test/write-live-cjs/scripts/eval-write-flow-v2-live.js \
  --out docs/evals/write-flow-v2-live-results.json
```

结果写入 `.timely-test/write-evals/`；该目录是临时产物，不应提交。脚本不会打印 API key。网络、鉴权、限流或模型输出不符合 schema 时，脚本如实记录 `failed`/provider failure，且 case 不算通过。

## 2026-09-07 实测

已获准联网后使用真实 `deepseek-v4-flash` 完成三轮。生产代码、prompt、7 个原始 case 均未为本次评测修改。计分器补齐了确认轮状态断言、每轮记录数组深比较、fallback 与严格通过分离，并保存模型 decision、数据集和源文件 SHA-256、commit 与 dirty 状态。

| 轮次 | 严格整条对话通过 | 本地 fallback | 网络/HTTP 异常 | 模型输出契约异常 |
| --- | --- | --- | --- | --- |
| 1 | 6/7（85.7%） | 0 | 0 | 0 |
| 2 | 6/7（85.7%） | 0 | 0 | 1 |
| 3 | 6/7（85.7%） | 0 | 0 | 1 |

三轮共 39 次模型调用、21 条对话执行，严格通过 18/21；仍只有 7 个独立样例，重复执行不增加语料覆盖。这里测量的是这组冻结样例的系统 E2E 表现，不能称为生产泛化准确率或独立的 planner 准确率。报告里的 `providerErrors` 包含适配器抛出的 Zod 校验错误；本次两项均属于模型输出契约错误，不是联网失败。每轮 `failedTurns=2` 中，一项是预期的 6 月 31 日日期拒绝，另一项是首条对话的意外失败。

三轮通过：同时修正日期和金额、清空地点/备注、补充缺失时间、拒绝非法日期后重述、多个操作先澄清、确认后才写入。39/39 个输入轮次均未修改记录数组，21/21 个确认步骤的记录数量与草稿状态符合预期。

三轮失败均为 `ledger-multi-turn-amount`：

- 第一轮将“午饭”放入 amount.value，本地金额校验拒绝整份初始草稿。
- 第二轮 amount.value 为空，适配器契约校验失败。
- 第三轮产生的查询决策带有不匹配的过滤条件，适配器契约校验失败。
- 随后的“花35元”都被当成全新输入，最终金额正确，但日期默认今天，分类为未分类；原来的“昨天”没有延续。

产品层面的优先修复方向是保留失败/歧义输入的未决上下文，让补充答案能在完整原意上重新解析，同时保持无效结果不写入。还需明确“昨天午饭”这种没有金额、时间或显式动作的输入应该默认记账、查记录，还是追问种类。当前 gold 强制选择流水，且分类强制等于“餐饮”；这些是样例假设，尚不是覆盖所有表达的产品契约。本轮保留原 gold 和失败，不事后改答案抬高分数。

范围限制：这 7 条尚未覆盖已保存记录消歧、取消/重复确认、断网重试、并发编辑、查询切换、同义改写与大规模时间边界；已有单元测试不等于这些路径的真实模型 E2E 验收。所谓 fuzzy-time case 实际覆盖的是缺失时间补充，不是“六点”的上午/下午歧义。

机器报告：[第一轮](write-flow-v2-live-results.json)、[第二轮](write-flow-v2-live-repeat-2.json)、[第三轮](write-flow-v2-live-repeat-3.json)。本次脚本编译与 `git diff --check` 通过；评测命令退出码 1 表示存在未通过 case，报告已完整生成。
