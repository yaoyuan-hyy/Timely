# Timely 记录系统分层设计

用户已确认：回归样例与契约 → Repository → Tool Layer → 可评测 Query Agent，规则查询保留为基线。

采用渐进抽取：继续使用 Next/React、LangGraph、Zod、localStorage，不增加数据库、账号、任务模型或依赖。直接重写 Agent 风险过大；只包一层同名函数又无法隔离存储与查询执行，因此先定义契约，再逐个替换入口。

## 契约

- QueryPlan v1 包含 kind（schedule/ledger/task）、上海时区范围（from/to，闭区间）、title/category/direction 可空过滤条件。所有时间按实际时间戳比较；无任务模型时 task 始终为空。
- RecordRepository 对事件与流水提供快照、查询及单记录提交；提交检查 expectedBefore，拒绝覆盖并发修改。同 ID 同内容重复提交是幂等成功，不同内容是冲突。
- StateStorage 适配器负责 localStorage 读写和 normalizeTimelyState 迁移。浏览器对象由调用方注入，不得在模块加载时访问 window。
- Query tools 仅暴露受校验的读操作和确定性汇总；confirmation tool 只供 UI 使用，不加入 Agent 的工具集合。确认仍需要当前 pendingConfirmation，模型不能传一个 confirmed=true 绕过确认。
- Query planner 只返回 QueryPlan，不接收个人记录；Repository 在客户端执行查询，UI_POPUP 由本地代码构建。规则模式为默认值，模型模式为可注入/显式选择，错误回退规则并返回来源与错误元信息。
- 回归比较记录 ID、时间边界、金额、空结果、无状态变更；不依赖随机消息 ID 或措辞快照。规则与模型使用同一执行器、同一 fixture。

## 验收

正常行为全部保持；新增边界覆盖 UTC/+08:00 等价时间、取消事件、带数据的 task 查询、收支过滤、存储失败、提交冲突、非法 tool 参数、模型失败与非法计划。提供无需 token 的 query eval 命令和显式 live 模型评测入口，分别报告计划正确率和结果正确率。

## 范围限制

本次不新增界面功能，不把对话/视图状态塞入业务 Repository，不承诺跨标签页强一致或服务端数据库事务。现有写 workflow 仍可产生候选状态，最终确认入口经过 Repository。备份导入维持现有合并规则。
