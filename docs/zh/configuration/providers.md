# 平台与模型

Kimi Code CLI 支持同时接入多家模型供应商服务，模型在供应商之上声明自己的名称、上下文长度和能力。本页介绍如何在 `config.toml` 里配置各种供应商。

## 支持的供应商类型

`providers` 表里的 `type` 字段决定使用哪种协议实现：

| 类型 | 协议 | 典型用途 |
| --- | --- | --- |
| [`kimi`](#kimi) | OpenAI 兼容 | Kimi Code 托管服务、Kimi Platform API 密钥 |
| [`anthropic`](#anthropic) | Anthropic Messages | Claude 系列模型 |
| [`openai`](#openai) | OpenAI Chat Completions | OpenAI 及兼容服务、DeepSeek、Qwen 等 |
| [`openai_responses`](#openai_responses) | OpenAI Responses API | OpenAI 较新的 Responses 接口 |
| [`google-genai`](#google-genai) | Google GenAI | Gemini API |
| [`vertexai`](#vertexai) | Google GenAI on Vertex | Google Cloud Vertex AI |

所有供应商默认以流式方式与模型交互。thinking、视觉、工具调用等能力按模型名前缀自动匹配，通常不需要手动声明。

**凭证优先级**：`api_keys` 中由 `active_api_key_id` 选中的密钥 > `api_key` 直接字段 > `[providers.<name>.env]` 子表键 > 都缺时启动报错。CLI 不会从 shell 环境变量自动取凭证，详见[配置覆盖：供应商凭证](./overrides.md#供应商凭证)。

## `/provider` — 交互式供应商管理

不想手动编辑 TOML？在 TUI 里输入 `/provider` 打开**供应商管理器**，可以以交互方式添加或删除供应商。

![/provider 供应商管理器](../../media/provider-manager.jpg)

管理器按来源把供应商显示为一行行条目。操作方式：

- ↑/↓ 移动光标，←/→ 翻页
- 按 `a` 为选中的供应商添加密钥（添加流程会一并询问该密钥的可选代理），按 `s` 把选中的密钥设为当前使用
- 按 `d` 删除选中的供应商或密钥（有 `[y/N]` 确认）
- 按 `p` 设置供应商代理，按 `r` 开关[自动密钥轮换](#多个-api-密钥与自动轮换)（开启时至少需要两个密钥）
- 在 `[ Add New Platform ]` 行按 Enter 添加新供应商

添加时有两条路径：

- **Known third-party provider**：从 [models.dev](https://models.dev/) 拉取模型目录，选供应商 → 输入 API 密钥 → 选默认模型。目录未声明协议类型的供应商（如 xai、openrouter 这类厂商专用 SDK）会按 OpenAI 兼容协议导入并显示 "guessed" 提示；目录没有可用端点时会先弹出 base URL 输入框；Amazon Bedrock / Cohere 等专有协议和无法识别的显式协议会被拒绝导入。已下线（deprecated）和 alpha 状态的模型不会出现在导入列表中。如果公共目录不可达，CLI 会回退到内置目录快照，离线或网络受限环境下也能完成导入
- **Custom registry (api.json)**：粘贴自定义 registry 地址和 Bearer token，CLI 自动创建 `providers` / `models` 条目。后续启动时，同一个 registry 地址下的供应商会一起刷新，因此上游新增、删除供应商以及模型元数据变化都会同步。

::: warning
通过 `/login` 登录的 Kimi Code OAuth 托管账号不会在 `/provider` 里显示，请用 `/login` 和 `/logout` 管理。
:::

非交互环境下也可以用 shell 命令完成同样操作：[`kimi provider`](../reference/kimi-command.md#kimi-provider)。

## 多个 API 密钥与自动轮换

一个供应商可以同时保存多个 API 密钥。每个密钥是 `api_keys` 子表里的一项，同一时刻只有一个是当前密钥，请求只携带当前密钥的凭证。打开 `rotate_keys` 后，当前密钥被拒绝时 CLI 会自动换到下一个密钥，共享密钥额度用尽或触发限流时，正在进行的会话不会就此中断。

```toml
[providers.openai]
type = "openai"
active_api_key_id = "team"
rotate_keys = true

[providers.openai.api_keys.team]
key = "sk-xxxxx"
name = "Team"

[providers.openai.api_keys.backup]
key = "sk-yyyyy"
name = "Backup"
proxy_url = "http://127.0.0.1:1080"
```

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `api_keys` | `table<string, table>` | — | 具名密钥表；每项包含 `key`、`name`，可选 `proxy_url` |
| `active_api_key_id` | `string` | — | 当前使用的密钥 ID；不填时供应商回退到单个 `api_key` 字段 |
| `rotate_keys` | `boolean` | `false` | 当前密钥被拒绝时切换到下一个密钥 |

轮换按供应商逐个开启，并且至少需要两个密钥；只有一个密钥的供应商行为完全不变。开启后，CLI 按配置文件里的顺序切换到下一个密钥（到末尾后回到第一个），并在会话中以警告形式提示切换到的供应商和密钥名。触发条件很窄：HTTP `403`，或当前步骤的重试预算耗尽后仍然限流。其它失败（`401`、网络错误、`5xx`）仍按原有方式处理。使用 `oauth` 凭证的供应商（`/login` 托管账号）不会轮换。

切换会持久化：轮换会把新的 `active_api_key_id` 写回 `config.toml`，因此下次启动仍使用 CLI 最终选定的密钥。

每个密钥也可以带自己的 `proxy_url`，用于走不同的出口网关。代理按请求解析，密钥优先：当前密钥的 `proxy_url` 覆盖供应商级 [`proxy_url`](./config-files.md#providers)；密钥没填则继承供应商的值；两者都没有则直连。

## `kimi`

用于对接 Moonshot AI 的 OpenAI 兼容接口，包括 Kimi Code 托管服务和 Kimi Platform API 密钥。

- 默认 `base_url`：`https://api.moonshot.ai/v1`
- 凭证键名：`KIMI_API_KEY`、`KIMI_BASE_URL`
- 额外能力：支持视频上传

```toml
[providers.kimi]
type = "kimi"
base_url = "https://api.moonshot.ai/v1"
api_key = "sk-xxxxx"
```

> 使用 Kimi Code 托管服务时，`/login` 登录后会自动配置 `base_url` 和凭证，无需手动填写。

## `anthropic`

用于对接 Claude API。标准 Claude 模型自动启用视觉、工具调用及 Thinking（如支持）；自定义或未覆盖的模型需在 `[models.<alias>]` 里显式声明 `capabilities`。

- 默认 `base_url`：跟随 Anthropic SDK 默认值
- 凭证键名：`ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`
- 默认 `max_tokens`：按模型自动推断。如需覆盖，在模型别名上设 `max_output_size`

```toml
[providers.anthropic]
type = "anthropic"
api_key = "sk-ant-xxxxx"

[models."claude-opus-4-7"]
provider = "anthropic"
model = "claude-opus-4-7"
max_context_size = 200000
# max_output_size = 32000  # 可选，省略时使用模型推断的默认值
```

## `openai`

用于对接 OpenAI Chat Completions 协议，也可连接任何兼容该协议的第三方服务（覆盖 `base_url` 即可）。

第三方推理模型（DeepSeek、Qwen、One API 等）开箱即用：CLI 自动处理 `reasoning_content` 字段和 `reasoning_effort` 注入。如果你的网关用非标准字段名返回推理内容，在模型别名上设 `reasoning_key` 覆盖。

- 默认 `base_url`：`https://api.openai.com/v1`
- 凭证键名：`OPENAI_API_KEY`、`OPENAI_BASE_URL`

```toml
[providers.openai]
type = "openai"
base_url = "https://api.openai.com/v1"
api_key = "sk-xxxxx"
```

## `openai_responses`

对应 OpenAI 较新的 Responses API，始终以流式方式工作。配置方式与 `openai` 相同。

- 默认 `base_url`：`https://api.openai.com/v1`
- 凭证键名：`OPENAI_API_KEY`、`OPENAI_BASE_URL`

```toml
[providers.openai-responses]
type = "openai_responses"
base_url = "https://api.openai.com/v1"
api_key = "sk-xxxxx"
```

## `google-genai`

用于直连 Google Gemini API。thinking、视觉及多模态能力按模型名自动识别。

- 凭证键名：`GOOGLE_API_KEY`

```toml
[providers.gemini]
type = "google-genai"
api_key = "xxxxx"
```

如需经由兼容 Gemini 协议的代理/网关访问，可设置 `base_url`（或 `GOOGLE_GEMINI_BASE_URL` 环境变量）；不填时使用 SDK 默认地址 `https://generativelanguage.googleapis.com`。

> 只填**主机根地址**。Google GenAI SDK 会自行追加 API 版本与路径（如 `/v1beta/models/<model>:generateContent`），所以结尾带 `/v1beta` 会导致路径重复成 `/v1beta/v1beta/…`。

```toml
[providers.gemini]
type = "google-genai"
api_key = "xxxxx"
base_url = "https://your-gateway.example"
```

## `vertexai`

与 `google-genai` 共用实现，`type = "vertexai"` 时切换到 Vertex AI 访问路径。

认证走 Google Cloud 标准 ADC 流程（`gcloud auth application-default login` 或 `GOOGLE_APPLICATION_CREDENTIALS` 服务账号 JSON），这部分与 Kimi Code 无关。**项目 ID 和区域必须写在 `[providers.vertexai.env]` 子表里**。直接在 shell 里 `export GOOGLE_CLOUD_PROJECT` 不会被 CLI 读取。

```toml
[providers.vertexai]
type = "vertexai"

[providers.vertexai.env]
GOOGLE_CLOUD_PROJECT = "my-gcp-project"
GOOGLE_CLOUD_LOCATION = "us-central1"
```

```sh
gcloud auth application-default login   # 一次性完成认证
kimi
```

如需让 Vertex 请求走自定义（如代理）端点，可设置 `base_url`（或 `GOOGLE_VERTEX_BASE_URL` 环境变量）；不填时使用 SDK 默认的区域化 `*-aiplatform.googleapis.com` 地址。与 `google-genai` 一样，只填主机根地址。SDK 会自行追加 `/v1beta1/publishers/google/models/…`。


## 下一步

- [配置文件](./config-files.md) — `providers` 和 `models` 表的完整字段参考
- [配置覆盖](./overrides.md) — 供应商凭证的解析优先级规则
- [环境变量](./env-vars.md) — 各供应商对应的凭证键名列表
