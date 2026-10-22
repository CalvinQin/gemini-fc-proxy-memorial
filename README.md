# Gemini FC Memorial

给曾经的阿里函数 Gemini 代理留一个纪念。这是重新编写的最小通用桥接服务，原生产函数保持不动。仓库只包含通用代理、合成测试和说明，不是历史生产函数的源码归档，也不包含原业务系统的私有协议转换。

当前源码候选版本 **0.1.0**，尚未创建远端、发布 tag、部署函数或调用真实模型。测试结果和已知限制见 [验证记录](docs/VERIFICATION.md)，发布步骤见 [发布说明](docs/RELEASE.md)。

## 能做什么

- `GET /health`：进程存活检查，不探测上游。
- `GET /v1/models`：返回配置允许的模型与 Google 实际目录的交集。
- `POST /v1/chat/completions`：转发 JSON 或 SSE，支持白名单内的请求字段；工具消息、调用 ID 和签名作为消息内容透传，不执行工具。
- 固定上游为 `https://generativelanguage.googleapis.com/v1beta/openai`，禁止重定向，不接受自定义上游地址。
- 调用者使用独立代理令牌；Google Key 只存在于服务端进程环境。无 CORS、浏览器密钥分发、自动生成重试、数据库或付费托管依赖。

只支持上述两个模型接口。请求顶层字段限于 `model`、`messages`、`temperature`、`tools`、`tool_choice`、`stream`、`stream_options`、`max_tokens`、`response_format`。不支持任意 OpenAI 参数、Embeddings、Batch、文件上传或模型执行权限管理。

## 运行

没有 npm 依赖，也无需 `npm install`。`.nvmrc` 与 `package.json` 锁定已测试的 **Node.js 22.19.0**；官方将该版本列为稳定 LTS 发布。此锁定用于复现实验，不表示它仍是最新安全补丁。实际部署前应核实受支持 LTS 的补丁版本，在独立环境复跑测试后再明确更新锁定版本，不安装 `latest`。[官方发布记录](https://nodejs.org/en/blog/release/v22.19.0)、[支持周期](https://nodejs.org/en/about/previous-releases)。

```sh
node --version
node --check server.mjs
node --test server.test.mjs
# 按 .env.example 在进程环境或密钥管理器中注入值。
# 服务不会自动读取 .env，切勿把真实值写入仓库。
node server.mjs
```

| 环境变量 | 用途 | 默认值 |
| --- | --- | --- |
| `GEMINI_API_KEY` | Google API Key，必填 | 无 |
| `PROXY_AUTH_TOKEN` | 独立代理令牌，至少 32 字符，必填 | 无 |
| `ALLOWED_MODELS` | 允许的模型 ID，以逗号分隔 | `gemini-3.8-flash` |
| `PORT` | HTTP 监听端口 | `9000` |
| `LISTEN_HOST` | 监听地址 | `127.0.0.1` |

示例模型名来自核验时的 [Google 官方兼容接口示例](https://ai.google.dev/gemini-api/docs/openai)，不保证任何账号都有权限或额度。请显式配置你有权使用的模型，再核验真实目录；目录列表不承诺模型的工具、图像或其他能力。

服务默认仅监听本机。公网入口需要单独的 HTTPS、访问范围和按调用者限流。代理没有多用户身份、业务对象权限、费用配额或持久化，不能替代业务服务的授权与确认。

## 资源与错误边界

每进程最多 2 个活动代理请求；POST 请求体累计超过 1 MiB 会拒绝。上游请求使用 60 秒 AbortSignal，流中途失败会关闭连接，不补造完成标记。上游错误只返回固定错误码，不回显上游响应正文；代码不记录请求体、响应正文或凭据。

**已知限制：60 秒信号不能及时终止仍未收完的入站请求体。** 持有有效代理令牌的慢速上传可能占满两个活动槽。公开源码候选保留此最小实现，不能据此宣称已完成公网服务加固；部署前需验证入口读取超时或修复请求体取消逻辑。响应大小也未设独立上限。详细证据范围见 [验证记录](docs/VERIFICATION.md)。

## 可自行部署，阿里函数只是可选入口

普通 Node HTTP 服务即可运行；无需特定云、Docker、企业许可证或订阅。阿里函数 Custom Runtime 可以自定义启动命令与端口；部署者需要提供符合锁定版本的 Node，启动参数为 `server.mjs`，端口与配置一致，并显式设置 `LISTEN_HOST=0.0.0.0`。本仓库不含账号、函数名、区域、触发器配置、部署凭据或自动部署脚本。

FC 的 HTTPS、触发器鉴权、区域出口、运行时兼容、流式缓冲、连接中断与超时需在实际账户独立验收，本轮均未验证。官方文档中的 Custom Debian 12 当前标为预览，本项目没有选择或安装该预览运行时。[阿里官方 Custom Runtime 文档](https://www.alibabacloud.com/help/en/functioncompute/custom-runtime/)。

## 许可证和费用

源码采用 [MIT](LICENSE)，允许商业使用、修改、分发和自行部署，分发时应保留版权及许可声明；没有企业收费目录或商业功能开关。[MIT 官方许可说明](https://opensource.org/license/mit)。

仓库不包含 Node 二进制。若另行分发 Node，需保留 [Node 22.19.0 的完整 LICENSE 与其内含组件声明](https://github.com/nodejs/node/blob/v22.19.0/LICENSE)，不能用本仓库的 MIT 文件代替。Google 模型/API 使用受其服务条款与配额约束；调用、网络和服务器/FC 资源费用与源码许可证分开，本次验证未发生真实模型调用。

Google OpenAI 兼容层当前仍标为 Beta；这里使用官方 REST 端点，没有安装 RC 或开发版 SDK。[官方兼容范围与限制](https://ai.google.dev/gemini-api/docs/openai#current-limitations)。

`package.json` 的 `private: true` 用于防止误发 npm 包，可保留并公开 GitHub 源码。源码发布不需要 npm 发布或收费服务。[npm private 字段说明](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#private)。
