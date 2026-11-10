# WorkBuddy 原版架构基线（监督基准）

> 提取自 `/Applications/WorkBuddy.app/Contents/Resources/app.asar`
> 本文件是「监督角色」判定复刻一致性的唯一裁判依据。所有事实均来自打包产物的静态证据，标注为**事实**；推测项标注为**推断**；未验证项标注为**未知**。

## 0. 身份事实

| 项 | 值 | 证据来源 |
|---|---|---|
| 包名 | `@genie/workbuddy-desktop` | package.json `name` |
| 版本 | `5.9.3` | package.json `version` |
| 入口 | `main/index.js` | package.json `main` |
| 打包器 | rolldown（`rolldown-runtime.js` 被 facade.js require） | main/facade.js 首行 |
| asar 体积 | 181,953,296 字节（约 182 MB） | Resources 目录 `app.asar` |
| 依赖总数 | 19（直接 dependencies） | package.json |

## 1. 关键依赖（事实）

原版 `dependencies` 中与本复刻最相关的重型依赖：

| 依赖 | 版本 | 用途推断 |
|---|---|---|
| `@genie/agent-harness` | `workspace:*` | 核心 agent 运行时（monorepo 内部包） |
| `ws` | `^8.18.0` | 进程间 / 前后端 WebSocket |
| `@lydell/node-pty` | `^1.2.0-beta.14` | 内置终端 |
| `@tencent/aegis-electron-sdk-v2` | `^2.6.13` | 腾讯监控/遥测 |
| `@tencent/wwapi-electron` | `0.1.25` | 企业微信 API |
| `@larksuiteoapi/node-sdk` | `^1.60.0` | 飞书 API |
| `@wecom/aibot-node-sdk` | `1.0.7` | 企业微信 AI Bot |

> 推断：本复刻若要「一致」，需逐步覆盖：agent runtime、WebSocket、内置终端、遥测、企业微信/飞书/钉钉等渠道。但作为第一版复刻，先对齐核心对话链路。

## 2. 进程架构（事实 + 推断）

- 主进程模块数量：`/main/*.js` 约 **300+** 个（见下文清单）。
- 存在多进程/守护进程痕迹：`daemon-bootstrap.js`、`daemon-app-server-entry.js`、`daemon-app-server-main.js`、`bootstrap-daemon-in-main-process.js`。
- 存在「app-server」概念：`app-server-background-services.js`、`app-server-database.js`、`app-server-mcp-apps-host.js`。
- 推断：原版不是单主进程模型，而是「主进程 + daemon app-server 子进程」架构。

## 3. 主进程模块分区（事实，按职责归类）

### 3.1 入口与引导
- `main/index.js`（310 KB）、`main/index-minimal.js`、`main/minimal.js`、`main/main-bootstrap.js`、`main/facade.js`

### 3.2 IPC / Handler
- `main/handler-registry.js`、`main/handlers.js`、`main/handlers2.js`、`main/handlers3.js`

### 3.3 会话 / 对话
- `main/conversations.js`（795 KB，最大单模块）

### 3.4 数据库
- `main/database-factory.js`（250 KB）、`main/app-server-database.js`、`main/app-server-database2.js`
- 证据：本复刻 `store.ts` 注释自称对齐「node:sqlite + WAL + synchronous=NORMAL + safeStorage」，与 `database-factory.js`、`credential-protection.js` 对应。

### 3.5 凭据保护
- `main/credential-protection.js`、`main/credential-protection-bootstrap.js`

### 3.6 菜单 / 原生主题
- `main/menu-builder.js`、`main/menu-builder2.js`、`main/menu-i18n.js`、`main/menu-i18n2.js`、`main/native-theme-source.js`

### 3.7 渠道接入（IM / 协作）
- `main/feishu.js`、`main/dingtalk.js`、`main/discord.js`、`main/ioa-im-actions.js`、`main/ioa-im-override.js`

