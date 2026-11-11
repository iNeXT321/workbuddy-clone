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
| 状态管理 | **zustand**（chunk 命中 1 次，事实） | **zustand 5.x**（`useApp` / `useToast` / `useScheduleEvents` 等 3+ store） | ✅ **已对齐**（第十一轮前已替换，见 §5.6 修订） |
| 数据层 | `node:sqlite` + database-factory | `node:sqlite` DatabaseSync（WAL） | ✅ 已对齐核心 |
| 凭据保护 | safeStorage（credential-protection） | safeStorage（store.ts） | ✅ 已对齐核心 |
| LLM 调用 | 未确认主进程形态 | 主进程 fetch + SSE（`streamChat`） | P1（待确认） |
| Markdown | react-markdown + remark-gfm + **remark-math + KaTeX**（chunk 命中，事实） | react-markdown + remark-gfm + remark-math + rehype-katex | ✅ 已对齐核心 |
| 代码高亮 | **shiki**（697 个语言/主题懒加载 chunk，事实） | **shiki 4.x**（2 文件接入） | ✅ **已对齐**（见 §5.1 修订） |
| 图表渲染 | **mermaid**（flowchart/sequence/class/gantt/state，事实） | **mermaid 12.x**（2 文件接入） | ✅ **已对齐**（见 §5.1 修订） |
| 代码编辑器 | **monaco-editor**（codeEditor chunk，71 次命中，事实） | 依赖已装但未接入（缺「AI 代码改动审阅」业务场景） | P2（缺，见 GAP-011） |
| i18n | **自研**（无 i18next；15 语言细粒度 chunk：zh/en/es/th/ja/ko/fr/de/ru/pt/id/vi + locale emoji） | 自研轻量 i18n（zh-CN + en；`zh-cn` 为权威源，en 语义补齐） | ✅ 已对齐核心（方式一致，语言数待扩展） |
| 主题 | **useTheme / appearance / theme** 三 chunk（支持跟随系统） | 支持 light/dark/system | ✅ 已对齐 |
| 终端 | node-pty | **@lydell/node-pty + @xterm/xterm**（2/1 文件） | ✅ **已对齐**（见 §5.5） |
| 日程 / 日历 | `home.schedule.*`（676 条） | 本轮复刻（模型 + 存储 + IPC + 面板 + 设置） | ✅ **本轮已对齐核心**（见 §5.8） |
| IM 渠道 | 飞书/钉钉/企微/IM | 无 | P1（缺，见 GAP-007） |
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

### 5.3 第四次补证：输入区能力层 + 停止原因 + 阶段进度（第七轮监督依据）

> 方法延续 §5.2：继续以 i18n 词典（12,049 条）为权威能力清单，本轮聚焦 `input.wbAdd.*`（124 条）、`error.stopReason.*`、`progress.phase.*`（195 条）、`errorBanner.*`（43 条）。

**A. 输入区「+ 更多操作」面板（事实）—— `input.wbAdd.*`**

- `input.wbAdd.title`=`更多操作`、`input.wbAdd.tooltip`=`可添加文件、专家、技能、连接器`、`input.wbAdd.addFiles`=`添加文件`。
- 面板含**七大分组**（每项均有独立空态/搜索/置顶文案）：
  1. **应用** `application`（分组 `group.currentTask`=本任务 / `group.workspace`=本工作区其他任务；状态 `never`=未发布 / `published`=已发布 / `unpublished`=已下线）
  2. **专家** `experts`（`empty`=暂无可用专家、`pin`/`unpin`、`summonMore`=召唤更多专家、`searching`=搜索中…）
  3. **技能** `skills`（`addLocal`=从本地添加技能、`manage`=管理技能、`marketSectionTitle`=推荐、`personalTag`=个人 / `teamTag`=团队、`installSuccess`=「{name}」安装成功）
  4. **连接器** `connectors`（`connectTip`=连接、`connecting`=正在连接、`personalTag`/`teamTag`、错误态 `errorAuthExpired`=授权已过期 / `errorReauthorize`=重新授权 / `errorUpgradeRequired`=需升级版本 / `errorContactAdmin`=当前不可用、`summonMore`=管理连接器）
  5. **技能插件** `geniePlugins`（`official`=官方 / `custom`=自建、`upload`=上传插件、错误 `yamlParse`=YAML 解析失败 / `missingSkillFile`=压缩包中缺少 skill.md / `interopTip`=应用技能暂时与 WorkBuddy 通用技能不互通）
  6. **引用对话中的文件** `referenceFiles`（`empty`=当前对话中暂无文件）
  7. **模式** `mode`（三工作模式，已在 §5.2 / GAP-022 对齐）+ **权限** `permission`
- `input.wbAdd.submenu.placeholder`=`功能开发中…`（原版存在未完成子菜单，说明面板是**渐进式**的）。

**B. 完全访问权限（事实）—— `input.wbAdd.permission.*`**

- `fullAccess`=`允许完全访问`、`tooltip.fullAccess`=「开启后，WorkBuddy 可直接执行更多操作，如安装依赖、联网拉包、打开浏览器或本机应用等」。
- `description.default`=「当前为默认权限，所有操作都会在安全沙箱约束内进行，超出范围会请求你的允许」；`description.fullAccess`=「当前客户端内所有任务已开启完全访问权限，请注意数据安全，仅建议执行可信任的任务」。
- **确认弹窗**：`confirm.title`=`确认允许完全访问？`、`confirm.desc`=「开启完全访问后，所有任务将减少确认步骤并直接操作您的电脑，请谨慎操作。包括以下内容：」+ 三项能力：
  - `capability.files`=文件操作 → 「读取、创建、修改、上传或删除此计算机上任意位置的文件」
  - `capability.internet`=访问互联网 → 「访问网站、发送数据并使用已启用的连接器」
  - `capability.terminal`=终端命令 → 「运行命令、安装软件和更改系统设置」
- `confirm.checkbox`=`我已了解风险，并对自己的数据安全负责`（**必须勾选**才能确认）、`confirm.ok`=`允许完全访问`、`confirm.cancel`=`取消`。

**C. 输入区 chips 与提示（事实）**

- `input.modeChip.clear`=`退出{mode}模式`、`input.expertChip.clear`=`取消选中专家 {name}`、`input.connectorChip.empty`=`暂无已连接的应用`、`input.connectorChip.popoverLabel`=`已连接的应用`、`input.connectorChip.toggle`=`关闭 {name}`。
- `input.externalModelWarning`=`使用外部模型，注意数据安全`（**外部模型安全提示条**）。
- `input.wbStatusChips.*`：`designStyle.label`=设计风格、`imageMode.label`=补图方式（`ai.label`=AI 生图 / `placeholder.label`=色块占位、`header`=「你提供的图片素材不足时，WorkBuddy 如何处理？」、`lockedByPoster`=视觉海报默认使用 AI 生图）。

**D. 输入占位与快捷键（事实）**

- `chat.input.placeholder`=`输入消息...`；`chat.input.placeholder.workbuddy`=「今天帮你做些什么？**@ 添加上下文，/调用技能与指令**」；`chat.input.placeholder.quickQa`=「快速问答模式不消耗积分，可解答简单问题但不支持复杂任务」。
- `chat.input.sendShortcutTooltip`=「{sendShortcut} 发送，{newlineShortcut} 换行」（**用户可配置**）；`chat.input.insertQueueShortcutTooltip`=「{sendShortcut} 发送，{insertQueueShortcut} 插入队列」。
- **`/` 调用技能与指令（事实）**：占位文案明确「/调用技能与指令」→ 输入 `/` 唤起**技能与指令面板**；`progress.phase.*.SlashCommand`=`正在准备执行命令`。
- `chat.send.licenseUnavailableTooltip`=企业 License 已过期；`chat.sessionBusyRetryLater`=「当前回复还没结束，请稍后再发送」。

**E. 停止原因分类（事实）—— `error.stopReason.*`**

- `authError`=「身份验证失败或权限不足，请重新登录后再试」、`generic`=「请求未能完成，请重试」、`maxTokens`=「响应因达到最大 token 限制而被截断。您可以继续对话或要求更简洁的回复」、`maxTurnRequests`=「已超过单轮对话允许的最大模型请求次数」、`modelService`=「模型服务返回异常，请重试或稍后再试」、`network`=「网络连接异常或服务暂时不可用，请稍后重试」、`refusal`=「Agent 拒绝继续执行。这可能是由于内容策略限制或其他限制」、`unknown`=「请求以意外状态完成：{stopReason}」。
- `error.rateLimitCap.continuePrompt`=`请继续完成未完成的任务。`（与 `chat.retryMessage` 同义 → 触顶后可**一键续跑**）。

**F. 阶段进度（事实）—— `progress.phase.*`（195 条）**

- **阶段主状态**：`preparing`=准备中、`model_requesting`=等待模型响应、`model_streaming`=生成回复中、`model_done`=处理结果中、`tool_executing`=调用工具中、`waiting_for_permission`=等待授权、`waiting_for_user`=等待回复、`retrying`=重试中、`compacting`=压缩上下文中、`finalization_file_projection_sync_notify`=正在同步文件，请勿中断以免丢失数据（含 `.commit` 正在创建文件快照 / `.sync` 正在同步文件，均带「进度」）。
- **工具三态文案（事实）**：每个工具都有 `model_streaming.{Tool}`（正在准备 X）、`tool_executing.{Tool}`（正在 X）、`waiting_for_permission.{Tool}`（等待 X 授权）三态。工具覆盖面极广：`Read`/`Write`/`Edit`/`MultiEdit`/`Glob`/`Grep`/`Bash`/`PowerShell`/`LS`/`LSP`/`WebFetch`/`WebSearch`/`ImageGen`/`ImageEdit`/`Task*`(Create/Get/List/Output/Stop/Update)/`Team*`(Create/Delete)/`Skill`/`SkillManage`/`SlashCommand`/`Agent`/`ComputerUse`/`Notebook*`/`Memory*`/`Cron*`/`EnterWorktree`/`LeaveWorktree`/`StructuredOutput`/`TodoWrite`/`ToolSearch`/`WeChatReply`/`WeComReply`/`AskUserQuestion` 等 50+；另有 ardot 设计工具族（`ardot_create_design` 等 19 个）与长尾（`show_widget`=正在渲染组件、`preview_url`=正在预览网页、`conversation_search`=正在搜索历史对话、`connect_cloud_service`=正在连接云服务、`deliver_attachments`=正在交付文件、`open_result_view`=正在打开结果视图）。
- **`waiting_for_user` 特殊态**：`AskUserQuestion`=等待用户回复、`Bash`/`PowerShell`=等待命令输入。
- **附加错误横幅动作（事实）—— `errorBanner.action.*`（15 项）**：`retry`=重试、`copyError`=复制错误、`editInput`=重新输入、`checkNetwork`=检查网络、`configureModel`=配置模型、`switchModel`=切换模型、`purchase`=立即购买、`applyQuota`=申请额度、`relogin`=重新登录、`newTask`=新建任务、`reupload`=重新上传、`upgradeClient`=升级客户端、`viewDocs`=查看文档、`feedback`=提交反馈、`acknowledge`=已知晓、`close`=关闭。
- **错误码体系（事实）—— `errorCode.*`（254 条）**：原版有独立错误码命名空间，`error.code`=`错误码：`、`error.time`=`时间：`、`error.messageId`=`消息 ID：`、`error.original`=`原始错误：`（错误详情面板可展开完整上下文）。

