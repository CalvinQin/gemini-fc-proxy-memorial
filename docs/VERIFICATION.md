# 合成验证与公开内容审查

核验日期：2026-10-22；原始实现提交：`67986bbb05264a0eaf616c70130663339211f1f1`。本次补文档保留原运行代码与 6 项测试。所有运行发生在独立候选目录，未访问主应用数据或真实模型。

## 已执行与通过

- 干净候选基线、原始唯一提交及其跟踪文件人工阅读；Git 无远端、无 tag。Git 作者身份属于正常历史元数据，不等同于无身份的匿名发布。
- `node --version` → `v22.19.0`；`node --check server.mjs` → 退出码 0。
- `node --test server.test.mjs` → **6 通过、0 失败、0 跳过**；测试仅建立随机本机 HTTP 端口，上游注入假实现。
- `git fsck --full --no-reflogs` → 退出码 0。
- 逐文件审查和模式扫描未发现业务模块、客户数据、真实 Google/阿里/GitHub 凭据、业务数据库 URL、生产服务器地址或阿里函数配置。`.env.example` 两个凭据为空；测试令牌均为 `synthetic-*`。模式扫描不是不存在其他秘密的数学保证，公开前仍审查完整 diff 与历史。
- `package.json` 无 dependencies、devDependencies、peerDependencies、optionalDependencies；只导入 Node 内置模块和本地模块，无包安装脚本、打包二进制、企业目录或付费许可证依赖。

| 测试 | 本轮证实的行为 |
| --- | --- |
| missing credentials | 没有必要凭据时拒绝启动 |
| auth rejects | 鉴权失败先拒绝，不调用注入上游 |
| arbitrary destinations/routes | 顶层自定义地址和未知路由被拒绝 |
| model catalog | 固定官方地址、禁止重定向、仅返回允许模型与假上游交集 |
| valid SSE | 本机 HTTP 返回 SSE 类型和完整合成帧；未度量 EOF 前首块延迟 |
| upstream rejection | 上游 401 内容中的合成 Key 不被回显 |

## 失败、已知缺口与未测试

本轮 6 项用例没有失败，但它们不覆盖所有代码分支。尤其旧 SSE 用例名称含 “without buffering”，其实际断言只读取最终正文，不能当作真实增量时序证据。

静态审查确认：`timeoutMs` 的定时器只中止上游信号，不能及时结束 POST 请求体的 `for await`。有效令牌持有者可以让两个慢速未结束上传长期占用 `active` 槽；Node 本身的请求超时也没有在此实现中显式配置。README 已收窄“60 秒超时”的表述，公开候选保留实现；公网部署前需补入站读取超时/取消与实测。响应没有单独字节上限。

未测试：请求体上限边界、并发槽回收、超时及断线竞态、SSE 首块到达与真实背压、工具 ID/签名完整往返、多进程限流、模型能力、Google 有效 Key、费用、FC 启动/鉴权/TLS/网关缓冲/负载。服务是通用透传代理，不校验或执行业务工具，不提供客户权限和业务确认流程。

因此这份结果支持“可公开审查的最小源码候选”，不支持“已通过生产部署验收”。

## 许可与版本核验来源

以下均在 2026-10-22 读取官方页面，未安装新依赖：

- [Node 22.19.0 发布页](https://nodejs.org/en/blog/release/v22.19.0)：2025-08-28 发布，LTS，非 RC/开发版；本轮只声明此精确版本的测试结果。
- [Node 版本生命周期](https://nodejs.org/en/about/previous-releases)：实际部署应采用受支持 LTS，并单独核验安全补丁。
- [Node 22.19.0 LICENSE](https://github.com/nodejs/node/blob/v22.19.0/LICENSE)：Node 自身许可及所包含第三方组件声明。当前归档不捆绑 Node。
- [MIT](https://opensource.org/license/mit)：允许商业使用与分发，保留版权和许可声明；本项目 LICENSE 与标准条款一致。
- [Google OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)：官方兼容端点、示例模型、`GET /models` 与当前 Beta 边界；这些文档事实不代表真实授权模型已调用成功。
- [阿里 Custom Runtime](https://www.alibabacloud.com/help/en/functioncompute/custom-runtime/)：启动命令/监听端口可配置；本轮未选预览运行时或创建资源。
- [npm private](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#private)：`private: true` 防止 npm 发布，可保留作为独立源码项目保护。
