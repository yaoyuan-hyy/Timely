# Timely · 用自然语言记录日常

一个可运行的 AI 个人记录原型：用一句话记账、记录日程，并查询已经保存的记录。重点探索**自然语言输入有遗漏或错误时，怎样让用户顺利补充、纠正并确认保存**。

当前阶段：本地优先的功能原型，有自动化回归和小规模真实模型评测；尚未完成真实用户研究、留存验证或生产规模验证。

## 三分钟了解这个项目

- [产品案例：问题、取舍与迭代](docs/portfolio/case-study.md)
- [端到端演示与复现步骤](docs/portfolio/demo.md)
- [评测结果与证据边界](docs/portfolio/evidence.md)
- [真实用户测试方案](docs/research/usability-study.md)（待执行）

## 核心体验

```text
“昨天午饭” → 补充金额 → “花35元” → 预览日期、金额、分类
→ “金额改45元” → 更新预览 → 用户确认 → 流水中查看
```

也支持日程记录和查询。所有具体措辞由模型理解，流程示意不保证每次生成相同追问。

![真实演示：确认后保存的流水](docs/portfolio/assets/03-saved-ledger.png)

## 为什么这样设计

| 产品问题 | 当前决策 | 代价与待验证问题 |
| --- | --- | --- |
| AI 理解错了就写入，用户难以信任 | 写入先预览，用户确认后单条保存 | 多一次操作；是否影响轻量记录体验，需要用户测试 |
| 用户短答后丢失原来的日期或事项 | 有效草稿与失败原话隔离，字段带来源，纠正可明确覆盖旧信息 | 协议更复杂，语义遗漏仍需评测 |
| 金额统计不能依赖模型口算 | 模型只输出查询计划，程序过滤并计算 | 仅支持已定义的查询能力 |
| “午饭”和“餐饮”混用导致查不到记录 | 写入与查询共用分类契约，具体事项放备注 | 分类边界需持续验证 |

## 当前架构

```text
输入 → /api/input-decision → 校验 InputDecision
  写入：字段合并 / 追问恢复 → 预览 → 确认 → 单条提交
  查询：Query Agent v2 → execute / clarify / unsupported
        execute → queryRecords → Repository → 确定性计算 → 结果卡片
  已保存记录 → 浏览器 localStorage
```

模型通过服务端调用，密钥不传浏览器。模型会收到当前输入和受限待处理上下文，不接收完整个人记录集合。记录本地存储并不等于解析过程完全离线。

实际 UI 走统一 InputDecision；独立 Query Planner 有规则基线及模型评测入口。旧 supervisor/write workflow 和旧 API 保留兼容，不应理解为多套入口同时驱动当前 UI。[架构详情](docs/architecture/ARCHITECTURE.md)

技术：Next.js 14、React 18、TypeScript、Zod、LangGraph、Plain CSS、DeepSeek。前端和 API 由同一个 Next 服务启动，按目录分离职责。

## 已有证据

| 评测 | 保存结果 | 能说明什么 |
| --- | --- | --- |
| Query v2 冻结 test，2026-09-07 | 严格 12/18；3 条规则回退单独记录 | 该次固定样例表现，不是生产准确率 |
| Write 冻结回归，2026-09-12 | 严格 6/7，13 次请求、fallback 0 | 整条对话严格计分；保留失败 |
| 新增纠正对话，2026-09-12 | 3/3，7 次请求 | 小规模纠正路径验证 |
| 故障注入后的恢复专项，2026-09-12 | 6/6，7 次请求，含一次修复 | 给定失败条件后的恢复能力 |

这些集合不能合并成一个“Agent 准确率”。数据、计分方式和失败解释见[证据索引](docs/portfolio/evidence.md)。

## 手机 App 验证

已加入 Capacitor iOS/Android 工程和独立移动构建入口，复用现有 React UI。当前完成工程与静态构建，尚未生成安装包或完成真机测试；需要实际 HTTPS 后端及原生工具链。[移动端配置与验收](docs/mobile/README.md)

## 本地运行

```bash
npm ci
# 仅首次创建；已有 .env.local 时不要覆盖
cp .env.example .env.local
# 在 .env.local 中填写 DEEPSEEK_API_KEY
npm run dev
```

打开 http://localhost:3000。`DEEPSEEK_BASE_URL` 默认 `https://api.deepseek.com`，`DEEPSEEK_MODEL` 默认 `deepseek-v4-flash`。修改配置后重启。`.env.local` 不提交到 Git。

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

测试默认不消耗模型 API；真实评测需明确运行 live 脚本，详见[评测复现](docs/evals/2026-09-12-input-correction.md)。

## 范围与限制

- 支持独立日程/流水、多轮补充和纠正、查询卡片、日程取消恢复、本地备份导入导出。
- 不做提醒通知、任务规划、账号、云同步或完整财务管理；麦克风仍为禁用占位。
- 时区固定 Asia/Shanghai；浏览器存储不跨设备，刷新会清除未完成草稿。
- 模型有波动，当前评测很小，尚无真实用户体验收益数据。

## 目录与阅读入口

| 目录 | 职责 |
| --- | --- |
| app / components / hooks | 页面、交互与 Next API 路由 |
| server/ai | 服务端模型适配器 |
| lib | 契约、会话、Repository、Tool 与确定性计算 |
| tests / evals / scripts | 自动化测试、数据集、评测工具 |
| docs | 产品决策、演示、研究方案、架构和历史报告 |
| public | 静态资源与旧预览兼容实现 |

[当前 PRD](docs/product/PRD.md) · [进度](docs/progress.md) · [分类契约](docs/architecture/ledger-category-contract.md) · [恢复契约](docs/architecture/input-context-recovery.md) · [协作规范](AGENTS.md)

项目使用 AI 编程工具辅助实现、测试和文档整理。个人职责与贡献应由作者在简历中如实说明；仓库不将生成代码量作为产品能力证明。