### 5.4 第五次补证：工具链路闭环 + 会话生命周期（第八轮监督依据）

**G. 工具调用闭环（事实）—— `tool.approval.*` / `tool.askUserQuestion.*`**

- **关键结构判断（事实）**：原版是 **agent 形态**，而非一次性问答。`progress.phase.*` 里 `tool_executing` / `waiting_for_permission` / `waiting_for_user` 三个阶段 + 50+ 工具的三态文案（`model_streaming.{Tool}` / `tool_executing.{Tool}` / `waiting_for_permission.{Tool}`）共同证明：模型经 function calling 请求工具 → 主进程审批 → 执行 → 结果回灌 → 继续下一轮。**这是 `tool.approval.*` 与 `tool.askUserQuestion.*` 两大能力域的唯一挂载点**。
- **审批弹窗（事实）—— `tool.approval.*`**：
  - `confirmTitle.imageGen`=`确认开始生成图片？`、`confirmTitle.videoGen`=`确认开始生成视频？`、`confirmTitle.computerUse`=`确认开始使用电脑操控能力？`、`confirmTitle.audioTranscribe`=`确认开始音频文件转文字？`、`confirmTitle.imageProcessing`=`确认开始处理图片？`
  - `riskTag.imageGen`=`产生积分消耗`、`riskTag.videoGen`=`积分消耗较高`、`riskTag.imageProcessing`=`预计产生积分消耗`
  - `creditHint.imageGen`=`当前模型生成图片将消耗额外积分，每张图片约 5-10积分，请谨慎操作`、`creditHint.videoGen`=`生成视频将消耗额外积分，每 5 秒约 50-100 积分，请谨慎操作`、`creditHint.audioTranscribe`=`当前模型音频文件转文本将消耗额外积分，约 0.6 积分/分钟…实际费用以最终识别的音频时长结算`
  - **四动作**：`allow`=允许、`alwaysAllowSession`=本次会话始终允许、`alwaysAllowLaunch`=本次启动内始终允许、`reject`=拒绝（含 `decisionApproved`=已确认 / `decisionRejected`=已拒绝 回执态）。
- **向用户提问（事实）—— `tool.askUserQuestion.*`**：`title`=向用户提问、`waiting`=等待您的回答...、`skipped`=您跳过了此问题。对应 `progress.phase.waiting_for_user.AskUserQuestion`=等待用户回复；提问支持可选项（单选/多选）与自由输入两种形态（选项结构含 `label` + `description`）。
- **工具覆盖面（事实）**：`Read`/`Write`/`Edit`/`MultiEdit`/`Glob`/`Grep`/`Bash`/`PowerShell`/`LS`/`LSP`/`WebFetch`/`WebSearch`/`ImageGen`/`ImageEdit`/`ComputerUse`/`Notebook*`/`Skill`/`SlashCommand`/`Agent`/`Task*`/`Team*`/`Memory*`/`Cron*`/`TodoWrite`/`ToolSearch`/`AskUserQuestion` 等（详见 §5.3 §F 工具三态清单）。

**H. 会话生命周期与时间展示（事实）—— `conversation.*` 补充 + `common.*`**

- **会话上限（事实）—— `conversation.maxSessions.dialog.*`**：达上限时阻断新建，文案「您已达到最大会话数量限制，请先归档或删除一些会话后再创建新会话。」→ 会话数量有硬上限，且上限状态需在侧栏或新建入口体现。
- **相对时间（事实）—— `conversation.time.*`**：`justNow`=刚刚、`minutesAgo`={count}分钟前、`hoursAgo`={count}小时前、`yesterday`=昨天、`daysAgo`={count}天前、`yearsAgo`={count}年前 → 会话列表项展示**相对时间**而非绝对时间戳。
- **空态分文案（事实）**：`conversation.empty.title`=暂无任务 + `conversation.empty.description`=点击上方按钮开始新任务（标题/描述两层，与「搜索无结果」态分开）。
- **容错文案（事实）**：`conversation.cwdNotExist`=该对话的工作目录可能已被重命名或删除、`conversation.jumpNotFound`=对话记录未找到。
- **免责声明（事实）—— `common.aiDisclaimer`**=`内容由 AI 生成，请核实重要信息`；`common.loading`=加载中...、`common.initializing`=正在初始化...
- **错误详情面板（事实）**：`error.code`=错误码：、`error.time`=时间：、`error.messageId`=消息 ID：、`error.original`=原始错误：→ 错误卡片应展示**结构化错误码**（`errorCode.*` 的标题 + `desc`）而非仅分类文案。

### 5.5 第六次补证：消息流健壮性 + 工作空间 + 模型能力（第九轮监督依据）

**I. 消息流健壮性（事实）—— `chat.*` 补充**

- **发送竞态（事实）—— `chat.sessionBusyRetryLater`**=`当前回复还没结束，请稍后再发送` → 同一会话**不允许多路并发发送**，主进程必须显式拒绝并回执，而非排队或覆盖。
- **停止失败（事实）—— `chat.cancelFailedRetry`**=`停止任务失败，请稍后重试。` → `chatAbort` 是**可失败操作**，需返回结果结构供渲染层给出重试提示（此前实现固定返回 `true`，是缺口）。
- **提问回执失败分因（事实）—— `chat.answerQuestion*` 三态**：
  - `answerQuestionFailed`=`发送回答失败`（一般失败）
  - `answerQuestionSessionMismatch`=`会话已切换，请重新操作`（挂起提问属于另一个会话）
  - `answerQuestionNotFound`=`问卷已过期或已被处理，请等待新的问卷`（该会话当前无挂起提问）
  → 回执接口必须区分**「无挂起」与「挂起不匹配」**两种失败，禁止用单一 `false` 糊合。
- **模型能力门控（事实）—— 三条互不重叠的提示**：
  - `chat.imageNotSupported`=`当前模型暂不支持图片，请切换模型后重试`
  - `chat.gifNotSupported`=`当前模型不支持 GIF，请切换至 kimi 或 minimax 模型后重试` → 文案**点名 kimi / minimax**，说明这是「建议动作」而非泛化提示，实现侧的建议模型必须与文案一致。
  - `chat.modelUnavailableSwitchModel`=`当前模型不可用，请切换模型`
  → 附件与模型能力必须**在发送前校验**，不满足时明确提示而非静默失败。
- **输入占位分态（事实）—— `chat.input.placeholder.*`**：`workbuddy`=`今天帮你做些什么？@ 添加上下文，/调用技能与指令`；`quickQa`=`快速问答模式不消耗积分，可解答简单问题但不支持复杂任务` → 占位文案随**工作模式**变化（ask 模式走 quickQa）。
- **快捷键提示（事实）**：`sendShortcutTooltip`=`{sendShortcut} 发送，{newlineShortcut} 换行`、`insertQueueShortcutTooltip`=`{sendShortcut} 发送，{insertQueueShortcut} 插入队列`、另有 `sendOnly` / `newlineOnly` / `fallback` 三个降级变体 → 提示文案按当前绑定组合**动态拼装**，单键绑定时降级。
- **文档选区（事实）—— `chat.documentSelection.*`**：按类型分 `documentLabel`=文档选区 / `spreadsheetLabel`=表格选区 / `presentationLabel`=幻灯片选区；按来源分 `localDocument`=本地文档 / `onlineDocument`=腾讯文档；`dismiss`=忽略此选区 → 输入区可挂载**来自办公文档的选区上下文**，需以 chip 呈现并可单独移除。
- **切换文件确认（事实）—— `chat.docTabSwitch.dialog.*`**：`title`=确认切换文件、`content`=`对话框有文档选区。如果切换查看新文件，当前选区将被清空。是否确认切换？` → 存在选区时切换会话/文件需**二次确认**。
- **上下文档位（事实）—— `chat.sessionSeparator.*`**：`settingsTooltip`=`点击可跳转至{name}设置页`、`settingsLink`=`⚙ 设置` → 会话内存在**上下文边界分隔**，分隔行可跳转设置页。
- **上下文节流提示（事实）—— `chat.clearSession.*`**：`toast`=已清空上下文，开启新对话、`settings`=设置、`idleTimeoutToast`=`💡 可以通过设置新开会话的时间阈值来节省积分消耗，并提升响应速度` → 「开新会话」有**时间阈值**概念，超时后提示节约积分。
- **搜索与编辑态（事实）**：`chat.search.*` 五条（placeholder/previous/next/close/noMatch）、`chat.loadingTips.dismiss`=不再显示、`chat.pendingEditConfirm.ideaCount`=`{count}个修改想法` + `send`=发送、`chat.send.licenseUnavailableTooltip`=企业 License 已过期或欠费，请联系管理员续费。

**J. 工作空间（事实）—— `taskStarter.*`（33 条）**

