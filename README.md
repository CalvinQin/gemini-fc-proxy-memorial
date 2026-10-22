# Gemini FC Memorial

给曾经的阿里函数 Gemini 代理留一个纪念。此仓库候选是重新编写的最小通用桥接服务，**不是历史生产函数的源码归档**。未包含任何业务系统代码、真实数据、域名、账号或凭据；未部署、未公开发布。原生产函数保留不动。

## 可独立运行

MIT 许可允许商业使用和自行部署。没有 npm 依赖；本轮在已有 Node.js **22.19.0** 上离线回归，版本写入 `.nvmrc`。Node 自身及其内含组件应保留官方 LICENSE。无收费许可证或托管依赖，Google 模型调用、网络和服务器/FC 资源仍可能收费。

```sh
node --test server.test.mjs
# 按 .env.example 在进程环境/密钥管理器注入凭据；不要把 .env 提交
node server.mjs
```

默认监听本机 `127.0.0.1:9000`，无 CORS、无浏览器密钥分发。调用方使用独立 PROXY_AUTH_TOKEN，长度至少32字符；上游固定 Google 官方地址且禁止重定向。Google Key 不返给调用者，不记录请求体、响应正文或凭据。通过 ALLOWED_MODELS 限制可调用模型（逗号分隔）。请求上限1MiB、每进程并发2、超时60秒。正式暴露公网仍需运维层 HTTPS、访问范围及按调用者限流；本项目不是面向不可信公众的多租户网关。

只接受 GET `/v1/models`、POST `/v1/chat/completions`；聊天及 SSE 直接转发官方兼容协议，保留 tool roles/call IDs/thought signatures。它不包含原代理的私有协议转换，不自动重试生成，不替业务应用执行工具或提供权限判断。`/health` 只返回存活。目录只展示 ALLOWED_MODELS 与 Google 实际目录的交集。中途流断开直接关闭连接，不伪造完成。

## 阿里函数自定义运行时（尚未部署验证）

官方 Custom Runtime 支持 HTTP 服务和自定义启动命令；可设置启动命令为已安装的 Node 路径、参数为 `server.mjs`，端口9000与配置一致，显式设 LISTEN_HOST=0.0.0.0。Node 运行时由部署者提供，不需 Docker。不要复用旧生产令牌，不把 Key 写入 ZIP 或源文件。HTTPS/HTTP 触发器鉴权、区域出口可达性、流式网关缓冲及超时需要在实际账户独立验收；本轮未创建函数或新付费资源。

官方参考（2026-10-22核验）：
- https://ai.google.dev/gemini-api/docs/openai
- https://www.alibabacloud.com/help/en/functioncompute/custom-runtime/
- https://www.alibabacloud.com/help/en/functioncompute/principles-1

模型接口本身为 Google 兼容层（官方仍标 Beta）；本项目不安装 RC SDK，不保证尚未实测模型的全部能力。自动测试只用合成数据、本机HTTP与注入的假上游；真实Google Key、费用、FC部署、断线和并发资源压测均未验证。

正式公开前：项目所有者审查代码与 MIT 署名、选择仓库名，去掉 package.json 的 private 限制后按自身发布流程处理。本候选无 Git 远端，不自动上传任何内容。
