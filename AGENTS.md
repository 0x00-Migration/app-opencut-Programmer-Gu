# OpenCut on Dopame：工作约定

本仓库把 OpenCut（opencut-classic `apps/web`，MIT）移植成 Dopame 的窗口应用。来源和每一处改动的理由见 [MIGRATION.md](MIGRATION.md)。

## 仓库

- 远端：`git@github.com:0x00-Migration/app-opencut-Programmer-Gu.git`，用 `~/.ssh/id_ed25519_akira`（`core.sshCommand` 已在本仓库里设好）。
- 提交身份：`Programmer-Gu <cn.guzhengcheng@gmail.com>`，只设在本仓库里，不设全局。
- `main` 受组织规则保护：**不能 force push，不能删除**，推上去的提交都会留下来。推送前先在本地验证。
- 每次推送都会跑 CI（`.github/workflows/check.yml`，来自组织模板，acdev 0.1.3）：`bun install --frozen-lockfile` → `acdev check --platform linux` → `acdev build`。**不改这个文件**，它是组织流程的一部分；构建问题在应用里解决。
- 上游参考：工作区的 `upstream/opencut-classic`（只读）。本仓库导入的是 `cf5e79e`。

## 提交

- 英文 Conventional Commits，主题行不超过 72 列，祈使语气。
- 正文写为什么改，再写 `Verified:` / `Not verified:`。
- 一个提交只改一件事。为 Dopame 做的改动在代码里加注释 `Dopame migration:`，说明原因，并能对上 MIGRATION.md 的条目。
- 不修改上游代码的行为，除非是迁移所需；修上游自身的 bug 单独提交并注明。

## 开发与验证

- 运行时：工作区的 `build/bin/acdev-opencut-latest`，用 `build/build-opencut.sh` 从上游 main 构建，不影响编辑器项目用的 `acdev-next-latest`。
- 命令统一走 `scripts/acdev.sh`，它挑选上面的运行时和配套的 CLI：
  - `scripts/acdev.sh dev`：运行。
  - `scripts/acdev.sh test e2e/<file>.e2e.ts`：端到端测试。**一次只跑一个文件**：多个文件会同时跑 `next build`，抢 `.next/lock`。
  - `scripts/acdev.sh build`：构建包。
- 用 CI 同版本复现：工作区 `build/acdev-0.1.3/bin/acdev`（`check --platform linux`、`build`）。
- 结论以实测为准，并在 Chrome 里用同一段代码对照。探针在工作区的 `experiments/opencut-probes/`，难点清单在 `docs/research/opencut/01-困难与难以实现的部分.md`。
- `e2e/` 的截图和结果写到 `build/smoke/`（不入库；`acdev build` 会重建 `.acde/`，而项目里其他目录的改动会让测试会话重新构建并刷新页面，`build/` 和 `dist/` 不在监视之列）。