- **入口与标签（事实）**：`startIn`=`任务启动于：`、`selectWorkspace`/`selectFolder`=`选择工作空间`、`startFromEmpty`=新建工作空间、`openNewDirectory`=打开本地文件夹、`noWorkspace`=不使用工作空间 → 任务有**显式的工作空间归属**，且允许「不使用」。
- **创建语义（事实）**：`createWorkspaceDesc`=`为工作空间命名，本地将自动创建同名文件夹，命名后不可随意更改` + `createWorkspacePlaceholder`=输入工作空间名称 + `createWorkspace.toast.failed`=新建工作空间失败，请重试 → 创建是**真实 mkdir**，且名称不可随意更改。
- **校验与空态（事实）**：`workspaceNotExist`=所选工作空间不存在，请重新选择、`noWorkspaceFound`=未找到工作空间、`noData`=暂无数据 → 选择前需校验目录存在性。
- **存储路径提示（事实）**：`workspacePathHint.ariaLabel`=查看默认工作空间存储路径设置、`prefix`=可前往、`settingsLink`=「系统设置」、`suffix`=设置默认工作空间存储路径 → 默认存储路径是**系统设置项**。
- **代码库工作空间（事实，超出本轮范围）**：`addRepo`/`selectRepo`/`searchRepo`/`noRepos`/`loadingRepos`/`addConnectorAuth`/`githubAddRepoAuth`/`githubNoRepos`/`noConnectorHint`/`switchPlatform`/`selectBranch`/`loadingBranches`/`noBranches`/`searchBranch` → 工作空间可来源于 Git 仓库，属独立能力域，本轮不实现。
- **其他（事实）**：`clawWorkspaceDisabled`=Claw 工作空间不支持选择、`selectDirectory`=选择目录。

**K. 模型（事实）—— `model.*`（26 条）**

- **模型族（事实）**：`claudeSonnet4`=Claude Sonnet 4（`description`=平衡性能与成本的选择）、`claude35Sonnet`=Claude 3.5 Sonnet（`description`=快速响应，适合日常任务）、`gpt4o`=GPT-4o（`description`=OpenAI 多模态模型）、`defaultGLM47`=`GLM-4.7 大模型，能力均衡，适合日常使用`、`defaultGLM46`=`具有强大推理能力的先进语言模型` → 模型描述文案是**能力声明**，是「模型能力门控」的权威依据。
- **分组（事实）**：`builtIn`=内置模型、`custom`=自定义模型、`enterprise`=企业模型、`group.internal`=内部模型、`group.external`=外部模型、`chinaMobile.groupLabel`=中国移动模型。
- **切换语义（事实）**：`switchNotice`=`模型已从 {from} 更改为 {to}`、`switchNotice.tooltip`=`在对话中途切换模型会使上下文缓存失效，积分消耗增加，背景信息可能会自动压缩，降低性能表现` → 会话中途切模型有**明确代价提示**。
- **风险提示（事实）**：`relayRisk.warning`=`你正在使用非官方渠道的模型服务，可能存在数据外泄、积分消耗异常的风险，请确认来源可信后再使用。`
- **档位（事实）**：`system.auto`=自动、`system.balanced`=均衡、`system.fast`=快速、`system.primary`=优选、`system.ultimate`=极致、`tier.upgrade`=去升级、`promotion.useNow`=去使用、`chinaMobile.trailing.checkUsage`=查询用量、`chinaMobile.trailing.recharge`=充值。

**L. 闲置能力提示（事实）—— `idleCapability.*`（35 条）**

- **触发语义（事实）**：`title`=`{count} 项技能、插件或 MCP 已至少 {days} 天未使用，建议检查后关闭。` → 存在**闲置检测 + 建议关闭**的治理卡片。
- **上下文成本说明（事实）**：`subtitle`=`已启用的技能、插件和 MCP 会向模型提供说明并占用上下文。关闭近期不用的项目可减少上下文占用，随时可在对应管理页重新开启。`
- **批量操作（事实）**：`disableAll`=一键关闭、`disable`=关闭、`disabling`=正在关闭…、`disabledToast`=`已关闭 {count} 项技能、插件或 MCP，可随时在对应管理页重新开启。`、`selectAll`/`deselectAll`、`selectedCount`=`已选中 {count} 个`、`neverRemind`=不再提醒。
- **列表列与时间（事实）**：`columnTypeAndName`=类型和名称、`columnLastUsed`=上次使用时间、`lastUsed`=`上次使用：{date}`、`neverUsed`=从未使用、`relative.today`=今天 / `daysAgo` / `monthsAgo` / `yearsAgo`。
- **类型标签（事实）**：`typeLabel.skill`=Skill、`typeLabel.connector`=Connect、`typeLabel.mcp`=MCP、`typeLabel.subagent`=Agent、`typeLabel.mixed`=能力。
- **其他（事实）**：`viewDetail`=查看详情、`collapseDetail`=收起详情、`manageLink`=管理页、`ariaLabel`=闲置技能、插件和 MCP 提示卡片、`closeAriaLabel`=关闭。

### 5.6 第七次补证：会话组织 / 状态角标 / 任务搜索 / 来源（第十轮监督依据）

证据来源：i18n 词典 `conversation.*` 命名空间（314 条，本轮聚焦其中的组织与可发现性子域）。

**M. 侧栏分组与工具栏（事实）—— `conversation.section.*`（13 条）**

- **分组名（事实）**：`tasks`=`任务`、`workspaces`=`工作空间`、`taskGroup`=`任务`、`spaceGroup`=`空间`、`groups`=`空间`、`colleagueConversations`=`助理任务` → 侧栏存在**按工作空间分组的列表**，且「未归属」另有独立分组（任务）。
- **工具栏（事实）**：`collapseAll`=`折叠所有工作空间`、`expandAll`=`展开所有工作空间`、`addWorkspace`=`新建工作空间`、`addTask`=`新建任务`、`pinned`=`置顶`。
- **筛选（事实）**：`filter`=`筛选`、`noFilterResult`=`没有匹配的任务` → 存在**按状态筛选**与筛选空态。

**N. 四态状态角标（事实）—— `conversation.sectionFlag.*`（5 条）**

- **四态（事实）**：`tooltip.failed`=`有任务失败，点击打开`、`tooltip.pending`=`有任务待确认，点击打开`、`tooltip.unread`=`有任务未读，点击打开`、`tooltip.working`=`有任务进行中，点击打开` —— 四条语义互不重叠，说明是**四个独立状态**而非单一布尔；「点击打开」说明角标是**可点击的快捷入口**。
- **空态（事实）**：`sectionFlag.empty`=`该分类下暂无状态任务`。

**O. 全局任务搜索（事实）—— `conversation.search.*`（7 条）**

- **文案（事实）**：`placeholder`=`搜索任务`、`recentTasks`=`最近任务`、`resultCount`=`搜索到 {count} 个任务`、`shortcut.navigate`=`上下切换`、`shortcut.open`=`打开`、`shortcut.close`=`关闭`。
- **与对话内搜索的区别（事实）**：`settings.keyboardShortcuts.actions.openSearch`=`全局搜索`，与 `searchInConversation`=`对话内搜索` 并列 → 是**两个独立入口**（前者为覆盖层，后者为消息内查找）。

**P. 任务来源端（事实）—— `conversation.origin.*`（3 条）**

- **三来源（事实）**：`web`=`网页端`、`workbuddyApp`=`移动端`、`workbuddyMp`=`小程序` → 会话可跨端产生，列表需标注来源。

**Q. 运行中关窗确认（事实）—— `conversation.windowTaskRunning.*`（4 条）**

- **二选一（事实）**：`title`=`任务运行中`、`message`=`关闭窗口后任务将继续在后台运行，可随时返回查看进度。请选择操作方式。`、`closeOnly`=`仅关闭窗口`、`cancelTask`=`中止任务并关闭` → 关窗前存在**强制二次确认**，且「仅关闭窗口」承诺**任务转为后台继续运行**（不是中止）。

**R. 创建中态（事实）—— `conversation.creating*`（7 条）**

- **文案（事实）**：`creatingTask`=`新建任务中`、`creating.title`=`正在准备执行`、`creating.description`=`Agent 正在接手并进入工作状态。`、`creating.dialog.title`=`提示`、`creating.dialog.content`=`正在创建会话，请稍后再试`、`creating.edit.button`=`编辑器`、`creating.edit.button.workspace`=`移动到工作区`。

**S. 会话上限（事实）—— `conversation.maxSessions.dialog.*`（2 条）**

- **文案（事实）**：`title`=`会话数量已达上限`、`content`=`您已达到最大会话数量限制，请先归档或删除一些会话后再创建新会话。`

### 5.7 第八次补证：定时任务域（automation.*，第十一轮监督依据）

证据来源：i18n 词典 `automation.*` 命名空间（**846 条**，其中本地可复刻子域约 366 条）+ 英文包 `en-DtOAKogW.js` 逐键对齐。该域在复刻体中原为**完全空白**（`grep automation` 命中 0），故本轮为「从 0 建域」。

**T. 面板与双 Tab（事实）—— `automation.tab.*` / `automation.list.*` / `automation.toolbar.*`**

- **Tab（事实）**：`tab.scheduledTasks`=`定时任务`、`tab.runRecords`=`运行记录` → 面板为**双 Tab 结构**，任务定义与执行历史是两个视图。
- **面板定位（事实）**：`list.description`=`配置定时任务，Workbuddy 将按计划定时执行任务`；`list.empty`=`还没有定时任务，点击右上角「添加定时任务」创建`。
- **工具栏（事实）**：`toolbar.search`=`搜索定时任务/记录`、`toolbar.filter`=`筛选`、`toolbar.refresh`=`刷新`、`toolbar.new`=`新建`、`toolbar.batchManage`=`批量管理`、`toolbar.addAutomation`=`新建定时任务`、`toolbar.newFromConversation`=`从对话新建`、`toolbar.newFromTemplate`=`从模版新建`。

**U. 任务分组与卡片（事实）—— `automation.section.*` / `automation.card.*` / `automation.row.*`**