### 3.8 遥测 / 可观测
- `main/buddy-telemetry-context.js`、`main/guardian-telemetry-events.js`、`main/hub-tracer-handoff.js`、`main/crash-reporter.js`、`main/crash-reporter2.js`、`main/buffered-file-logger.js`、`main/logger*.js`

### 3.9 守护进程 / 生命周期
- `main/daemon-bootstrap.js`、`main/daemon-app-server-entry.js`、`main/daemon-app-server-main.js`、`main/daemon-id-generator.js`、`main/daemon-log-config.js`、`main/daemon-shutdown-policy.js`、`main/app-lifetime-job.js`

### 3.10 安全 / 防护
- `main/fs-protection.js`、`main/log-acl-guard.js`、`main/gateway-secret.js`、`main/auth-liveness.js`、`main/auth-loss-observer.js`

### 3.11 办公文件 / 编辑器
- `main/office-file-association-repair.js`、`main/office-file-window-focus.js`、`main/office-lifecycle-log.js`、`main/kill-stale-editor-sdk-core.js`

### 3.12 版本自更新
- `main/appimage-self-update.js`、`main/mac-dmg-launch.js`

## 4. Renderer 面板清单（事实）

renderer 按面板做代码分割，共识别 **24 个面板级 chunk**：

```
AccountPanel            BuddyAppsPanel          BuddyOneBindDialog
ClawSettingsPanel       ConversationFlowPanel   CreditsUsageEmbedPanel
DataManagementPanel     DeviceConnectionsPanel  ExtensionsSettingsPanel
GetHelpPanel            HelpFeedbackPanel       LaboratoryPanel
McpPoiConsentCard       MemorySettingsPanel     ModelsSettingsPanel
PersonalizationPanel    PreviewIframe           SecurityCenterPanel
StatusPlaceholder       SubscriptionUsagePanel  UserMenu
MediaPreviewContext     Icons
```

> 本复刻目前仅覆盖一个「设置面板」（SettingsPanel），与原版「分面板」结构差异巨大。

## 5. 已知技术栈差异（当前复刻 vs 原版）

> 本节经二次补证（对 renderer 主 chunk `host-*.js`、`local-src-*.js` 做关键词统计）后更新，状态管理、数学渲染、高亮库三项已从「未知/推断」提升为「事实」。

| 维度 | 原版（事实） | 本复刻（当前代码） | 差距等级 |
|---|---|---|---|
| 包名 | `@genie/workbuddy-desktop` | `workbuddy-clone` | P1 |
| 版本 | 5.9.3 | 0.1.0 | 可接受 |
| 入口 | `main/index.js`（单文件 310KB，rolldown） | `src/main/index.ts`（源文件） | 可接受 |
| 状态管理 | **zustand**（chunk 命中 1 次，事实） | 手写 `useApp` hook | P1（需对齐） |
| 数据层 | `node:sqlite` + database-factory | `node:sqlite` DatabaseSync | ✅ 已对齐核心 |
| 凭据保护 | safeStorage（credential-protection） | safeStorage（store.ts） | ✅ 已对齐核心 |
| LLM 调用 | 未确认主进程形态 | 主进程 fetch + SSE | P1（待确认） |
| Markdown | react-markdown + remark-gfm + **remark-math + KaTeX**（chunk 命中，事实） | react-markdown + remark-gfm + remark-math + rehype-katex | ✅ 已对齐核心 |
| 代码高亮 | **shiki**（697 个语言/主题懒加载 chunk，事实） | 无（原生 pre/code） | **P1（缺，需补）** |
| 图表渲染 | **mermaid**（flowchart/sequence/class/gantt/state，事实） | 无 | **P2（缺）** |
| 代码编辑器 | **monaco-editor**（codeEditor chunk，71 次命中，事实） | 依赖已装但未接入 | **P2（缺）** |
| i18n | **自研**（无 i18next；15 语言细粒度 chunk：zh/en/es/th/ja/ko/fr/de/ru/pt/id/vi + locale emoji） | 自研轻量 i18n（zh-CN + en） | ✅ 已对齐核心（方式一致，语言数待扩展） |
| 主题 | **useTheme / appearance / theme** 三 chunk（支持跟随系统） | 支持 light/dark/system | ✅ 已对齐 |
| 终端 | node-pty | 无 | P1（缺） |
| IM 渠道 | 飞书/钉钉/企微/IM | 无 | P1（缺） |
| 遥测 | aegis + galileo | 无 | P2 |

