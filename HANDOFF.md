# Gemini FC Memorial 交接

日期：2026-10-25。本次只有文档，不是应用部署。独立香港仓库：`/home/ubuntu/tradeflow-workspaces/gemini-fc-memorial-20261022`。

## 已核实

- 匿名 GitHub 仓库 API 返回 200、public、MIT，仓库 https://github.com/CalvinQin/gemini-fc-proxy-memorial ，默认分支 `codex/initial-release`。
- 匿名 `git ls-remote` 核实远端 HEAD 为 `7988bf965e2cc39f7260c32e5596ae0b2d97c5f5`，`v0.1.0` tag object 为 `7d135344af052f86115d3d7658c8456a90603465`，peeled commit 与该 HEAD 相同。既有标签不得移动。
- MIT 版权署名为 gemini-fc-memorial contributors；没有第三方 npm 依赖或随包 Node 二进制。保留完整许可，不把此许可解释为 Google 服务免费。
- 该项目是通用重写，不包含原 TradeFlow 私有协议转换。原生产函数没有在这里删除；本次不操作阿里 FC。
- 现有 14 项合成验证只使用 loopback 和注入假上游。当前 server.mjs/server.test.mjs 的 SHA 与 docs/lifecycle-tests.json 记录一致，本轮源码未变，因此复用这些已有结果，不冒称重跑。
- 本轮 README/RELEASE/VERIFICATION/CHANGELOG/HANDOFF 与 SHA256SUMS 自洽；`git diff --check`、`sha256sum -c SHA256SUMS` 实际通过。

## 仍未验收

真实 Google Key、真实目录与模型调用、阿里 FC 部署/鉴权/TLS/网关缓冲、互联网负载/复杂签名往返均未通过；详见 docs/VERIFICATION.md。不要把公开仓库、/health 或合成 SSE 当作这些验收。

## 后续发布

本次文档分支由父任务通过既有 GitHub 连接器建立 PR，基于实际默认分支，不直接推 main，不重复建仓库。版本仍 0.1.0，既有 v0.1.0 不变；本地文档提交和远端 PR 来源分别记录。不要把 ignored 的 .release/、.git/、真实环境或仓库外文件上传。