- **四分组（事实）**：`section.scheduled`=`已安排`、`section.inProgress`=`执行中`、`section.completed`=`已完成`、`section.archived`=`已归档`。
- **卡片动作（事实）**：`card.run`=`立即运行`、`card.pauseTask`=`暂停任务`、`card.resumeTask`=`开启任务`（注意：**恢复动作的原文是「开启任务」而非「恢复」**）、`card.openTask`=`打开任务`、`card.viewRecords`=`查看运行记录`。
- **行状态（事实，13 条）**：`row.startsIn`=`{time}执行`、`row.inProgress`=`运行中`、`row.queued`=`排队中，等待空闲后执行`、`row.peakPending`=`高峰期排队中`、`row.missedPending`=`已错过计划时间，将补跑一次`、`row.waitingLogin`=`等待登录后执行`、`row.waitingForSession`=`正在创建会话`、`row.preparing`=`准备中...`、`row.interrupted`=`上次执行中断`、`row.onceOnly`=`单次执行`、`row.expired`=`已过期，不再执行`、`row.noUpcomingRun`=`暂无后续执行`、`row.succeeded`/`row.failed`=`成功`/`失败`。

**V. 调度模型：八类频率（事实）—— `automation.schedule.*`**

- **八类（事实）**：`once`=`单次任务`、`daily`=`每天`、`workday`=`每个工作日`、`weeklyMonday`=`每周一`、`biweekly`=`双周`、`monthly`=`每月`、`yearly`=`每年`、`periodic`=`周期`（UI 文案为「按间隔」）。
- **摘要模板（事实，6 条）**：`summary.daily`=`每天 {time}`、`summary.weekly`=`每周 {days} {time}`、`summary.biweekly`=`双周 {days} {time}`、`summary.monthly`=`每月 {day} {time}`、`summary.yearly`=`每年 {month}{day} {time}`、`summary.once`=`单次 {dateTime}` —— 与实现逐字对齐（工作日/间隔无独立模板，由 `daily` 与 `intervalValue` 派生）。
- **字段标签（事实）**：`frequencyLabel`=`重复`、`timeLabel`=`时间`、`weekdaySection`=`重复星期`、`monthDaySection`=`每月日期`、`intervalLabel`=`间隔`、`intervalValue`=`每 {count} 小时`、`intervalIncrease`/`intervalDecrease`=`增加间隔`/`减少间隔`。
- **星期取值（事实）**：`schedule.day.MO`~`SU`=`周一`~`周日`（与 `datePicker.weekday.*` 7 条并存）。

**W. 校验规则（事实，8 条）—— `automation.schedule.validation.*`**

- **逐条（事实）**：`onceDateRequired`=`请选择单次执行日期`、`onceFutureRequired`=`单次执行时间必须晚于当前时间`、`onceCorrectedToNow`=`所选时间已过，已自动调整为当前时间，请确认`、`intervalHours`=`按间隔执行需至少每 1 小时`、`weekdayRequired`=`请至少选择一个星期`、`monthdayRequired`=`请至少选择一个日期`、`monthRequired`=`请选择月份`、`dateRequired`=`请选择日期`。
- **推论（强）**：`onceDateRequired` 与 `dateRequired` **并存**，说明单次日期与月内日期的空值提示是**两条独立规则**；`intervalHours` 明确**最小间隔 = 1 小时**。

**X. 创建/编辑表单（事实）—— `automation.modal.*` / `automation.form.*`**

- **表单骨架（事实）**：`modal.titleCreate`=`新建定时任务`、`modal.title`=`编辑定时任务`、`modal.name`=`名称`、`modal.namePlaceholder`=`输入任务名称`、`modal.prompt`=`提示词`、`modal.promptPlaceholder`=`添加提示词`、`modal.schedule`=`执行频率`、`modal.workspaces`=`工作区`、`modal.deleteConfirm`=`确认删除该定时任务？`。
- **执行权限（事实，两套文案并存）**：表单内 chip 用 `modal.permissionMode.default`=`需逐次确认` / `modal.permissionMode.fullAccess`=`免确认执行`；**任务卡片标签**用 `permission.default`=`默认权限` / `permission.fullAccess`=`完全访问权限（推荐）`。这是本轮运行时冒烟一次断言的直接依据 —— 两者是**不同位置的不同文案**，不可互换。
- **无人值守告知（事实）**：`modal.executionNoticeLabel`=`提示`、`modal.executionNoticeText`=`定时任务执行时，请勿关闭电脑或退出客户端，否则任务将无法正常执行`；`permission.fullAccessDesc`=`定时任务会在本地客户端无人值守执行。执行期间请勿关闭电脑或退出客户端，否则任务可能中断。`
- **表单能力边界（事实）**：`form.hint`=`定时任务仅支持「定时执行」一种触发形态`。

**Y. 运行记录与失败分因（事实）—— `automation.records.*` / `automation.runGroup.*` / `automation.error.reason.*` / `automation.detail.reason.*`**

- **列（事实）**：`records.column.name`=`任务名称`、`status`=`状态`、`time`=`运行时间`、`duration`=`耗时`、`type`=`任务类型`、`actions`=`操作`。
- **日期分组（事实）**：`runGroup.date.today`=`今天`、`yesterday`=`昨天`、`tomorrow`=`明天`、`monthDay`=`{month}月{day}日`、`fullDate`=`{year}年{month}月{day}日`。
- **运行态（事实）**：`runGroup.running`=`任务正在运行中，点击查看详情`、`runGroup.paused`=`任务已暂停`、`runGroup.nextRun`=`下一次运行 {time}`、`runGroup.viewAll`=`查看全部`、`runGroup.collapse`=`收起`、`runGroup.continueChat`=`继续对话`；`run.status.pending`=`待执行`、`run.status.timeout`=`超时`、`run.status.cancelled`=`已取消`。
- **失败分因（事实，`error.reason` 26 条 + `detail.reason` 25 条，语义分组）**：网络类 `networkUnavailable`=`网络连接异常，任务未能开始执行，请在网络恢复后重试。`；登录类 `authUnavailable`；容量类 `capacityQueueFull`/`capacityQueueUserLimit`/`capacityQueueWaitFailed`；超时类 `runTimeout`/`sessionStartTimeout`/`finalizationTimeout`/`sessionStuck`（`sessionStuck`=`任务长时间未结束，系统已自动停止本次运行。`）；会话类 `sessionStartFailed`/`sessionEnded`/`runFailedNoConversation`；环境/依赖类 `environmentNotReady`/`connectorUnavailable`/`workspaceUnavailable`；内容类 `contextLimit`/`turnLimit`/`emptyResult`；中断类 `runInterrupted`/`partialDelivered`；设备离线类 `recoveryFailed`=`原定时间设备未在线，重试仍未成功。`
- **推论（强）**：26 条分因共存说明原版有**远超「成功/失败」二元的失败归因体系**，且分因最终要映射为用户可读文案。本轮复刻实现为 `reason` 字段 + 渲染期按键取文案。

**Z. 与本轮范围外的子域（事实）**

- `automation.datasource.*`（68+35+12+12+8+6+6 ≈ 147 条，数据源/Webhook/同步模式）、`automation.modal.wecomBotSource.*`（28 条，企微 BOT 绑定）属**连接器 / 企微渠道域**，与 deferred 的 GAP-007 同源，本轮不复刻。

### 5.8 第九次补证：日程 / 日历域（home.schedule.*，第十二轮监督依据）

证据来源：i18n 词典 `home.schedule.*` 命名空间（**640 条**，`home` 命名空间 676 条中除 `home.aiDisclaimer` 外全部属此域）。该域在复刻体中原为**完全空白**，故本轮同第十一轮，为「从 0 建域」。

> ⚠️ 命名空间归属提示：`home.*` 的 640 条**全部**是 `home.schedule.*`，没有别的 `home.*` 业务子域。这意味着 `home` 命名空间即「日历域」，不存在漏项。

**T. 面板骨架与入口（事实）—— 顶层键 + `shell.*`**

- **入口（事实）**：`myCalendar`=`我的日历`、`viewAll`=`查看我的日历`、`teamCalendar`=`团队日历` → 日历是**独立全屏视图**，可从多处进入。
- **视图骨架（事实）**：`back`=`返回`、`today`=`今天 · {count} 件事`、`empty`=`今天没有安排`、`allDay`=`全天`、`miniList.title`=`当日日程`。
- **底部区块（事实）**：`shell.remindersTitle`=`事件与提醒`、`shell.changelogTitle`=`变更记录`（`changelogTag`=`可追溯`）、`shell.followupTitle`=`WorkBuddy 持续跟进`、`shell.followupPrivacy`=`按成员权限读取资料；个人日历只读取忙闲`。
- **推论（强）**：`followupPrivacy` 明确「个人日历只读取忙闲」——原版的**忙闲（free/busy）读取是权限隔离的**，复刻据此只需展示自己侧状态。

**U. 侧栏与视图（事实，136 条）—— `sidebar.*`**

- **月历（事实）**：`monthTitle`=`{year}年{month}月`、`prevMonth`=`上个月`、`nextMonth`=`下个月`、`collapse`=`收起日历`、`expand`=`展开日历`、`title`=`日期与日历`、`collapseSidebar`/`expandSidebar`=`收起边栏`/`展开边栏`。
- **三个来源分组（事实）**：`managed`=`我管理的`、`channels`=`所在频道`、`subscribed`=`我订阅的`；另有 `myScheduleGroup`=`我的日程`（全部）—— 与 `i18n` 实测一致：**`myScheduleGroup` 在 `sidebar.*` 下**，不在顶层（本项目一处误写 `home.schedule.myScheduleGroup` 已修正）。
- **叠加开关（事实）**：`overlayPersonal`=`叠加我的日程`、`overlayTeamTodos`=`叠加团队待办`、`myTodos` / `overlayMyTodos`=`叠加我的待办`；`todoGroup`=`待办`、`myTodosGroup`=`我的待办`、`onlyVisibleToMe`=`仅我可见`、`todoIncomplete`=`未加载完`、`todoTruncated`=`已截断`。
- **搜索（事实，20 条）**：`searchPlaceholder`=`搜索日程`、`searchClear`=`清除搜索`、`searchEmpty`=`未找到匹配日程`、`searching`=`正在搜索…`、`searchBuilding`=`搜索索引准备中，请稍后再试`、`searchUnavailable`=`搜索暂不可用`、`searchDisabled`=`搜索已关闭`、`searchNoCalendar`=`请先勾选要搜索的日历`、`searchRateLimited`/`searchRangeUnsupported`/`searchCursorStale`/`searchForbidden`/`searchParamInvalid`/`searchFailed`、`searchLoadMore`/`searchContinue`/`searchRetry`、`searchFreshness`=`近期变更可能未出现在搜索中`、`searchToday`=`今天`。
- **每日历操作（事实）**：`addCalendar`=`添加日历`、`createCalendar`=`新建日历`、`subscribeCalendar`=`订阅日历`、`thirdPartyCalendar`=`第三方日历`、`renameCalendar`=`重命名`、`openChannel`=`进入频道`、`changeColor`/`changeColorFor`、`deleteCalendar`=`删除`、`unsubscribeCalendar`=`取消订阅`、`untitledCalendar`=`未命名日历`、`primaryUndeletableHint`=`主日历用于接收邀请，不能删除`。
- **第三方日历：原文自认未开放（事实）**：`thirdPartyDialog.notAvailable`=`第三方日历连接暂未开放`、`providers.wecom/outlook/google/apple`、`connectForm.hint`（企微同步账号密码获取路径）、`reconnect`/`disabled`/`comingSoon`=`即将支持`；`subscribeDialog.unavailable`=`该日历已不可用`。
- **错误族（事实）**：`calendarError.nameInvalid`=`日历名称需为 1–64 个字符`、`nameConflict`=`已有同名日历，换一个名字试试`、`quotaExceeded`、`renameNotAllowed`=`频道日历的名称跟随频道，无法在这里修改`、`primaryUndeletable`=`主日历不能删除`、`notAvailable`=`当前环境暂未开放自建日历`。