### 5.1 补证明细（**二次修订**，证据来源：asar 反解 + renderer chunk 文件名全集）

> ⚠️ 修订说明：首次补证仅对 3 个主 chunk 做关键词 grep，得出「原版无独立高亮库」的结论，**该结论已被推翻**。二次补证改为枚举 renderer assets 全部 chunk 文件名，发现原版把 shiki 的语言/主题做成了 **697 个独立 chunk**（按需懒加载），因此库名字面量在少数主 chunk 中不可见，属首轮方法缺陷（以偏概全）。

- `react-markdown` + `remark-math` + `katex` 命中 → 原版数学渲染 = **remark-math + KaTeX**（成立）。
- `zustand` 命中 → 原版状态管理 = **zustand**（成立）。
- **语法高亮 = shiki（事实）**：`renderer/assets/codeEditor-*.js`（742 KB）内 `createHighlighter` ×2、`codeToHast` ×12、`@shikijs` ×1；语言 chunk 覆盖 33+ 语言（`python`/`java`/`go`/`rust`/`cpp`/`sql`/`shellscript`/`typescript`/`graphql`/`dockerfile`/`toml`/…），主题 chunk 覆盖 19+ 主题（`catppuccin`/`ayu`/`clarity`/`dracula`/`material`/`nord`/`solarized`/`vitesse`/`snazzy`/`slack`/`one`/`dark`/`light`）。语言 chunk 单文件约 4.4 KB，符合 shiki `bundledLanguages` 的细粒度懒加载形态。
- **图表渲染 = mermaid（事实）**：`mermaid.core-*.js` 内 `flowchart` ×12、`stateDiagram` ×8、`classDiagram` ×8、`gantt` ×6、`sequenceDiagram` ×3、`mermaidAPI` ×1。
- **代码编辑器 = monaco-editor（事实）**：`codeEditor-*.js` 内 `monaco` 命中 **71 次**，另有 `monaco-init-*.js`、`monaco.contribution-*.js` 独立 chunk；`codeEditor-*.css` 为其样式。

### 5.2 第三次补证：i18n 词典 = 原版 UI 能力的权威清单（**方法升级**）

> ⚠️ 方法说明：前两轮靠 **chunk 文件名** 推断能力，粒度粗、易漏。本轮改为**解码原版中文词典** `renderer/assets/zh-cn-*.js`（1.1 MB，`\uXXXX` 转义），提取出 **12,049 条用户可见文案**，按 key 命名空间聚类——这等价于原版的**功能说明书**，可直接判定「原版有哪些用户可见能力」。

