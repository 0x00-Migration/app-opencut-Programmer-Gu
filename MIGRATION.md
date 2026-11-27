# OpenCut 迁移到 Dopame 的记录

本仓库是开源视频编辑器 OpenCut 的网页端，迁移成 Dopame 的窗口应用（用 acdev 构建，在 acde 运行时里运行）。

## 来源

- 上游：[opencut-app/opencut-classic](https://github.com/opencut-app/opencut-classic) 的 `apps/web`，提交 `cf5e79e`（2026-05-17），MIT 许可，见 `LICENSE`。opencut.app 现在跑的就是这一版。
- **为什么不是 [opencut-app/opencut](https://github.com/opencut-app/opencut)**：那个仓库在从零重写，还没有编辑器。桌面端是 GPUI（Rust 原生界面），网页端的 `/editor` 只有一行 “Coming soon”。它从来不是 Tauri 写的：两个仓库的全部历史（1,567 + 1,731 个提交）里都没有出现过 tauri、src-tauri 或 electron。
- 依赖版本全部钉在上游 `bun.lock` 解析出的版本上。如果重新解析，better-auth 会升级，并多出 4 个类型错误。

## 提交

| 提交 | 内容 |
|---|---|
| `feat: import the OpenCut web editor as a Dopame app` | 原样导入上游代码，只加 acdev 所需的文件：`acde.config.jsonc`、`@acde/api`、`packageManager`、钉住版本的依赖、`bun.lock`、模板 CI |
| `fix(build): build upstream HEAD with acdev` | 跳过 `next build` 的类型检查（上游自身有 20 个类型错误）；服务端密钥改为可选 |
| `fix: open the editor and import files on the acde runtime` | 补 `WebAssembly.instantiateStreaming`；文件 MIME 类型为空时按扩展名推断 |
| `docs: record the migration and add smoke tests` | 本文件和 `e2e/` 冒烟测试 |
| `fix(build): drop --bun from NODE_OPTIONS before Turbopack starts` | 绕过 acdev 在装有 Node.js 的机器上构建 Next.js 失败的问题（CI 第一次运行就是因此失败） |

## 现在能做什么、不能做什么（都实际运行过）

运行时为 libacde-next `a80a18e` + acdev-next `cb75716`（2026-11-26 的 GitHub main），宿主机为 macOS arm64。

前四行是在完整应用里点出来的（`e2e/`）。其余各行是在探针页面里，直接运行 OpenCut 自己的库（opencut-wasm 0.2.10、mediabunny 1.41.0、soundtouchjs 0.3.0）、按 OpenCut 的调用方式测得的；还没有在完整应用里逐一点到。

| 功能 | 结果 |
|---|---|
| 首页、项目页、新建项目、打开编辑器（预览、时间线、属性面板、欢迎对话框） | 可以 |
| 导入图片（PNG） | 可以（要靠上面的扩展名回退） |
| 导入视频（H.264/AAC MP4） | 文件能存下，但 OpenCut 提示 “AVC cannot be decoded in this browser”，无法预览、无法剪辑。原因是运行时没有 WebCodecs 的 `VideoDecoder` / `AudioDecoder` |
| 导出 MP4/WebM | 不可以：运行时没有 `VideoEncoder` / `AudioEncoder`；另外 `<a download>` 不存文件 |
| 预览颜色 | 红蓝互换：运行时的 `copyExternalImageToTexture` 写入 `bgra8unorm` 纹理时没有转换通道顺序 |
| 快照、项目缩略图、导出帧（渲染后在同一任务里读 WebGPU 画布） | 读到的是空白：运行时要等帧呈现之后才能读，和 Chrome 正好相反 |
| 模糊特效预览、蒙版羽化（`applyEffectPasses` / `applyMaskFeather`） | 报错：OffscreenCanvas 不支持 `webgpu` 上下文 |
| 变速保音高（soundtouchjs `PitchShifter`） | 报错：没有 `ScriptProcessorNode` |
| 自动字幕（transformers.js） | 未测；运行时不允许从外部主机 import ES 模块，默认配置会失败 |
| 全屏预览 | `NotSupportedError` |

每一条的复现方法和对照数据（同一段代码在 Chrome 158 里运行的结果），见 Dopame 工作区的 `docs/research/opencut/`。

## 构建

```sh
bun install --frozen-lockfile
acdev check --platform linux
acdev build
```

**acdev 的问题（已在应用内绕过）**：机器上装有 Node.js 时（GitHub 的 Ubuntu 运行器默认就有），`acdev build` 会失败，报 `node: --bun is not allowed in NODE_OPTIONS`。

- 原因：acdev 以 `bun --bun <绝对路径>/next build` 运行 Next.js，Turbopack 处理 PostCSS 时会用真正的 node 启动工作进程，并带上 `NODE_OPTIONS=--bun`。
- 最小复现：在任何 Next.js 16 + Tailwind/PostCSS 项目里，`bun --bun ./node_modules/.bin/next build` 失败，而 `bun --bun node_modules/.bin/next build`（不带 `./`）能编译通过。
- 绕过：`next.config.ts` 在 Turbopack 启动工作进程之前加载，于是在这里把 `--bun` 从 `NODE_OPTIONS` 里去掉（提交 `fix(build): drop --bun from NODE_OPTIONS before Turbopack starts`）。根本的修复应该在 acdev 里做。

**CI 结果**：

| 提交 | 运行 | 结果 |
|---|---|---|
| `d2d68d9`（迁移的 4 个提交） | [45771870999](https://github.com/0x00-Migration/app-opencut-Programmer-Gu/actions/runs/45771870999) | 失败，停在 `acdev build`，其余步骤都通过 |
| `ae1887b`（只加了上面的绕过） | [45772212995](https://github.com/0x00-Migration/app-opencut-Programmer-Gu/actions/runs/45772212995) | 全部通过，产出 55.6 MB 的包 |

## 冒烟测试

```sh
acdev test e2e/opencut.e2e.ts   # 首页 → 项目页 → 新建项目 → 编辑器
acdev test e2e/import.e2e.ts    # 用 Import 按钮导入 PNG 和 MP4，记录提示
```

截图和结果写到 `.smoke/`。