**V. 日程模型与摘要（事实）—— `summary.*` / `field.*` / `kind.*` / `status.*`**

- **状态（事实，4 态）**：`summary.status.upcoming`=`待开始`、`ongoing`=`进行中`、`ended`=`已结束`、`cancelled`=`已取消`；另有 `status.confirmed`=`已确认`（`status.*` 顶层 2 条属**创建状态**）。
- **首行（事实）**：`summary.kindLine`=`日程 {status}`、`summary.kind`=`日程`；类型 `kind.meeting`=`会议`、`kind.timeBlock`=`时间安排`、`kind.automation`=`自动化`、`kind.reminder`=`提醒`。
- **时间行模板（事实，4 条，**逐字**）**：`summary.when`=`{year} 年 {month} 月 {day} 日 · {startClock}—{endClock}`、`whenCrossDay`=`{year} 年 {month} 月 {day} 日 {startClock} — {endMonth} 月 {endDay} 日 {endClock}`、`whenAllDay`=`{year} 年 {month} 月 {day} 日 · 全天`、`whenAllDaySpan`=`{year} 年 {month} 月 {day} 日 — {endMonth} 月 {endDay} 日 · 全天`。
- **推论（强，易错点）**：单日模板内是 **em dash（—）紧贴时刻**，跨日模板内是 **` — `（前后带空格）**；且「年/月/日」数字与「 年 / 月 / 日 」字之间**有空格**。二者不等价，复刻时不可统一化，否则逐字不一致。
- **提醒（事实）**：`summary.reminder`=`提醒`、`reminderNone`=`无`；档位命名只在**新建表单**的 `create.reminder.*` 出现（none/atStart/15/60/1440）→ 摘要行复用表单档位名，`none` 才用 `reminderNone`。
- **参与人（事实）**：`summary.participantCount`=`已邀请 {count} 位参与人：`（**含尾冒号**，后面紧跟名单）、`invited`=`已邀请参与人`、`onlySelf`=`仅自己参与`、`organizerBadge`=`组织者`、`self`=`我`。
- **地点/说明（事实）**：`summary.locationFallback`=`日程安排`、`notesEmpty`=`暂无日程说明`、`notesEmptyHint`=`可在编辑时补充说明与附件`、`summary.notes`=`日程说明`。
- **在线会议/会议室：原文自认未接入（事实）**：`summary.noOnlineMeeting`=`无在线会议`、`noOnlineMeetingHint`=`本日程没有在线会议`、`meetingEnded`=`会议已结束。`、`detail.joinMeeting`=`加入会议`、`detail.linkedMeeting`=`关联会议`、`detail.meeting.tencent`=`腾讯会议`、`meeting.pending`=`会议链接生成中`、`meeting.failed`=`会议创建失败，可稍后重试`、`meeting.cancelled`=`会议已取消`；`detail.meetingRoom.{PENDING,FAILED,UNKNOWN,RELEASING}`=`预订中`/`预订失败`/`状态待确认`/`释放中`。
- **字段（事实）**：`field.title/start/end/location/meetingRoom/organizer/calendar/attachment/reminder/description/timeZone/status`=`标题/开始时间/结束时间/地点/会议室/组织者/日历/附件/提醒/描述/时区/日程状态`。
- **操作（事实）**：`summary.delete`=`删除日程`、`edit`=`编辑日程`、`share`=`分享日程`、`more`=`更多`、`copyMeeting`=`复制会议信息`、`copied`=`已复制`、`shareCopied`=`日程信息已复制`、`copyFailed`=`复制失败，请重试`。

**W. 创建 / 编辑表单（事实，202 条）—— `create.*`**

- **模式（事实）**：`create.mode.form`=`表单模式`、`mode.formHint`=`与 @WorkBuddy 自然语言草稿共用全部字段`、`mode.switchToNl`=`切换到自然语言`；`create.formHint`=`表单与自然语言使用同一份日程字段。` → **表单与 NL 草稿是同一份字段**，NL 只负责填草稿。
- **自然语言（事实）**：`natural.title`=`新建日程`、`heading`=`告诉 WorkBuddy 你的日程安排`、`description`=`可以描述时间、参与人、主题和会议方式，随后在表单中检查与补充。`、`inputHelper`=`WorkBuddy 将把识别到的内容填入创建表单`、`trySay`=`试试这样说`、`example.personal`=`明天上午 10 点安排一小时方案评审`、`parseFailed`=`没能理解这段描述，请改写后再试`、`extractInternal`=`没能生成配置，请改用表单创建`、`extractUnavailable`=`生成服务暂时不可用，可以重试或直接打开表单`、`promptTooLong`=`描述最多 500 字`。
- **时区/日历/附件（事实）**：`field.timezone`=`时区`、`timezone.current`=`（当前）`、`field.calendar`=`日历`、`calendarFallback`=`当前日历`、`field.attachment`=`附件`、`addAttachment`=`添加附件`、`attachment.tooMany`=`最多添加 {count} 个附件`、`attachment.unavailable`=`当前环境还不能添加附件`。
- **提醒档位（事实，5 档）**：`create.reminder.none`=`无提醒`、`atStart`=`开始时`、`15`=`15 分钟前`、`60`=`1 小时前`、`1440`=`1 天前`。
- **重复（事实，权威前缀是 `create.recurrence.*` 而非 `repeat.*`）**：`none`=`不重复`、`daily`=`每天`、`weekly`=`每周`、`monthly`=`每月`、`weekday`=`每个工作日（周一至周五）`、`weeklyOn`=`每{weekday}`、`monthlyOn`=`每月 {day} 日`、`monthlyNth`=`每月第 {n} 个{weekday}`、`yearlyOn`=`每年 {month} 月 {day} 日`、`custom`=`自定义…`、`customTitle`=`自定义重复`、`customSummary`=`每 {interval} {unit}`、`never`=`永不截止`、`until`=`截止日期`、`unit.{daily,weekly,monthly,yearly}`=`天/周/个月/年`。
- **时长（事实）**：`create.duration.minutes`=`{count} 分钟`、`hour`=`1 小时`、`hours`=`{count} 小时`、`customEnd`=`自定义结束时间`、`switchToEnd`/`end.switchToDuration`=`切换到结束时间`/`切换到时长`。
- **占位符（事实，**独立一族**）**：`create.placeholder.title`=`添加主题`、`placeholder.location`=`添加地点`、`placeholder.meetingRoom`=`添加会议室`、`placeholder.participants`=`添加联系人、邮件地址`、`placeholder.description`=`添加描述` —— **与 `summary.locationFallback` / `summary.notesEmpty` 不同键**，不可混用（本轮一次实现误用后者，已修正）。
- **校验（事实，8 条）**：`create.error.titleTooLong`=`标题不能超过 512 字`、`invalidRange`=`结束时间需晚于开始时间`、`startNotAligned`=`开始时间只能选 15 分钟的倍数`、`durationInvalid`=`时长需为 15 分钟的倍数`、`locationTooLong`=`地点不能超过 512 字`、`participantsRequired`=`至少邀请一位参与人`、`participantsLimit`=`参与人超出上限`、`participantVersionMissing`。
- **顶层校验（事实）**：`titleRequired`=`请填写标题`、`endAfterStart`=`结束时间需晚于开始时间`、`untitled`=`未命名日程` —— 这 3 条是**顶层键**，不属 `create.error.*`。
- **原文自认未实现的表单能力（事实）**：`create.hint.participantsLocked`=`参与人变更暂未实现`、`create.onlineMeetingHint`=`创建后自动生成腾讯会议链接`、`create.meetingMinutesHint`=`会议结束后生成纪要与转写内容`、`create.kindHint`=`当前只开放会议。时间安排、自动化、提醒要等对应契约。`、`create.noParticipantMatch`/`participantSearching`、`orgPickerFailed`=`打不开企业通讯录，请确认已登录后再试`、`busy.othersPending`=`其他人的忙闲暂未实现`、`busy.unknownHint`=`个人日历看不到他人忙闲；非本频道成员也会显示为未知`。
- **会议室子域（事实，约 60 条）**：`create.meetingRoom.*`（city/building/floor/loading/empty/booked/equipment.{tv,phone,projector,whiteboard,video}/minSeats/durationFilter/...）+ `create.meetingRoom.seriesUnsupported`=`重复日程暂不支持预订会议室`、`window.past/outsideHours/tooFar`、`create.error.meetingRoomReschedule`=`已预订会议室的日程请先释放房间再改期`、`drag.roomBlocked.*` —— **原文自身标注未实现**（`hint.meetingRoom`=`暂未实现`），复刻以桩提示对齐。

**X. 场次范围与编辑确认（事实）—— `occurrence.*` / `edit.confirm.*` / `drag.*`**