- 提取脚本：解码 `\uXXXX` → 正则 `"key"：`value`` → 按 `split('.')[0]` 统计命名空间。
- 命名空间 TOP（条数）：`settings`=1897、`collab`=1487、`automation`=846、`home`=676、`colleagues`=573、`skills`=513、`tencentLexiang`=360、`myFiles`=331、`conversation`=314、`office`=301、`securityCenter`=258、`progress`=195、`discover`=182、`input`=124、`msgCenter`=77、`preview`=36、`shareTask`=37 …
- **核心对话链路的权威事实（本轮据此产出 GAP-022~025）：**
  - **三工作模式（事实）**：`input.wbAdd.mode.label.plan`=`计划`、`input.wbAdd.mode.label.ask`=`仅问答`、`input.wbAdd.mode.description.craft`=`当前为默认模式，可高效执行并完成任务`；tooltip：plan=「开启后，WorkBuddy 会先规划任务，等你确认后再执行」。
  - **权限等级（事实）**：`input.wbAdd.permission.fullAccess`=`允许完全访问`；`input.wbAdd.permission.description.default`=「所有操作都会在安全沙箱约束内进行，超出范围会请求你的允许」；完全访问确认弹窗含三项能力说明（文件操作 / 终端命令 / 访问互联网）。
  - **对话内搜索（事实）**：`chat.search.*` 完整命名空间——`tooltip`=对话内搜索、`placeholder`=搜索对话内容、`noMatch`=未找到匹配内容、`previous`(Shift+Enter) / `next`(Enter) / `close`(Esc)。
  - **发送/换行快捷键可配置（事实）**：`chat.input.sendShortcutTooltip`=「{sendShortcut} 发送，{newlineShortcut} 换行」→ 原版快捷键是**用户可配置项**，非硬编码。
  - **输入入队（事实）**：`chat.input.insertQueueShortcutTooltip`=「{sendShortcut} 发送，{insertQueueShortcut} 插入队列」→ 流式中可把新输入**插入队列**而非禁用。
  - **处理阶段可视化（事实）**：`progress.phase.*` 含 60+ 阶段文案（`准备中`/`等待模型响应`/`生成回复中`/`正在准备读取文件`/`正在准备执行命令`/`压缩上下文中` …）→ 对话流有**分阶段进度条**，非只有「思考中」。
  - **清空上下文（事实）**：`chat.clearSession.toast`=`已清空上下文，开启新对话`、`idleTimeoutToast`（新开会话时间阈值省积分）。
  - **消息级操作（事实，已对齐）**：`chat.retryMessage`=`请继续完成未完成的任务。`
  - **文档选区（事实，超范围）**：`chat.documentSelection.*`（本地文档/腾讯文档/幻灯片/表格选区）、`chat.pendingEditConfirm.*`（待确认修改想法）——属 Office 场景长尾。
  - **模型可用性护栏（事实）**：`chat.modelUnavailableSwitchModel`、`chat.imageNotSupported`、`chat.gifNotSupported`（提示切 kimi/minimax）。

## 6. 本基线文件的边界与限制

- 本基线基于**静态产物清单 + 少量入口源码**，未完整反编译 300+ 模块。
- `handler-registry.js` / `index.js` 的 IPC 通道名经 grep 未直接命中 `wb:` 字面量，推断其以拼接/常量形式存在，**IPC 完整契约 = 未知**，需运行时观测补齐。
- 后续监督若需更细 IPC 契约，需用 REA 运行时观测（`list_electron_targets`）对原版进行探针。

## 7. 复刻范围共识（推断，待用户确认）

原版是庞大的多进程 + 多渠道 + 多面板产品，一次性 100% 复刻不现实。监督角色的合理目标是**按阶段对齐核心链路**，建议优先级：

**已完成（截至本轮）**
1. ✅ P0：对话核心链路（会话 → LLM 流式 → Markdown 渲染）
2. ✅ P1：数据层与凭据保护（node:sqlite + safeStorage）
3. ✅ P1：状态管理（zustand）与 IPC 契约形态（`wb:` 命名空间）
4. ✅ P1：内置终端（node-pty + xterm）
5. ✅ P2：KaTeX 数学渲染（remark-math + rehype-katex）
6. ✅ P2：多面板设置结构（账户与连接 / 模型）

**本轮推进**
7. ✅ P1：语法高亮（shiki）—— 见 GAP-009 修正
8. ✅ P2：图表渲染（mermaid）—— 见 GAP-010

**待决策（架构级长尾，需范围共识）**
9. ⏳ P2：monaco 代码变更审阅器（diff/edit/apply）—— 原版 codeEditor chunk 的核心业务是「AI 代码改动审阅」，需在复刻引入 Artifact/代码编辑场景后才成立
10. ⏳ P1：IM 渠道（飞书/钉钉/企微）
11. ⏳ P2：遥测 / 自更新 / 守护进程

> 长尾项建议：先不追求 100% 一致，而是按「核心链路 → 能力外延」逐层推进。每轮由监督角色产出新 GAP，开发角色修复后复检，直至本阶段范围内 0 open。
