# ADR 0030: Center 托管声明式 HTTP 插件

- 状态：Accepted
- 日期：2026-09-01

## 背景

Tea 需要让所有 Agent 访问租户的 Jira、Wiki、GitLab 和未知内部平台。企业可以
承担 API 描述和鉴权配置工作，但不应被要求部署 open-connector 或为每个平台
维护一个 MCP Server。平台级凭据必须由 Tea 管控，不能进入 Agent、renderer、
会话记录或工具参数。

纯通用 HTTP 透传虽然简单，却把 path、Header 和可调用范围交给 Agent，难以
执行租户隔离和最小权限。为每个平台编写可执行插件包或专用 MCP 则会引入包
分发、进程生命周期、版本兼容和企业运维成本，超出第一期目标。

## 决策

使用 Center 托管的声明式 HTTP 插件：管理员导入 OpenAPI/Swagger/Postman，
配置固定 Base URL、鉴权模式和 write-only 凭据。Center 规范化为 operation
目录并保存租户级配置；凭据使用现有 encrypted secret store 保存。

Desktop 在认证启动和租户切换时获取已启用目录。每个 operation 在 Electron
main 中投影为命名 HostTool，并作为 mandatory tool 合并到每个新建会话。
恢复会话解析创建时已持久化的工具引用。ACP Agent 仍通过标准 MCP 调用工具，
但企业不需要实现 MCP。

执行时 Agent 只提供 operation arguments。Electron main 使用 Center endpoint
session 调用固定 endpoint；Center 从认证 principal 决定 tenantId，重新校验
插件、操作、参数和出站 HostAllowlist，解析凭据并注入上游请求。响应经过大小
限制后作为结构化 HostToolResult 返回。

## 安全与生命周期

- Center access token 只在 Electron main；企业凭据只在 Center。
- 客户端不能提交 tenantId、Base URL、鉴权 Header 或原始凭据。
- 空插件 HostAllowlist 默认拒绝全部；生产 Executor 不跟随 redirect。
- 登出、切租户或目录失败清除 Desktop 快照。
- 自动注入不绕过 Agent 运行时现有审批。
- 一个 ACP 会话的工具附件不可变；启停在下一次同步后的会话生效。
- 第一阶段无插件发布版本和回滚；HostTool `version: "1"` 仅表示投影契约。

## 结果

正面结果：企业接入只需标准 API 描述和少量鉴权配置；Agent 获得语义化工具；
凭据、租户和出站控制集中在 Center；公有云和私有化使用同一套模型。

代价：Center 必须具备到企业 API 的真实网络连通性；OpenAPI 的描述质量直接
影响 Agent 选工具效果；目录不是热更新，运行会话不会立即看到启停变化；新的
鉴权算法仍需 Center 增加受审查的实现。

## 未选择的方案

- 部署 open-connector：增加企业部署和升级负担，且不符合 Tea 托管目标。
- 企业自建 MCP：适合复杂逻辑，但不应成为普通 HTTP API 接入前置条件。
- 通用 HTTP proxy tool：调用面过宽，Agent 能构造未审核 path/Header。
- 可执行插件包：第一期不需要自定义代码执行，安全与版本成本不成比例。

## 演进

未来需要跨接口编排、非 HTTP 协议或复杂业务逻辑时，可增加“企业自建 MCP
由 Center 代理”这一独立插件类型，但必须沿用同一租户、凭据、审批和审计边界，
不能把 MCP 配置或凭据直接下发给 renderer。

## 参考

- `docs/design/center-managed-enterprise-plugins.md`
- `docs/design/center-managed-enterprise-plugins-implementation.md`
- `docs/adr/0020-host-owned-authenticated-center-requests.md`
- `docs/adr/0024-authenticated-local-acp-mcp-attachment.md`
- `docs/plans/2026-09-01-center-plugin-tools.md`
