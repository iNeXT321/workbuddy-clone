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

**待决策（架构级长尾，需范围共识）**
14. ⏳ P2：monaco 代码变更审阅器（diff/edit/apply）—— 原版 codeEditor chunk 的核心业务是「AI 代码改动审阅」，需在复刻引入 Artifact/代码编辑场景后才成立
15. ⏳ P1：IM 渠道（飞书/钉钉/企微）
16. ⏳ P2：遥测 / 自更新 / 守护进程
17. ⏳ P2：`conversation.shareFile.*`（119 条，属协同域 collab）与代码库来源工作空间（Git 集成）

> 长尾项建议：先不追求 100% 一致，而是按「核心链路 → 能力外延」逐层推进。每轮由监督角色产出新 GAP，开发角色修复后复检，直至本阶段范围内 0 open。