- **场次范围（事实，3 档）**：`occurrence.scope.this`=`仅本次`（`thisHint`=`只改这一次，系列里其他场保持原样`）、`thisAndFuture`=`本次及以后`（`thisAndFutureHint`=`从这一次起，后面的场次一起改`）、`entire`=`全部日程`（`entireHint`=`整个系列一起改，含已经过去的场次`）；标题 `titleUpdate`=`修改重复日程` / `titleCancel`=`取消重复日程`；`ok`/`cancel`=`确定`/`取消`。
- **编辑确认（事实）**：`edit.confirm.title`/`ok`/`cancel`=`确认修改`/`确认修改`/`返回修改`、`field.time`=`时间`、`field.participantsAdded`=`新增参与人`、`field.participantsRemoved`=`移除参与人`、`peopleCount`=`{count} 人`、`notify`=`保存后将通知 {count} 位参与人`、`notifyNobody`=`保存后不会通知其他人`。
- **推论（强）**：重复日程编辑/取消**必须选择作用范围**，说明原版模型保留**系列粒度**（不是把系列摊平成独立事件）—— 复刻据此在 `ScheduleEvent.repeat` 上保留 `kind/weekdays/until` 并实现 `expandOccurrences` 展开，而非物化。

**Y. 参与状态 / 投递 / 创建状态（事实）—— `rsvp.*` / `delivery.*` / `creation.*` / `participation.*`**

- **RSVP（事实，6 条）**：`rsvp.title`=`我的参与状态`、`hint`=`只影响我的个人邀请`、`accept`=`接受`、`tentative`=`待定`、`decline`=`拒绝`、`needsAction`=`未响应`。
- **投递（事实）**：`delivery.PENDING/SUCCEEDED/FAILED/DEAD`=`投递中`/`已投递`/`投递失败`/`投递终止`、`delivery.status`=`状态`、`pending`=`待投递`、`dead`=`终止`；详情侧 `detail.deliveryPending`=`待同步至 {count} 人`、`deliverySucceeded`=`已同步`、`deliveryFailed`/`deliveryDead`。
- **创建状态（事实，20 条）**：`creation.title`=`日程创建状态`、`successTitle`=`日程创建成功`、`written`=`已写入`（`writtenValue`=`日历对象`、`writtenTeam`=`团队日历对象`、`writtenPersonal`=`个人日历对象`）、`sent`/`notSent`/`sendFailed`=`已发送`/`未发送`/`发送失败`（`sentValue`=`{count} 位正式受邀`）、`linked`=`已关联`（`linkedValue`=`来源话题与变更记录`）。
- **来源与退出（事实）**：`origin.HUMAN_UI`=`频道成员创建`、`origin.WORKBUDDY_CONFIRMED_PROPOSAL`=`WorkBuddy 确认提议`；`participation.left`=`已退出`；`scope.channel`=`频道可见 · {count} 人正式受邀`。
- **删除/退出的后果说明（事实）**：`summary.deleteConfirmTitle`=`删除日程`、`deleteConfirmBody`=`删除后参与人会收到取消通知，这条日程从日历里消失。`、`leaveConfirmBody`=`退出后你不再是参与人，这条日程会从你的日历里移除。`

**Z. 日历设置与桩标记（事实）—— `settings.*`（69 条）/ `hint.*`（9 条）/ `weekday.*`（7 条）**

- **设置定位（事实）**：`settings.entry`/`title`=`日历设置`、`subtitle`=`仅设置新建日程的默认行为。` → 设置只影响**新建**的默认值，不改动已有日程。
- **设置项（事实）**：`field.duration`=`日程默认时长`（`duration.{15,30,60,90,120,180}` 六档）、`field.timedReminder`=`非全天日程默认提醒`（`timedReminder.{none,atStart,min5,min15,min30,hour1,day1}` 七档）、`field.allDayReminder`=`全天日程默认提醒`（`allDayReminder.{none,sameDay0800,sameDay0900,prevDay1800,prevDay0900,days20900,week10900}` 七档）、`field.weekStart`=`每周第一天`、`field.showLunar`=`是否显示农历`、`field.showTimezoneOnCreate`=`新建日程时显示时区`；错误 `saveFailed`、`versionConflict`=`设置刚在其他端改过，已刷新为最新，请再保存一次`。
- **同步子域：原文自认未开放（事实）**：`settings.sync.*`（约 30 条）含 `mac`=`同步至 Mac 系统日历`、`windows`=`同步至 Windows 系统日历`、`others`=`同步至手机日历等其他应用`、`caldavHint`/`exchangeHint`、`username`/`password`/`getPassword`、`passwordHint`（含**三行换行**，注入 i18n 时须转义 `\n`，否则产生未闭合字符串）、`recordTitle`/`emptyRecords`/`issueLimit`、`notAvailable`=`该功能暂未开放`。
- **桩标记三兄弟（事实，复刻的对齐要点）**：`hint.notImplemented`=`暂未实现`、`hint.noContract`=`当前版本暂无接口，仅展示效果`、`hint.notWired`=`接口已定义，暂未接入`；另有 `hint.noJump`=`仅展示引用，暂不跳转`、`hint.meetingRoom`=`暂未实现`、`hint.onlineMeetingUnavailable`=`当前环境未接入在线会议`、`hint.onlineMeetingLocked`=`已创建的日程暂不支持改在线会议`、`hint.meetingMinutesUnavailable`=`当前环境未开放会后纪要`、`hint.relatedTask`=`关联任务要用 WB_TASK 链接类型，当前契约只有 SOURCE_TOPIC / EXECUTION_RECORD`。
- **推论（强）**：原文**显式标注自身未实现的部分**（在线会议、会议室、会后纪要、第三方日历、同步到系统日历、团队待办叠加）。因此「复刻这些桩文案」**本身就是对齐**，而非偷工 —— 若复刻去真接腾讯会议 / 会议室预约，反而与原文行为不一致。
- **星期（事实）**：`weekday.0`~`6`=`周日`~`周六`（与 JS `getDay()` 同序）。
- **其余子域（事实，范围外）**：`attachment.permission.*`（8 条）、`feed.*`（4 条，含 `unavailableTag`=`暂未接入`）、`suggestion.*`（6 条，含 `unavailable`=`行动项建议接口暂未接入`）、`detail.notes/linkedMeeting/executionLink`、`subscriptionPeek.*`、`contextMenu.*`、`drag.*`、`miniList`。

### 5.9 第十次补证：数字员工 / 助理域（colleagues.*，第十三轮监督依据）

证据来源：i18n 词典 `colleagues.*` 命名空间（**573 条**，zh 权威；en 包亦 573 条**全覆盖**）。该域在复刻体中原为**完全空白**，故本轮同第十一 / 十二轮，为「从 0 建域」。

> ⚠️ 命名空间归属提示：`colleagues` 是**顶层独立命名空间**（非 `home.*` 子域），共 573 条。子域分布：createDialog 204、detail 98、bindChannel 72、chat 57、dashboard 32、imConfig 25、action 19、publishDialog 12、quotaLimit 11、cards 9、conversation 9、tag 8、editDialog 4，加顶层 19 条。

**A. 总览与入口（事实）—— 顶层 19 条**

- **入口（事实）**：`myColleagues`=`云助理`（顶栏入口 title）、`title`=`助理协作空间`（面板标题）、`subtitle`=`选择一位助理加入任务，让专业角色帮你完成研究、分析和内容创作。`
- **列表（事实）**：`countLabel`=`共 {count} 位助理`、`empty`=`暂无可用助理，创建或获取授权后会显示在这里。`、`loadError`=`助理列表加载失败，请稍后重试。`
- **两套状态命名（事实，易错点）**：列表卡用 `statusAvailable`=`工作中` / `statusIdle`=`已停用`；详情页用 `detail.colleagueStatus.{working,idle,abnormal}`=`工作中`/`空闲`/`异常` —— **同一语义两套文案**，不可混用（列表卡「已停用」≠ 详情「空闲」）。
- **其余（事实）**：`skillsLabel`=`助理能力标签`、`usageLabel`=`用量 {usage}`、`create`=`创建助理`、`moreActions`=`更多操作`、`myColleaguesDescription`=`常用助理已准备就绪，可在后续迭代接入创建与召唤能力。`

**B. 创建 / 编辑向导（事实，204 条）—— `createDialog.*` / `editDialog.*`**

