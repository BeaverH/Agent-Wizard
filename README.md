# Agent Wizard

面向企业 Agent 的产品方案与前端交互演示。Builder 构建并交付 Agent，User Portal 围绕任务组织人机协作，Manager 管理资产、访问与治理。

当前产品文档为 [PRD v0.4](agent-wizard-prd-v0.4.docx)，包含 Guardrail 治理、Measure 反馈与整改、Skill 共享能力及验收规则。

## 本地启动

推荐使用 Node.js 24 和 npm。在 PowerShell 中执行：

```powershell
git clone https://github.com/BeaverH/Agent-Wizard.git
cd '.\Agent-Wizard\UI Demo'
npm ci
npm run dev
```

- [Builder](http://127.0.0.1:18123/#builder/agents)
- [User Portal](http://127.0.0.1:18123/#portal/tasks)
- [Manager](http://127.0.0.1:18123/#management/registry)

左下角切换工作区。应用使用 hash 路由，通过 HTTP 服务访问。

## 演示内容

- **Agent 交付**：配置、共享资源和 Skill 绑定、开发与防护验证、发布审批、部署和目录状态。
- **任务协作**：一个 Work 对应一次交付，包含总协作、按需专题、子任务依赖、成果版本与负责人验收。
- **Guardrail 治理**：独立的 Ready、Limited、Not Ready 与风险评估；支持模拟策略撤销、影响分析、整改待办、复测与恢复。
- **Skill**：Manager 查看共享资源与引用，Builder 绑定到草稿，Portal 通过生产版本已绑定的 Agent 使用。

## 验证与构建

```powershell
cd '.\UI Demo' # 已在 UI Demo 目录时跳过此行
npm run test:work
npm run test:governance
npm run test:skills
npm run build
npm run preview
```

验证脚本覆盖 185 项协作断言、96 项治理与执行检查点断言，以及 57 项 Skill 断言。生产构建输出至 `UI Demo/dist/`，预览地址为 [127.0.0.1:18124](http://127.0.0.1:18124/)。

## 项目结构

```text
Agent-Wizard/
├── agent-wizard-prd-v0.4.docx  当前 PRD
├── agent-wizard-prd-v0.1.docx  历史文档
├── agent-wizard-prd-v0.2.docx
├── agent-wizard-prd-v0.3.docx
└── UI Demo/
    ├── src/                   React 界面与状态逻辑
    ├── scripts/               本地验证脚本
    ├── package-lock.json      依赖锁文件
    ├── README.md              交互和数据说明
    └── THIRD_PARTY_NOTICES.md  第三方来源及许可证
```

## 数据与实现范围

本项目为纯前端 Demo。数据保存在当前浏览器的 `localStorage`，未保存的 Agent 编辑暂存于 `sessionStorage`。身份、模型、部署、审批、Guardrail 事件和签署均为模拟；无真实多人同步、SSO、服务端授权或外部业务系统写入。

Guardrail Measure 的链接指向另行运行的本地 Demo `127.0.0.1:18082`，本仓库可独立演示治理流程，不会订阅或写回该系统。Skill 示例不安装外部技能，也不执行真实模型调用。

`node_modules/`、`dist/`、本地截图与文档校对目录 `output/` 以及日志不纳入版本管理。完整交互说明见 [UI Demo README](UI%20Demo/README.md)。

## 第三方来源

基础 UI 组件与设计 token 复用自 [AgentEval](https://github.com/BeaverH/AgentEval) 的 `v0.2.23` 基线。来源、复用文件和 Apache License 2.0 文本见 [第三方声明](UI%20Demo/THIRD_PARTY_NOTICES.md)。
