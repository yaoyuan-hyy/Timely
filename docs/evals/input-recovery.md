# 上下文恢复验证（2026-09-07）

## 最终结果

- 恢复专项 6/6：故障后补金额、契约失败后补金额、跨午夜、新话题替换、意图澄清、已存在草稿的失败修改恢复。先注入确定的故障/澄清，再用真实 `deepseek-v4-flash` 处理补充；共 8 次 HTTP 调用，其中 2 次为有界校验修复，fallback 0。
- 原七条冻结样例严格 6/7（85.7%）。之前“昨天午饭 → 花35元”的日期丢失已不再出现，本次唯一失败为分类 `午饭` 不等于 gold 的 `餐饮`。没有更改原 gold，也没有把分类差异从严格 E2E 计分中剔除。
- 全量 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过；其中 Write v2 测试 34 项，比恢复改动前增加 13 项。

专项结果：[input-recovery-live-results.json](input-recovery-live-results.json)。原样例对照：[write-flow-v2-after-recovery.json](write-flow-v2-after-recovery.json)。实现说明：[上下文恢复契约](../architecture/input-context-recovery.md)。

这是条件恢复能力的测试，不是广泛自然语言准确率。初始故障是注入的，已知有效草稿由固定 fixture 建立；跟进解析、字段合并与确认是实际代码。首次实际联调只有 2/6，通过情况与当时源码哈希保留在 [first-attempt](input-recovery-first-attempt.json)。后续增加通用来源定位、应用决定草稿身份以及有界校验修复后才达到 6/6，没有为具体标题或金额加生产分支。

原七条样例的独立总分没有上升。恢复正确性有所改善，分类契约尚未统一；不能以专项 6/6 宣称整个 Agent 已达到 100%。一次专项运行中的 8 次请求也不能隐藏成仅 6 次模型调用。

## 复现

```bash
./node_modules/.bin/tsc scripts/eval-input-recovery.ts --module commonjs --moduleResolution node --target ES2020 --outDir .timely-test/write-live-cjs --esModuleInterop --skipLibCheck --strict
env -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL node .timely-test/write-live-cjs/scripts/eval-input-recovery.js
```

使用 `.env.local`，不打印 token，也不向模型发送浏览器记录集合。样例、每轮时间、来源、模型 decision、实际字段、断言和源码哈希随 JSON 结果保存。执行前若要保留上一次专项结果，请将报告另存；历史冻结 v1/v2 数据不受影响。