- **两步结构（事实）**：`progressLabel`=`创建助理进度`、`steps.basic`/`steps.config`=`基本信息`/`能力配置`、`advancedConfig`=`能力配置（高级）`、`advancedConfigHint`=`专家/仓库/资料库/模型`；`createDialog.next`/`previous`=`下一步`/`上一步`、`finish`=`创建同事`；编辑态 `editDialog.title`=`编辑档案`、`editDialog.finish`=`保存`。
- **★ 必填校验（事实，易错点）**：`requiredError`=`请先填写助理昵称、助理简介和名称。` —— **三项并列必填**（昵称 `roleNickname` / 简介 `description` / 名称 `name`），故「名称」字段**不标（可选）**；`optional`=`（可选）` 另有用于他处。
- **★ 重名校验（事实）**：`nameDuplicated`=`名称已存在，请换一个名称`；`nameUniqueServiceUnavailable`=`名称校验暂不可用，请稍后重试`；另有一整族**内容审核**键 `moderationChecking`=`正在检测...`、`moderationBlocked.{name,roleNickname,description}`、`moderationCombinedBlocked`、`moderationServiceUnavailable` —— 原文接入内容审核服务，复刻以最简校验对齐。
- **职业预设（事实，21 项 + 自定义）**：`rolePresetLabel`=`助理职业快捷选项`、`customRole`=`自定义`、`customRoleDesc`=`自由定义职称与简介`、`viewMore`/`viewLess`=`查看更多`/`收起`；`rolePreset.*` 共 **21 项**（含 industryResearcher 行业研究员、contentCreator 内容创作专员、dataAnalyst 数据分析员、frontendEngineer 前端开发工程师、stockResearcher 股票研究员、xiaohongshuOps 小红书运营专员、qa 等）。首屏折叠展示「自定义 + 前 8 项」。
- **头像（事实，20 张 / 每页 8）**：`avatar`=`头像`、`avatarHint`=`点击换头像（{count} 张候选），也可自定义上传`、`avatar.preset01`~`preset20`（20 条）、`moreAvatar`/`previousAvatar`=`更多头像`/`上一组头像`、`viewLessAvatar`=`收起头像`；上传族 `avatarUpload`/`avatarReplace`/`avatarUploadShort`=`上传`、`avatarUploadUnsupported`=`当前环境暂不支持上传自定义头像。`（**桩**）、`avatarUploadInvalidType`=`请上传 PNG、JPG、WebP 或 GIF 图片。`、`avatarUploadTooLarge`=`图片不能超过 5 MB。`
- **能力配置第二步（事实）**：`connectionTitle`=`助理可以连接哪些数据？`、`connectionIntro`、`connectionHint`=`可选 · 点击 Source 立刻配置`、`connection.repo`=`连接仓库`；`responsibilities`=`常用职责`（`responsibility.{analysis,planning,report,review}`=`需求分析`/`方案拆解`/`报告生成`/`质量评审`）；`personality`=`协作风格`；`model.*`（`headerTitle`/`auto`=`自动`/`empty`=`暂无可选模型`）。
- **★ 代码仓库 OAuth（事实，原文自认需授权）**：`codeRepo.*` 29 条 —— `provider.{github,cnb,gongfeng}`=`GitHub`/`CNB`/`工蜂`、`connect`=`连接`、`connectProvider`=`连接 {name}`、`oauthDesc`=`授权后，助理可以读取你在 {name} 中可访问的仓库列表。`、`revokeAuth`=`取消授权`、`authTimeout`=`授权超时，请完成授权后重试。`、`githubSelectRepos`/`waitingRepoAuth`、`selectedCount`=`已选择 {count} 个仓库`、`cnbTokenPlaceholder`=`请输入 CNB Access Token`。复刻以**连接仓库**按钮 + `codeRepo.empty`=`暂无可选择仓库` 桩对齐。
- **★ 腾讯文档授权（事实，原文自认需授权）**：`tencentDocs.*` 17 条，含 `empty`=`暂无可选择文件`。复刻以知识库 chip（`knowledgeBase`/`knowledgeBaseDesc`）桩对齐。
- **★ 雇佣专家（事实，原文标注 Beta + 企业智能体未支持）**：`hireExpert.*` 19 条 —— `entryTitle`、`entryDesc`、`beta`=`Beta`、`emptyTitle`=`暂无匹配结果`、`emptyDesc`、`enterpriseEmptyTitle`=`暂无企业智能体`、`enterpriseEmptyDesc`=`当前企业下暂无已发布的企业智能体。`、`enterpriseLoadErrorTitle`=`企业智能体加载失败`、`enterpriseUnsupported`（企业智能体未支持，**桩**）；另 `createDialog.enterpriseCloneUnsupported`=`当前环境暂不支持基于企业智能体创建助理。`（**桩**）。
- **其余（事实）**：`fillExample`=`填充示例`、`aiWrite`=`AI 写`、`voice`=`语音`、`moderationChecking`、`displayName` 族。

**C. 详情页（事实，98 条）—— `detail.*`**

- **三段导航（事实）**：`detail.back`=`返回`、`detail.nav.{home,tasks,memory}`=`首页`/`对话任务`/`记忆`、`detail.startChat`=`发起对话`、`detail.personal`=`个人分身`。
- **三态状态（事实）**：`detail.colleagueStatus.{working,idle,abnormal}`=`工作中`/`空闲`/`异常`；`statusTitle`=`状态`、`statusBannerLabel`=`助理任务状态`、`processing`=`正在处理`、`readyForTask`=`空闲中，等待派单`、`taskExecution`=`任务执行`、`idleNoTask`=`空闲中 · 暂无进行中的任务`、`imStatus`=`IM 状态`、`notBound`=`未绑定`、`personalVisible`=`个人`、`lastActive`=`最近活跃`、`lastActiveFallback`=`2 小时前`。
- **统计指标（事实，4 项）**：`metricsLabel`=`任务统计`、`metric.total`=`总委派任务`（`totalDesc`=`含项目与个人委派`）、`inProgress`=`进行中`（`inProgressDesc`=`当前由该助理跟进`）、`completed`=`已完成`（`completedDesc`=`最近 30 天完成数`）、`completionRate`=`完成率`（`completionRateDesc`=`基于历史任务统计`）。
- **热力图（事实）**：`activityHeatmap`=`近一年活跃热力图`、`activityLevel`=`活跃等级`、`activityTotal`=`近一年累计 {count} 次活跃`、`less`/`more`=`少`/`多` → **近一年 = 52 周 × 7 = 364 格**。
- **基本信息（事实）**：`daysOnDuty`=`上岗天数`、`taskCount`=`任务数`、`taskConfig`=`任务配置`、`taskOverviewV2`=`任务概览`、`taskPageDesc`=`与 {name} 的历史对话任务 · 可按计划自动执行，也可随时手动触发。`。
- **任务表（事实，6 列）**：`taskTable.{id,name,source,status,createdAt,action}`=`ID`/`名称`/`来源`/`状态`/`创建时间`/`操作`；`untitledName`=`未命名任务`、`openHistoryAria`=`打开任务历史：{name}`、`openHistoryFailed`=`无法打开该任务历史，请刷新后重试`；`taskSourceCloud`=`云端`。
- **连接与来源（事实）**：`connectRepo`=`连接仓库`、`connectKnowledgeBase`=`连接知识库`、`selectRepo`=`选择仓库`、`hiredExpert`=`雇佣专家`、`notConfigured`=`未配置`、`repoCnb`=`CNB`、`tencentDocs`=`腾讯文档`、`productManager`=`产品经理`。
- **记忆页（事实）**：`memoryPageDesc`=`{name} 在协作中沉淀的技能与经验，会持续积累。`、`memoryEmpty`=`暂无记忆更新记录`。

**D. 渠道绑定与配置（事实，72 条）—— `bindChannel.*`**

- **分区（事实）**：`section.{profile,channel,permission,usage}`、`section.comingSoon`=`下期`（用量项标注「下期」）。
- **★ 独占规则（事实，核心一致性约束）**：`channel.bind`/`bound`/`rebind`/`unbind`=`绑定`/`已绑定`/`重扫`/`解绑`；`imConfig.colleague.subtitle`=`每位助理可绑定专属渠道，独立接收 / 回复消息。**除小程序外，同一渠道同一时间只能由 1 位助理占用。**` → **非 `wechatMini` 渠道为独占**，绑定新占用者时旧占用者自动转未绑定（转绑）。
- **渠道族（事实，7 类）**：企业微信、微信 bot（`wechatBot.boundTo`=`当前绑定：{name}`、`bindFailed`/`unbindConfirm`/`unbindFailed`）、飞书、QQ（`qq.bindTokenLabel`=`绑定口令：`、`bindSuccess`=`创建成功，已绑定机器人`、`unbindConfirm`/`bindFailed`/`unbindFailed`）、云助理·微信小程序（`wechatMini.unbound`=`未绑定`）等。
- **★ 桩（事实）**：`placeholder`（扫码/授权链路未接入，**桩**）、`wechatBot.scanDesc`（扫码描述）→ 复刻以「扫码描述 · placeholder」桩对齐。
- **权限与可见（事实，三档）**：`permission.{personal,project,public}`；`overlay`/`permission.online.{title,desc}`（助理在线开关）。

**E. 发布对话框（事实，12 条）—— `publishDialog.*`**

- **三档可见范围（事实）**：`option.{personal,project,public}` 名称逐一为 `个人分身`/`发布到项目`/`公开`；`submit.{personal,project,public}`=`保持个人`/`发布到项目`/`提交审核` → **提交按钮文案随档位切换**（易错点：非三个固定按钮）。

**F. 配额（事实，11 条）—— `quotaLimit.*`**

- **套餐上限（事实）**：`title`=`助理数量已达上限`、`upgrade`=`去升级`、`confirm`=`好的`、`unsupported`=`当前企业不支持个人助理能力。`；内容模板 `trialContent`/`youthContent`/`standardContent`/`advancedContent`/`flagshipContent`/`enterpriseContent`/`defaultContent` —— **`{limit}` = 套餐上限**，标准版文案含 `最多可创建 {limit} 个助理`。
- **推论（强）**：套餐为 trial / youth / standard / advanced / flagship / enterprise 六档，上限各异（复刻取 1/2/3/5/10/50）；当前默认 `standard`=3。

**G. 云助理仪表盘与 IM 配置（事实，32 + 25 条）—— `dashboard.*` / `imConfig.*`**

- **仪表盘（事实）**：`statusLabel`=`云助理运行状态`、`deviceOnline`=`2 设备在线`、`workingCount`=`{count} 助理工作中`、`assistantTitle`=`我的云助理`、`welcomeTitle`=`Hi，欢迎使用云助理`、`cloudTag`=`☁ 云端`、`assistantTag`=`助理`、`online`=`在线`、`modeLegacy`/`modeCloud`=`本地`/`云端`、`modeSwitchLabel`=`切换云助理模式`、`chat`=`对话`、`countStatus`=`{count} 位 · {working} 工作中`、`filterAll`/`filterAbnormal`=`全部`/`异常`、`filterLabel`=`筛选助理状态`、`recommended`=`推荐助理`、`standby`=`待命`、`idleAssignable`=`空闲中，可派单`、`imDisconnected`/`imConnected`=`未连接 IM`/`已连接 IM`、`proLabel`=`Pro`、`createTitle`/`createDesc`=`创建助理`/`组建你的团队`、`chatGuide.{description,skip,start}`。
- **IM 三 Tab（事实）**：`imConfig.tab.{bindChannel,assistant,colleague,memory}`=`绑定渠道`/`云助理 IM`/`助理 IM`/`内存记忆`；`assistant.heading`=`微信小程序绑定 · 云助理`、`assistant.subtitle`=`绑定云助理的微信小程序，扫码后将自动关联你的全部助理，统一在小程序里接收 / 回复消息`；`colleague.switchLabel`=`为谁配置 IM`、`colleague.subtitle`（独占规则）；**云助理 IM 主体为全局单条**（复刻固定 `subject='cloud'`）。
- **内存记忆（事实）**：`memory.heading`=`内存记忆`、`memory.subtitle`=`为每位助理独立配置长期记忆，开启后会在对话中使用你的记忆内容`、`memory.switch.name`=`内存记忆`、`memory.switch.desc`=`默认开启。关闭后，该助理后续对话将不再注入你的长期记忆`、`memory.switch.status`=`默认开启` → **默认开启**；`memory.error.{unsupported,saveFailed}`。
- **推论（强）**：原文**显式标注自身未实现 / 未接入的部分**（自定义头像上传、专家雇佣 Beta、企业智能体、腾讯文档与代码仓库授权、IM 扫码绑定）。因此「复刻这些桩文案」**本身就是对齐**，而非偷工。

