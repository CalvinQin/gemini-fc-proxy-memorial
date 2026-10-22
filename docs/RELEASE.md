# 0.1.0 公开源码发布准备

核验日期：2026-10-22。当前是可审阅的源码候选，真实服务部署与模型验收分开。

## 版本与文件

`package.json` 为 `0.1.0`，建议首次公开源码 tag 为 `v0.1.0`。本轮保留 `private: true`，不发布 npm 包，不创建远端、不 push、不打 tag。不能将“发布源码”写成“生产部署完成”。

本轮原始实现提交为 `67986bbb05264a0eaf616c70130663339211f1f1`。后续补充说明和校验材料，并修复慢上传无法取消问题；原 6 个测试场景保留，新增 8 个生命周期/流式回归。最终 Git commit 标识由交接结果提供，避免文档引用自身提交形成循环。

`SHA256SUMS` 覆盖所有候选源码与文档，唯一排除清单自身；Git commit 覆盖清单。修改任意文件后需重新生成，不能沿用旧校验结果。

```sh
sha256sum -c SHA256SUMS
node --check server.mjs
node --test server.test.mjs
git diff --check
git status --short
```

## 发布顺序

1. 所有者核对名称、MIT 版权署名、完整 Git 历史与作者元数据，以及 [验证记录](VERIFICATION.md) 的范围和已知限制。
2. 选择公开仓库，确认只发布此独立项目；不复制主应用仓库、生产配置、`.git/config`、临时目录或真实 `.env`。正常 Git 作者身份会随历史公开；本轮没有改写原始提交。
3. 确定发布日期，将 `CHANGELOG.md` 中对应内容移入 `0.1.0`，重新生成 SHA 清单、重跑上述检查并提交。
4. 将最终确认提交打 `v0.1.0` 标签，发布独立仓库和该标签；推荐附源码归档与归档 SHA-256，源文件清单与归档摘要分别核对。实际公开操作由项目所有者统一执行。
5. 公告写明：原生产函数未删除；候选支持通用 REST 透传；真实 Key、FC 部署与生产负载未验。后续运行时升级单独锁定稳定版本并回归。

不需要先移除 `private: true`；它限制 npm 发布，不限制 GitHub 仓库可见性。当前没有必须购买的组件或服务。

## 可重复生成清单和源码归档

仅在文件内容最终确定后运行。命令不安装工具、不调用模型、不读取仓库外的私有配置。

```sh
python3 - <<'PYTHON'
import hashlib, pathlib, subprocess
root = pathlib.Path('.')
files = sorted(filter(None, subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')))
(root / 'SHA256SUMS').write_text(''.join(
    f'{hashlib.sha256((root / path).read_bytes()).hexdigest()}  {path}\n'
    for path in files if path != 'SHA256SUMS'
))
PYTHON
# 请先把新的文档纳入 Git 暂存范围，再生成清单。
# 源码归档不包含 .git 历史或 Node 二进制；输出位置由维护者选择。
git archive --format=tar --prefix=gemini-fc-memorial-0.1.0/ HEAD | gzip -n > ../gemini-fc-memorial-0.1.0-source.tar.gz
sha256sum ../gemini-fc-memorial-0.1.0-source.tar.gz
```

SHA 清单属于内容完整性校验，不替代来源审查、漏洞审计或发布签名。
