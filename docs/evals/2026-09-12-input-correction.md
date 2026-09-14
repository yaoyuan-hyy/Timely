# 多轮输入纠正验证（2026-09-12）

本轮解决来源判定不一致和缺少纠正覆盖声明两个问题。恢复校验与字段应用共用来源规则；旧输入可由本轮有依据的 patch 显式 supersede。正常草稿仍按字段增量合并，不信任失败字段。详见 [契约](../architecture/input-context-recovery.md)。

| 集合 | 严格通过 | HTTP 请求 | fallback |
| --- | --- | --- | --- |
| 冻结七条 | 6/7 | 13 | 0 |
| 独立纠正对话 | 3/3 | 7 | 0 |
| 注入故障的恢复专项 | 6/6 | 7（含一次修复） | 0 |

冻结七条唯一失败断言：6月31日首轮期望 failure=invalid_value，实际模型返回合法 clarify。该条的纠正预览、确认和最终日期/时间/标题均通过，但按冻结契约仍失败。没有修改 gold，不将其记为 E2E 通过。过去失败报告没有保留被适配器拒绝的原始 decision，不能断言历史那次模型究竟遗漏了哪个字段；本轮用确定性测试复现来源误判，并用真实模型验证新覆盖声明。

新三条在生产修改后独立编写，未放入 prompt，也没有为其调整生产分支；覆盖单独改日期、连续两次改金额及重复确认、清空地点保留事项时间。样本小且本轮只跑一次，不等于稳定性或泛化准确率。六条专项首轮为注入故障/澄清，只有后续恢复用真实模型；不能当成自然输入总体成功率。

报告：[冻结回归](write-flow-v2-correction-recovery.json)、[独立对话](write-correction-dialogues-results.json)、[恢复专项](input-recovery-correction-results.json)。全部输入使用合成数据，无浏览器私人记录。

验证：npm test、npm run typecheck、npm run lint、npm run build、git diff --check；Write v2 40/40。新增核心回归在修复前观察到失败。浏览器界面本轮未修改、未重新验收。

复现（报告写临时路径可避免覆盖保存结果）：

```bash
./node_modules/.bin/tsc scripts/eval-write-flow-v2-live.ts scripts/eval-input-recovery.ts --module commonjs --moduleResolution node --target ES2020 --outDir .timely-test/write-live-cjs --esModuleInterop --skipLibCheck --strict
env -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL node .timely-test/write-live-cjs/scripts/eval-write-flow-v2-live.js
env -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL node .timely-test/write-live-cjs/scripts/eval-write-flow-v2-live.js evals/write-correction-dialogues.json
env -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL node .timely-test/write-live-cjs/scripts/eval-input-recovery.js --out .timely-test/recovery-check.json
```
