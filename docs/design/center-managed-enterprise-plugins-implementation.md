# Center 企业插件具体实现与运维方案

> 本文描述当前第一期实现，涉及 `tea`、`tea-center` 和
> `tea-center-frontend` 三个仓库。

## 1. 领域模型

`PluginIntegration` 是租户下的可执行 API 配置，核心字段包括：`id`、
`tenant_id`、展示信息、可选 `icon_url`、`source_format`、`base_url`、鉴权类型/Header、
`credential_ref`、`enabled` 和规范化 `catalog`。`icon_url` 只接受绝对
`http/https` 地址，发布到 endpoint 目录并投影为 MCP tool icon；空值使用客户端
默认图标。

`catalog.operations[]` 描述稳定的 `id`、名称、说明、HTTP method/path、参数、
请求/响应 Schema，以及 `readOnly`、`requiresApproval`、`idempotent` 提示。
凭据正文保存在 `encrypted_secrets`，以 tenantId、secret reference 和 keyId
作为 AES-GCM 附加认证数据。插件表只保存引用。

第一期不维护插件发布版本。Desktop HostTool 的 `version: "1"` 是当前工具
投影契约版本，不代表企业插件版本。

## 2. Center 实现

主要代码位于 `tea-center/internal/plugin`：

| 模块                | 职责                                                   |
| ------------------- | ------------------------------------------------------ |
| `catalog.go`        | 解析 OpenAPI 3、Swagger 2、Postman 并生成统一目录      |
| `types.go`          | 输入、鉴权、路径和出站 HostAllowlist 校验              |
| `service.go`        | 导入、CRUD、启停、目录过滤和调用编排                   |
| `executor.go`       | 参数默认值、Header/Body 构造、凭据注入、超时和响应上限 |
| `postgres_store.go` | 所有读写强制包含 tenantId                              |

管理接口需要 Center 管理员会话或 Bearer 管理凭据：

| Method           | Path                                              | 用途               |
| ---------------- | ------------------------------------------------- | ------------------ |
| `GET`            | `/v1/admin/tenants/{tenantId}/plugins`            | 列表               |
| `POST`           | `/v1/admin/tenants/{tenantId}/plugins/import`     | 导入文档和写入凭据 |
| `GET/PUT/DELETE` | `/v1/admin/tenants/{tenantId}/plugins/{pluginId}` | 查看、更新、删除   |
| `POST`           | `.../{pluginId}/enable` 或 `disable`              | 启停               |

Desktop 接口只接受 endpoint session：

| Method | Path                                                       | 用途                           |
| ------ | ---------------------------------------------------------- | ------------------------------ |
| `GET`  | `/v1/endpoint/plugins`                                     | 返回当前租户已启用的无凭据目录 |
| `POST` | `/v1/endpoint/plugins/{pluginId}/operations/{operationId}` | 执行固定操作                   |

调用请求只有 `arguments`；`tenantId` 和 `subjectId` 来自认证 principal，
`conversationId` 只作为审计上下文。Center 重新读取插件并检查 enabled，应用
参数默认值，拒绝未知参数和受保护 Header，然后解析凭据并调用上游。

## 3. Center 管理前端

`tea-center-frontend/src/features/plugins` 提供租户插件管理：

- `contracts.ts` 定义与 Center API 对齐的安全 DTO；
- `pluginStore.ts` 处理按租户加载、竞态丢弃、导入、更新、启停和删除；
- `PluginEditor.vue` 读取 JSON 文档并编辑图标地址、Base URL、鉴权与 write-only 凭据；
- `PluginPanel.vue` 展示启用状态、鉴权配置和规范化操作列表；
- `TenantDetailPage.vue` 将插件中心放入租户详情页。

Center 响应只返回 `credentialConfigured`，不会回显凭据。切换租户时 Store
清空旧列表，并用请求序号忽略迟到响应。

## 4. Desktop 自动注入

`electron/main.ts` 创建一个 `ElectronCenterPluginService`，并把它同时注册为：

- `mandatoryHostTools`：提供每个新会话都必须附加的定义；
- `mainHostToolHandler`：在 Electron main 内执行 Center 插件调用。

`ElectronCenterAuthService` 在内存中持有 access token，公开
`listEnabledPlugins()` 和 `callPlugin()` 两个窄方法。认证状态变化会触发
`synchronize()`；认证启动再执行一次显式同步。同步失败、登出或 tenantId
变化都会清除旧工具快照。

