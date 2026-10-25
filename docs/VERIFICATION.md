# 合成验证与公开内容审查

核验日期：2026-10-22。原始实现提交 `67986bbb05264a0eaf616c70130663339211f1f1`；发布文档基线 `266da526961c246b0c52daa93ff78a8b85d79a87`；本轮只在独立项目修复慢上传取消并新增测试。所有测试使用随机本机 HTTP 端口与注入的假上游，不使用真实模型或业务数据。

## 源码发布与服务验证分开记录（2026-10-25 只读核实）

源码已公开至 [CalvinQin/gemini-fc-proxy-memorial](https://github.com/CalvinQin/gemini-fc-proxy-memorial)，GitHub 匿名仓库 API 返回 200、public、MIT；默认分支为 `codex/initial-release`。已发布的 `v0.1.0` 标签解析至 `7988bf965e2cc39f7260c32e5596ae0b2d97c5f5`，与核实时远端 HEAD 一致。本次只纠正文档中的旧发布状态，保留版本 0.1.0 及既有标签。

公开源码不代表服务部署：真实 Google Key、模型调用、阿里 FC 网关与生产负载仍未验收；原生产函数未由本项目删除。该项目是重新编写的通用桥接服务，不是原 TradeFlow 私有函数代码和凭据的公开归档。

## 实际结果

- Node.js **22.19.0**；`node --check server.mjs` 与 `node --check server.test.mjs` 通过。
- `node --test server.test.mjs`：**14 通过、0 失败、0 跳过**；保留原 6 项并新增 8 项。
- 回归先复现后修复：新用例运行于未修复服务时，慢上传用例在 1.5 秒保护限时内未结束而失败，其余 13 项通过。服务增加入站取消后，慢上传在约 150 毫秒服务端截止时终止，早于 2 秒客户端保护定时器；14 项全部通过。
- 机器可读的 14 项结果与测试源码摘要见 [lifecycle-tests.json](lifecycle-tests.json)。断流断言的保护截止位于 `assert.rejects` 外层，测试本身超时不会被误判为客户端中止成功。
- `git diff --check` 与 `sha256sum -c SHA256SUMS` 通过。源码 SHA 清单随本轮变更重做；最新归档摘要由交接结果提供。

| 用例 | 本轮证实的行为 |
| --- | --- |
| missing credentials | 必要凭据缺失时拒绝启动 |
| auth rejects | 错误令牌先拒绝，不调用上游 |
| arbitrary destinations/routes | 自定义地址和未知路由被拒绝 |
| model catalog | 固定官方地址、禁止重定向、按允许模型过滤假上游目录 |
| original SSE | 保留原完整合成 SSE 内容断言；单独不作首块时序证据 |
| upstream rejection | 上游错误中的合成 Key 不回显 |
| slow upload timeout | 请求未结束时先占满单槽并返回 429；服务端截止销毁入站 socket，客户端 close，上游未调用，下一次请求成功 |
| client cancels upload | 客户端主动关闭未结束上传，服务端标记 aborted，无上游调用，下一次请求成功 |
| upstream response timeout | 上游收到 abort，客户端收到固定 504，下一次请求成功 |
| real HTTP first SSE frame | 上游控制器保持打开且未发送 EOF，客户端已经读取首块；之后才发送 DONE/结束 |
| upstream midstream failure | 客户端先收到 partial；上游错误后读取拒绝，不伪造 DONE，下一次请求成功 |
| stalled stream deadline | 截止触发上游 signal 与 stream cancel，客户端继续读取失败，下一次请求成功 |
| client cancels SSE | 客户端主动 abort，读取拒绝，上游 cancel，下一次请求成功 |
| body too large | 完整上传体超过测试上限时 413，无上游调用，下一次请求成功 |

测试超时使用 100–150 毫秒、单并发和缩小的体积上限以可靠触发同一实现；默认生产配置仍为 60 秒、2 槽、1 MiB。每个新增用例有总超时，原始 HTTP 客户端有保护截止和销毁清理，fixture 关闭所有本机连接。用例验证服务端与客户端的生命周期，不宣称真实公网时延或服务容量。

## 修复边界

原问题：定时器只中止 fetch 信号，POST 请求体 `for await` 可能一直等待，导致 `finally` 无法及时回收活动槽。

现在同一 abort 信号会在请求体未完成时销毁入站请求，读取退出后在 `finally` 清理计时器、取消监听器和客户端事件监听器、回收槽位。发起上游前检查取消状态。若响应 socket 已关闭，不再尝试发送 JSON 错误；已开始的流直接终止。

未新增依赖、模型 SDK、收费资源或外部代理地址。服务仍是通用透传代理，不执行工具或实现业务权限/确认。实现验证时为尚未发布的 `0.1.0` 候选；后来已公开源码并发布 `v0.1.0`，本轮未修改版本、业务源码或既有 tag。

## 公开内容与许可

逐文件及 Git 历史审查未发现业务模块、客户数据、真实 Google/阿里/GitHub 凭据、业务数据库 URL、生产地址或阿里函数配置。`.env.example` 凭据为空，测试值均为合成值。模式扫描仅辅助审查，不证明绝对不存在秘密。Git 作者身份仍会随完整历史公开；本轮不改写历史。

无 dependencies/devDependencies/peerDependencies/optionalDependencies，未打包 Node 二进制、企业目录或付费功能。MIT 原文保持不变。上述内容审查发生在发布准备阶段；截至 2026-10-25，远端仓库已匿名可读，`v0.1.0` 已发布，见本页开头的独立公开状态核验。

## 未测试

真实 Google Key/模型能力/费用、阿里 FC 启动/鉴权/TLS/网关缓冲、互联网断线与负载、多进程限流、慢请求头、大响应内存上限、持续背压和复杂工具签名往返仍未验。响应尚未设置独立字节上限。该结果支持公开审阅修复后的最小源码候选，不等于生产部署验收。

## 官方依据（2026-10-22）

- [Node 22.19.0 发布页](https://nodejs.org/en/blog/release/v22.19.0)：该精确版本为稳定 LTS 发布，非 RC；并非宣称最新安全补丁。
- [Node 生命周期](https://nodejs.org/en/about/previous-releases)：实际部署应另行核实受支持 LTS 与安全补丁。
- [Node 22.19.0 LICENSE](https://github.com/nodejs/node/blob/v22.19.0/LICENSE)：分发 Node 二进制需保留其完整组件许可，本项目源码包不捆绑 Node。
- [MIT](https://opensource.org/license/mit)：商业使用与分发允许，须保留版权/许可声明。
- [Google OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)：官方端点、模型目录和 Beta 限制；不代表真实 Key 已验。
- [阿里 Custom Runtime](https://www.alibabacloud.com/help/en/functioncompute/custom-runtime/)：可配置启动命令和监听端口，本轮未创建资源或选择预览运行时。
- [npm private](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#private)：保留 `private: true` 防止误发 npm，不影响公开 GitHub 源码。
