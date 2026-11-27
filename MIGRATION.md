# OpenCut 迁移到 Dopame 的记录

本仓库是开源视频编辑器 OpenCut 的网页端，迁移成 Dopame 的窗口应用（用 acdev 构建，在 acde 运行时里运行）。工作约定见 [AGENTS.md](AGENTS.md)。

## 来源

- 上游：[opencut-app/opencut-classic](https://github.com/opencut-app/opencut-classic) 的 `apps/web`，提交 `cf5e79e`（2026-05-17），MIT 许可，见 `LICENSE`。opencut.app 现在跑的就是这一版。
- **为什么不是 [opencut-app/opencut](https://github.com/opencut-app/opencut)**：那个仓库在从零重写，还没有编辑器。桌面端是 GPUI（Rust 原生界面），网页端的 `/editor` 只有一行 “Coming soon”。它从来不是 Tauri 写的：两个仓库的全部历史（1,567 + 1,731 个提交）里都没有出现过 tauri、src-tauri 或 electron。
- 依赖版本全部钉在上游 `bun.lock` 解析出的版本上。如果重新解析，better-auth 会升级，并多出 4 个类型错误。

## 现状（2026-11-27）

运行时为 libacde-next `7122fb1` + acdev-next `093ccee`（GitHub main），宿主机为 macOS arm64。下表每一行都由 `e2e/` 里的测试在完整应用中点出来，并用 `e2e/chrome-baseline.ts` 在 Chrome 158 里用同一构建对照。

| 功能 | 结果 | 怎么验证的 |
|---|---|---|
| 首页、项目页、新建项目、打开编辑器 | 可以 | `full` |
| 导入视频（H.264/AAC MP4）、图片；拖入 104 MB 的视频到素材面板或时间线 | 可以 | `full`、`drop` |
| 加到时间线、预览（颜色正确）、播放 | 可以 | `full`：预览左边是红条，播放时画面在动 |
| 导出 MP4 并保存到用户选的位置 | 可以 | `full`：1280×720 H.264 30 fps + AAC，3.07 s，帧颜色与源一致，音量 −21.2 dB（源 −21.1 dB） |
| 特效（模糊）、文字 | 可以 | `features`：无帧错误；全屏大图里能看到模糊效果，文字清晰 |
| 预览全屏（进入、Esc 退出） | 可以 | `features`：492×276 → 1239×696 → 492×276 |
| 变速 2×，保持音高 | 可以 | `speed`：导出 1.56 s，音高 ≈ 440 Hz，与源相同 |
| 自动字幕（Whisper Small） | 可以 | `captions`：“Hello this is” … “brown.”，和 Chrome 结果一样 |
| 保存快照 | 可以 | `extras`：1280×720 PNG，颜色正确 |
| 项目缩略图 | 和 Chrome 一样是黑的 | `full` / Chrome：上游在退出时按第 0 帧渲染，那时第一帧还没解出来 |
| 贴纸面板 | 空的，和 Chrome 一样 | `extras` / Chrome：上游行为 |
| 音效搜索（Freesound） | 不可用 | 应用后端的 `/api/sounds/search` 回 500：需要配置 Freesound API key，属于部署配置，与运行时无关 |

**尚未覆盖**：在 Dopame OS 会话里运行（运行时的 WebCodecs 目前只有 macOS 实现，Linux 上视频编解码仍不可用；见工作区 `docs/research/opencut/`）。

## 为 Dopame 做的改动

代码里每一处都有 `Dopame migration:` 注释。除标注为“上游 bug”的以外，都只在 acde 运行时里生效（按 user agent 中的 `acde/` 或按特性检测），浏览器里保持上游行为。

| 问题（运行时的表现） | 改动 | 位置 |
|---|---|---|
| 机器上装有 Node.js 时，`acdev build` 构建 Next.js 失败（`--bun is not allowed in NODE_OPTIONS`） | 在 `next.config.ts` 里把 `--bun` 从 `NODE_OPTIONS` 去掉 | `next.config.ts` |
| 上游自身通不过类型检查（20 个错误） | 构建时跳过类型检查 | `next.config.ts` |
| 服务端密钥在加载时被强制校验，缺了就所有页面报错 | 改为可选 | `src/env/web.ts` |
| 没有 `WebAssembly.instantiateStreaming`，Turbopack 加载 opencut-wasm 时崩溃 | polyfill | `public/dopame-compat.js` |
| `copyExternalImageToTexture` 写入 `bgra8unorm` 时不转换通道顺序，预览和导出红蓝互换 | 对 `bgra8unorm` 目标自己交换 R/B 后 `writeTexture` | `public/dopame-compat.js` |
| `<a download>` 不存文件 | 用 `showSaveFilePicker` 保存 | `src/utils/save-file.ts` |
| WebGPU 画布要等帧呈现后才能读回，缩略图、快照是透明的 | 渲染后等一个任务再读 | `src/services/renderer/canvas-renderer.ts` |
| 选取 / 拖入的文件 `File.type` 为空，任何导入都失败 | 按扩展名推断 | `src/media/media-utils.ts`、`processing.ts` |
| 拖入超过 64 MiB 的文件不在 `dataTransfer.files` 里 | 从 `items` 的文件句柄取 | `src/media/dropped-files.ts` |
| `requestFullscreen` 不支持 | 用 `acde:window` 的 `requestState('fullscreen')`，并让预览铺满窗口 | `src/hooks/use-fullscreen.ts` |
| 没有 `ScriptProcessorNode`，变速保音高失败 | 用 soundtouch 的离线 API 直接处理采样 | `src/retime/audio-stretch.ts` |
| Worker 冷启动约 10 s，在它装好消息处理之前发出的消息会丢失，字幕一直停在 “Preparing audio…” | Worker 就绪后发 `ready`，收到后再发 `init`；Worker 出错时报错 | `src/services/transcription/` |
| 不允许从外部主机 import ES 模块，onnxruntime 的 wasm 胶水从 jsdelivr 加载失败 | postinstall 把这两个文件复制到 `public/ort/`，Worker 从本应用加载 | `scripts/copy-ort-assets.mjs`、`worker.ts` |
| `AudioContext` 忽略 `sampleRate`，字幕音频是 48 kHz 却当 16 kHz 用（“(Gibberish)”） | 采样率不对时改用 `OfflineAudioContext` 重新解码 | `src/media/audio.ts` |
| **上游 bug**：特效图层的帧描述字段名与合成器不一致，加特效后每一帧都报错（Chrome 也一样） | 同时发送合成器读取的 `effect_pass_groups` | `src/services/renderer/compositor/` |

## 构建

```sh
bun install --frozen-lockfile     # postinstall 会把 onnxruntime 文件复制到 public/ort/
acdev check --platform linux
acdev build
```

CI（组织模板，acdev 0.1.3）跑的就是这三步。CI 运行记录见仓库的 Actions 页面。

## 测试

在 Dopame 工作区里用 `scripts/acdev.sh` 运行（它会选工作区的运行时和配套 CLI）。**一次只跑一个文件**：多个文件会同时跑 `next build`，抢 `.next/lock`。

| 测试 | 内容 |
|---|---|
| `e2e/full.e2e.ts` | 导入 → 时间线 → 预览 → 播放 → 导出并保存 → 项目缩略图 |
| `e2e/features.e2e.ts` | 特效、文字、预览全屏 |
| `e2e/speed.e2e.ts` | 2× 变速并保持音高，导出后可检查时长和音高 |
| `e2e/drop.e2e.ts` | 拖入大文件（`SMOKE_BIG=<超过 64 MiB 的视频>`） |
| `e2e/captions.e2e.ts` | 自动字幕（`SMOKE_SPEECH=<带人声的片段>`；`SMOKE_KEEP_EVIDENCE=1` 保留运行时日志） |
| `e2e/extras.e2e.ts` | 贴纸、保存快照、音效面板 |
| `e2e/opencut.e2e.ts`、`e2e/import.e2e.ts` | 早期的冒烟测试 |
| `e2e/chrome-baseline.ts` | 在 Chrome 里跑同一流程，作对照（`bun e2e/chrome-baseline.ts`，需要先 `acdev build`） |

截图和结果写到 `build/smoke/`（不入库）。