`RuntimeConversationCommandService.createConversation()` 合并用户选择工具和
automatic references，并按 `name + version` 去重。`RuntimeHostToolCatalog`
在主进程解析 canonical definitions，现有 ACP MCP attachment 把它们交给 Agent。

每个 operation 映射为：

```json
{
  "name": "tea_plugin_<readable-label>_<stable-hash>",
  "version": "1",
  "description": "插件、操作说明及 HTTP method/path",
  "inputSchema": { "type": "object", "additionalProperties": false },
  "outputSchema": { "type": "object", "properties": { "statusCode": {} } }
}
```

插件图标作为工具元数据单独传递，不进入请求参数或凭据。默认 bootstrap 的
Overmind 配置使用：
`https://yx-web-nosdn.netease.im/common/a1d7a178ca0d42d05d92555abbc628ea/overmind.png`。

哈希由 `pluginId + operationId` 生成，避免重名；参数 Schema 使用无原型属性表，
可安全处理 `__proto__` 等外部参数名。`ConversationToolBroker` 在执行前检查
Schema、JSON 大小/深度、并发量和超时；取消会中止 Center fetch。

## 5. 部署与初始化

Center 插件出站配置独立于 Remote Connector：

```dotenv
CENTER_PLUGIN_ALLOW_HTTP=false
CENTER_PLUGIN_ALLOWED_HOSTS=jira.corp.example,wiki.corp.example:8443
```

空 `CENTER_PLUGIN_ALLOWED_HOSTS` 表示拒绝全部。公有云部署必须通过公网、VPN、
专线或企业网关实际访问企业 API；企业域名只用于租户发现，不提供网络隧道。
私有化部署可允许内网主机，并仅在可信内网确有需要时开启 HTTP。

租户初始化可选导入一份默认插件：

```sh
TEA_CENTER_BOOTSTRAP_PLUGIN_DOCUMENT=/absolute/api.openapi.json \
TEA_CENTER_BOOTSTRAP_PLUGIN_VARIABLES=/absolute/export-variables.json \
TEA_CENTER_BOOTSTRAP_PLUGIN_DISPLAY_NAME='Example Work Items' \
TEA_CENTER_BOOTSTRAP_PLUGIN_BASE_URL=http://work-items.corp.example \
scripts/bootstrap-tenant.sh /absolute/tenant-bootstrap.json
```

脚本从 Apifox 变量中读取 `ClientID`、`SecretID`，把其他占位变量转换为参数
默认值，通过管理 API 幂等导入并启用。脚本和管理命令不得输出凭据。

`bootstrap-tenant-plugin.jq` 当前是首个 HMAC 系统的样例适配器，固定使用
`ClientID`、`SecretID` 和一组签名 Header 名称。其他系统应通过管理前端/API
导入，或增加新的、带测试的 payload builder；不要把样例规则伪装成通用标准。

## 6. 失败语义

| 失败                    | 对外结果                            | 恢复方式                        |
| ----------------------- | ----------------------------------- | ------------------------------- |
| 未登录、Token 失效      | `unavailable` / 重新认证            | Auth service 刷新一次或要求登录 |
| 插件禁用、操作不存在    | Center 稳定错误码                   | 同步目录或修复配置              |
| 参数、Header、Host 非法 | `plugin_request_rejected`           | 修改 OpenAPI/配置，不发送上游   |
| 上游 401/403            | `plugin_authentication_failed`      | 管理员替换 write-only 凭据      |
| 超时、取消、网络失败    | `plugin_unavailable` 或 `cancelled` | 可由用户重试；不泄露诊断正文    |
| 响应过大                | `plugin_response_too_large`         | 收窄接口响应或分页              |

生产 Executor 不跟随 HTTP redirect；请求/响应有大小上限，调用有固定超时。
所有错误返回稳定类别，不回显 Token、签名、密文或上游 Authorization。

## 7. 验收与后续演进

最低验收包括 Center unit/race/vet、bootstrap jq 测试，Desktop type-check、
broker/plugin 测试、lint、UI boundary 和 web build，以及一次真实 Agent 调用。
基准样例已通过真实 Agent 工具调用；真实业务内容不进入文档或 fixture。

下一阶段按需求增加审计持久化、健康检查、插件修订、Role/Workspace 授权和目录
增量刷新。不得通过给 Agent 增加通用 URL/Header 工具来绕开当前操作边界。