**H. 动作与卡片（事实，19 + 9 + 8 条）—— `action.*` / `cards.*` / `tag.*`**

- **菜单动作（事实，完整 19 条）**：`viewDetails`=`查看详情`、`viewProfile`=`查看档案`、`editProfile`=`编辑档案`、`copyAsNew`=`复制为新助理`、`hireToProject`=`雇佣到项目`、`bindChannel`=`绑定渠道`、`pin`/`unpin`=`置顶`/`取消置顶`、`pinFailed`/`unpinFailed`、`publishToProject`=`发布到项目`、`pauseColleague`/`resumeColleague`=`暂停助理`/`恢复助理`、`delete`=`删除助理`、`deleteConfirmTitle`=`删除助理？`、`deleteConfirm`=`确定删除「{name}」吗？删除后将无法恢复。`、`deleteConfirmDescription`=`删除后将无法继续指派 {name} 处理任务。此操作需要确认后才会执行。`、`cloneDescriptionFallback`=`{name} 的副本`、`cloneFailed`=`复制助理失败：{message}`。
- **卡片与标签（事实）**：`cards.*` 9 条（推荐助理三卡名称/标题/描述）、`tag.*` 8 条。

### 5.10 第十一次补证：技能市场 / 技能管理域（`skills.*`，第十四轮监督依据）

> 证据来源：`/tmp/wb-i18n-zh.json`（zh，12,049 条扁平键）与 `/tmp/en-DtOAKogW.js`（en，rolldown 打包模块，正则 `"key":\`value\`` 抠出 12,116 条）。`skills.*` zh **513 条** / en **512 条**（差 `skills.cloudUpload.modal.batchLimitExceeded` —— **原版英文包自身缺该键**，非复刻遗漏）。

**A. 域归属与规模（事实）**

- **命名空间排名（实测）**：settings 1897 > collab 1487 > automation 846 > home 676 > colleagues 573 > **skills 513** > tencentLexiang 360 > myFiles 331 > conversation 314 > office 301。
- **代码引用统计（排除 i18n 文件）**：colleagues 241、automation 175、home 126、input 89、settings 61、conversation 60、tool 34、progress 14，其余为 **0** → `skills` 是**最大完全未覆盖域**，故选为第十四轮目标。
- **子域分布（事实）**：security 79、share 72、cloudUpload 47、detail 31、skillhub 26、upload 24、recommend 19、knot 18、batch 14、cloud 14、card 14、toast 12、picker 12、installed 10、batchUninstall 8、installConfirm 7、tab 6、batchUpdate 6、sync 5、cloudDownload 5、search 5、uninstall 4、builtin 4、update 4、cloudUninstall 4、refund 4、autoUpdate 3、tag 3、marketInstall 3、plugins 3、enabledWarning 3、purchase 3、create 2、find 2、delete 2、toggle 2、enterprise 2、l1tab 2 + 大量顶层单键。

**B. 六个 Tab（事实）—— `tab.*`（6 条）**

- `tab.{recommend,skillhub,plugins,knot,enterprise,installed}` = 推荐 / SkillHub / 套件 / Knot / 企业 Skill / 已安装。
- **主要来源键不对称（易错点）**：仅 `recommend` / `skillhub` / `knot` 有独立 `installed` / `installing` / `install` / `installSuccess` / `installSuccessPlain`；`plugins` / `enterprise` **无** —— 须回落 `skills.card.installed` 等通用键。`searchEmpty` 仅 `recommend` 缺（`recommend` 有独立 `empty`）。

**C. 卡片动作两态（事实）—— `card.*`（14 条）**

- 未安装 → `card.install`；已安装 → `card.{goChat,disable,edit,uninstall,pin|unpin}`（置顶切换）。
- 指标标签 `card.{downloads,stars,useCount,installCount}` / `detail.metric{Version,UseCount,InstallCount,DownloadCount,StarCount,Author}`。

**D. 启用 / 停用语义（事实）—— `toggle.*`（2 条）+ `enabledWarning.*`（3 条）**

- `toggle.tip.{enable,disable}` 明示这是「对话中自动判断是否使用」的开关，**不是**安装 / 卸载。
- `enabledWarning` 阈值 **80** 个启用技能时给出提示。
- `builtin.sort.{score,useCount,installCount,updatedAt}` 四项内置排序。

**E. 同步与安全（事实）**

- **同步五态**：`sync.{localOnly,cloudOnly,synced,localAhead,cloudAhead}`。
- **风险四档**：`security.result.{safe,low,medium,high}` / `security.riskLevel.{safe,low,medium,high}` + `security.verdict.{white,grey,black}`；`security.riskTooltip.{high,medium,low}`。
- `autoInstall`「非高风险自动安装」—— 与 `canAutoInstall` 判定一致。

**F. 付费与退款（事实）**

- **付费三态**：`paidTag` / `purchasedChip{Permanent,Monthly,Pending}` / `paidExpiredTag`；`paidPerMonth`（按月）/ `paidPermanent`（无限次）/ `yuan`（元）。
- `refund` 提示「退款 3 次后将无法再次购买」→ `REFUND_LIMIT = 3`。

**G. 批量与上传（事实）**

- **批量上限**：`batch.limitExceeded` 含 `{limit}`（复刻取 **50**）。
- **上传策略桩**：`upload.policy.{disabled,notInWhitelist,inBlacklist,invalidMode}`；`upload` 24 条、`cloudUpload` 47 条。
- **分享闸门（桩）**：`share.gate.{passed,pending,blocked,failed,unsupportedSource,flowPending}`、`share.step.{upload,securityCheck,createLink}`、`share.channel.*`（微信小程序码）。

**H. 桩语义（推论，强）**

- 原文**显式标注自身未接入**的能力：云端上传 / 下载（`cloudUpload` / `cloudDownload` / `cloudUninstall`）、安全检测（科恩实验室评估，`security` 79 条）、分享（微信小程序码，`share` 72 条）、付费与退款（`purchase` / `refund`）。
- 因此**复刻这些桩文案本身就是对齐**，与第十三轮助理域结论一致。

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

**近期推进**
9. ✅ P1：三工作模式 / 对话内搜索 / 入队 / 阶段可视化 / 清空上下文（第三~四轮，GAP-022~026）
10. ✅ P1：错误分类与停止原因（第六~七轮，GAP-031~039）
11. ✅ P1：工具链路闭环（审批 / 提问 / 工具卡片）（第八轮，GAP-041~045）
12. ✅ P1：消息流健壮性 + 工作空间 + 模型能力门控 + 上下文档位（第九轮，GAP-046~052）
13. ✅ P1/P2：会话状态角标 + 工作空间分组 + 全局任务搜索 + 来源标记 + 运行中关窗确认（第十轮，GAP-053~057）
14. ✅ P1：定时任务域（调度模型 + 存储与主进程调度器 + 面板与创建表单 + 运行记录）（第十一轮，GAP-058~061）
15. ✅ P1：日程 / 日历域（日程模型与摘要/重复/状态推导 + 存储与 IPC + 日历侧栏与月视图 + 创建编辑表单与详情卡与日历设置）（第十二轮，GAP-062~065）
16. ✅ P1：数字员工 / 助理域（助理模型与职业预设/头像/渠道/配额计算层 + 存储与独占转绑 + 列表卡与创建编辑两步向导 + 详情页三段导航与统计热力图任务表 + 配置页与 IM 三 Tab 与内存记忆）（第十三轮，GAP-066~069）
17. ✅ P1：技能市场 / 技能管理域（`skills.*` 513 键：六 Tab 推荐/SkillHub/套件/Knot/企业/已安装 + 技能模型与卡片动作/启用语义/同步五态/风险四档/付费三态/批量上限/上传与分享桩计算层 + 存储与批量操作 + 卡片网格与详情抽屉与技能选择器与搜索筛排 + 上传与分享桩）（第十四轮，GAP-070~073）

**待决策（架构级长尾，需范围共识）**
18. ⏳ P2：monaco 代码变更审阅器（diff/edit/apply）—— 原版 codeEditor chunk 的核心业务是「AI 代码改动审阅」，需在复刻引入 Artifact/代码编辑场景后才成立（GAP-011）
19. ⏳ P1：IM 渠道（飞书/钉钉/企微）—— 含 `automation.datasource.*`（147 条）与 `automation.modal.wecomBotSource.*`（28 条）（GAP-007）
20. ⏳ P2：遥测 / 自更新 / 守护进程
21. ⏳ P2：`conversation.shareFile.*`（119 条，属协同域 collab）与代码库来源工作空间（Git 集成）（GAP-049）
22. ⏳ P2：日程域外延子域（会议室预约 `create.meetingRoom.*` 约 60 条、腾讯会议在线会议、同步至系统日历 `settings.sync.*` 约 30 条、团队待办叠加 `sidebar.overlayTeamTodos`、第三方日历 `thirdPartyDialog.*` 约 40 条）—— 原文自身均已标注未实现 / 未开放，复刻当前以桩提示对齐
23. ⏳ P2：助理域外延子域（`createDialog.codeRepo.*` 29 条 GitHub/CNB/工蜂 OAuth、`createDialog.tencentDocs.*` 17 条腾讯文档授权、`createDialog.hireExpert.*` 19 条专家雇佣 Beta/企业智能体、`chat.*` 57 条真实对话实例与多轮编排）—— 原文自身均标注 Beta / 未实现 / 需授权，复刻当前以桩提示对齐
24. ⏳ P2：技能域外延子域（云端上传/下载 `cloudUpload.*` 47 + `cloudDownload.*` 5 + `cloudUninstall.*` 4、安全检测 `security.*` 79 条科恩实验室评估、分享 `share.*` 72 条微信小程序码、付费退款 `purchase.*` 3 + `refund.*` 4）—— 原文自身均标注未接入 / 需网关，复刻当前以桩提示与本地状态位对齐

> 长尾项建议：先不追求 100% 一致，而是按「核心链路 → 能力外延」逐层推进。每轮由监督角色产出新 GAP，开发角色修复后复检，直至本阶段范围内 0 open。
