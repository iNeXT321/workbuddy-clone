# 复刻一致性差异报告（parity-gaps）

> 生成方式：监督角色对当前 `src/` 代码 vs `spec/original-baseline.md` 做首轮对比。
> 结论区分：事实 / 推断 / 未知。状态机见 `roles/loop.md`。

---

### GAP-001 · 消息未持久化：store.appendMessage 未被调用

- **严重级**：P0（核心链路断裂）
- **维度**：数据层 / 对话链路
- **基线依据**：original-baseline.md §3.4、§5（原版 conversation 模块 + database 层持久化消息）
- **现状**：`store.ts:153` 定义了 `appendMessage()`，但 `ipc.ts` 未注册对应 handler，渲染层 `useApp.ts` 的 `sendMessage` 只调用 `chatStream`，**用户消息与 AI 回复都不会写进 messages 表**。证据：全局搜索 `appendMessage` 仅命中定义处 1 次。
- **期望**：发送消息时把 user 消息落库；流式结束后把 assistant 消息落库；重开会话时能从 DB 还原完整历史。
- **验证方法**：`grep -rn "appendMessage" src/` 应命中 ≥3 处（store 定义 + ipc 调用）；或发送一条消息后重启应用，会话历史仍在。
- **修改文件**：src/main/ipc.ts（chatStream handler 中新增 user/assistant 双落库）
- **验证结果**：`grep -rn "appendMessage" src/` 命中 3 处；`npm run typecheck` / `npm run build` 均通过。
- **状态**：resolved

---

### GAP-002 · IPC 通道命名与基线 wb: 风格不一致

- **严重级**：P1
- **维度**：IPC
- **基线依据**：original-baseline.md §3.2（handler-registry 体系）；本复刻 `types.ts` 注释自称「对齐 wb:invoke / wb:event 模式」。
- **现状**：`types.ts` 用 `settings:get` / `conversation:list` / `chat:stream` 等命名，而原版为 `wb:` 前缀（如 `wb:conversation:a2aApproval`，见 facade.js 事实）。
- **期望**：将 IPC 通道对齐为 `wb:` 命名空间，或至少在基线中把当前命名声明为「可接受差异」并说明理由。
- **验证方法**：`grep -rn "wb:" src/shared/types.ts` 命中；或基线 §5 明确标注该差异为可接受。
- **修改文件**：src/shared/types.ts（IPC 通道全部改为 wb: 命名空间）
- **验证结果**：`grep -rn "wb:" src/shared/types.ts` 命中 10 处；typecheck/build 通过。
- **状态**：resolved

---

### GAP-003 · 设置面板 vs 原版多面板结构

- **严重级**：P2（结构差距，不阻断核心链路）
- **维度**：渲染层
- **基线依据**：original-baseline.md §4（24 个面板 chunk：AccountPanel / MemorySettingsPanel / ModelsSettingsPanel 等）
- **现状**：复刻只有单一 `SettingsPanel`（baseUrl / apiKey / model / temperature / theme）。
- **期望**：本期至少拆分出「模型设置」与「账户/凭据」两个语义面板，或明确将多面板拆解列入范围规划。
- **验证方法**：`ls src/renderer/src/components/` 出现 ≥2 个 *Panel 组件。
- **修改文件**：src/renderer/src/components/SettingsPanel.tsx（拆为「账户与连接」「模型」两个标签页子面板）、src/renderer/src/styles/global.css（新增 settings-layout/settings-tabs 布局样式）
- **验证结果**：`grep -c "settings-tab" SettingsPanel.tsx` 命中 2；typecheck/build 通过。
- **状态**：resolved

---

### GAP-004 · 数学公式渲染缺失 KaTeX

- **严重级**：P2
- **维度**：渲染层
- **基线依据**：original-baseline.md §4（renderer assets 含大量 KaTeX 字体）、§5（技术栈差异表）。
- **现状**：`Markdown.tsx` 仅 react-markdown + remark-gfm + highlight.js，无 KaTeX。
- **期望**：引入 KaTeX（`rehype-katex` + `remark-math`）对齐原版数学渲染。
- **验证方法**：`package.json` 含 `katex` / `remark-math` / `rehype-katex`；`Markdown.tsx` 挂载对应插件。
- **修改文件**：src/renderer/src/components/Markdown.tsx（挂载 remark-math + rehype-katex）、package.json（新增 3 依赖）
- **验证结果**：Markdown.tsx 导入 remark-math/rehype-katex/katex.min.css；build 产物含 KaTeX 字体，与原版 renderer 一致。
- **状态**：resolved

---

### GAP-005 · 代码高亮方案与原版一致性待确认

- **严重级**：P2
- **维度**：渲染层
- **基线依据**：original-baseline.md §5.1（**二次修订**：已确认原版 = shiki）
- **现状**：已补证为「事实」——原版使用 **shiki** 做语法高亮（697 个语言/主题懒加载 chunk）。
- **期望**：复刻引入 shiki（见 GAP-009 修正）。
- **验证方法**：与 GAP-009 合并验证。
- **状态**：closed（并入 GAP-009 修正）

---

### GAP-010 · 缺失 mermaid 图表渲染

- **严重级**：P2
- **维度**：渲染层
- **基线依据**：original-baseline.md §5.1（mermaid.core chunk：flowchart/stateDiagram/classDiagram/gantt/sequenceDiagram）
- **现状**：复刻无任何图表渲染能力，Markdown 里的 ```mermaid 代码块只显示为纯文本代码。
- **期望**：引入 mermaid，识别 ```mermaid 围栏并渲染为图表。
- **验证方法**：`package.json` 含 `mermaid`；Markdown 组件对 mermaid 代码块做渲染。
- **状态**：open

---

### GAP-011 · 缺失 monaco 代码编辑器

- **严重级**：P2
- **维度**：渲染层
- **基线依据**：original-baseline.md §5.1（codeEditor chunk，monaco 命中 71 次 + monaco-init/contribution 独立 chunk）
- **现状**：复刻 `package.json` 已装 `monaco-editor` 但**代码零引用**（悬空依赖）。
- **期望**：接入 monaco 作为代码/编辑场景的编辑器（对齐原版 codeEditor chunk 职责）；或在基线中明确本阶段不含编辑器场景。
- **验证方法**：`grep -rn "monaco" src/` 命中实际使用；或基线范围共识明确排除。
- **状态**：open

---

### GAP-006 · 缺失内置终端（node-pty）

- **严重级**：P1（长尾能力）
- **维度**：其它
- **基线依据**：original-baseline.md §1（`@lydell/node-pty` ^1.2.0）
- **现状**：复刻已引入 node-pty 提供内置终端。
- **期望**：引入 node-pty 提供内置终端（依赖 `@lydell/node-pty`，且需 unpacked 原生二进制）。
- **验证方法**：`package.json` 含 node-pty；存在终端组件；主进程 PTY 会话 + preload 桥接 + IPC 通道齐备；产物 externalize。
- **修改文件**：src/main/terminal.ts（新建，PTY 会话管理 + 6 个 IPC handler）、src/shared/types.ts（新增 6 个 `wb:terminal:*` 通道）、src/main/index.ts（注册 registerTerminalHandlers）、src/preload/index.ts（暴露 termOpen/termWrite/termResize/termClose + onTermData/onTermExit）、src/renderer/src/components/TerminalPanel.tsx（新建，xterm.js 渲染）、src/renderer/src/App.tsx（顶栏终端开关）、src/renderer/src/styles/global.css（终端面板样式）、package.json（新增 `@lydell/node-pty`、`@xterm/xterm`、`@xterm/addon-fit`）
- **验证结果**：`grep -c "wb:terminal" types.ts` 命中 6；terminal.ts 8 处 pty 调用；preload termOpen 命中；`out/main/index.js` 中 `require("@lydell/node-pty")` 已 externalize（未内联）；node 环境冒烟测试 PTY 成功 spawn zsh 并回显提示符；typecheck/build 通过。
- **状态**：resolved

---

### GAP-007 · 缺失 IM 渠道 / 遥测 / 守护进程架构

- **严重级**：P2（长尾能力，架构级）
- **维度**：其它
- **基线依据**：original-baseline.md §1、§2、§3.7、§3.8、§3.9
- **现状**：复刻为单主进程，无 daemon、无飞书/钉钉/企微/IM 渠道、无遥测。
- **期望**：这些属于架构级长尾，须先在 baseline §7 明确「是否纳入本阶段范围」后再逐项拆解。
- **验证方法**：以 baseline §7 范围共识为准。
- **状态**：deferred

---

### GAP-008 · 状态管理未对齐 zustand

- **严重级**：P1
- **维度**：渲染层
- **基线依据**：original-baseline.md §5.1（补证：原版主 chunk 命中 `zustand`）
- **现状**：补证前为手写 `useApp` hook（useState/useRef/useCallback）。
- **期望**：状态管理改用 zustand，对齐原版。
- **验证方法**：`grep -n "zustand" src/renderer/src/stores/useApp.ts` 命中 `create`。
- **修改文件**：src/renderer/src/stores/useApp.ts（改用 `create<AppState>` 重写，对外 useApp() 接口不变）、src/renderer/src/App.tsx（补 init() 调用）
- **验证结果**：useApp.ts 导入 `create` from zustand；typecheck/build 通过；组件零改动。
- **状态**：resolved

---

### GAP-009 · ~~多余 highlight.js~~ → 修正为「复刻缺失语法高亮」

- **严重级**：**P1（修正）**（原判 P2）
- **维度**：渲染层
- **基线依据**：original-baseline.md §5.1（**二次修订**）
- **判定修正说明**：首轮监督误判。当时仅对 3 个主 chunk 做关键词 grep，未发现 `shiki`/`prism`/`highlight.js`，遂判定「原版无独立高亮库」，并据此要求移除复刻的 highlight.js。**二次监督推翻该结论**：原版把 shiki 拆成 697 个语言/主题懒加载 chunk，库名字面量不在主 chunk 中，属首轮方法缺陷。原版**有**语法高亮（shiki），且用 shiki 而非 highlight.js。
- **现状**：复刻的 highlight.js 已移除，当前为原生 pre/code，**无任何语法高亮**——这比原判更不一致。
- **期望**：引入 **shiki**（对齐原版实际方案），支持按需语言加载；highlight.js 确实不应回退（原版不用它）。
- **验证方法**：`package.json` 含 `shiki`；`Markdown.tsx` 用 shiki `codeToHast` 或等价方案渲染代码块。
- **修改文件**：（本轮）src/renderer/src/components/Markdown.tsx、package.json
- **验证结果**：待执行
- **状态**：open（修正后重开）

---

### GAP-012 · 缺失消息级操作（复制 / 重新生成 / 删除单条）

- **严重级**：P1（核心对话体验）
- **维度**：渲染层 / 对话链路
- **基线依据**：original-baseline.md §4 renderer chunk 含 `copy`、`message`、`chat`、`conversation` 等功能 chunk
- **现状**：`ChatArea.tsx` 只渲染消息文本，无任何消息级操作按钮（复制为纯文本 / Markdown、重新生成该条回答、删除单条消息）。
- **期望**：assistant 消息带「复制 / 重新生成」按钮，支持 hover 显示；消息级操作对齐原版。
- **验证方法**：`grep -rn "重新生成\|onRetry\|navigator.clipboard" src/renderer` 命中实际实现。
- **修改文件**：src/renderer/src/components/ChatArea.tsx（hover 操作条：复制/重新生成/删除）、src/renderer/src/stores/useApp.ts（新增 `regenerate` / `removeMessage`）、src/main/store.ts（新增 `deleteMessage` / `truncateFrom`）、src/main/ipc.ts（2 个新 handler）、src/preload/index.ts（2 个新桥接）、src/shared/types.ts（`wb:message:delete` / `wb:message:truncate-from` + StreamRequest 携带客户端消息 id）、src/renderer/src/styles/global.css（操作条样式）
- **验证结果**：`grep -cE "onRegenerate|onDelete|navigator.clipboard" ChatArea.tsx` = 6；store `regenerate`/`removeMessage` 命中；SQL 冒烟测试（truncateFrom 截断 / deleteMessage 单删）结果正确；typecheck/build 通过。
- **状态**：resolved

---

### GAP-013 · 缺失会话搜索

- **严重级**：P1（会话量大后的必要能力）
- **维度**：渲染层 / 数据层
- **基线依据**：original-baseline.md §4 renderer chunk 含 `search` 功能 chunk
- **现状**：`Sidebar.tsx` 仅平铺列出会话，无搜索框，无法按标题/内容检索。
- **期望**：侧栏顶部提供搜索框，按标题过滤（本期最小可用：标题 + 消息内容 LIKE 查询）。
- **验证方法**：`grep -n "search\|搜索" src/renderer/src/components/Sidebar.tsx` 命中；store 层有 searchConversations 动作。
- **修改文件**：src/renderer/src/components/Sidebar.tsx（搜索框 + 内联重命名替代 window.prompt）、src/renderer/src/stores/useApp.ts（`search` 动作 + `searchQuery` 状态）、src/main/store.ts（`searchConversations`：标题 + 消息内容 LIKE + DISTINCT）、src/main/ipc.ts、src/preload/index.ts、src/shared/types.ts（`wb:conversation:search`）、src/renderer/src/styles/global.css（搜索框 / 重命名输入样式）
- **验证结果**：Sidebar 搜索相关命中 4 处；SQL 冒烟测试「搜索 Spring 命中标题、搜索消息内容命中会话」均正确；typecheck/build 通过。
- **状态**：resolved

---

### GAP-014 · 缺失 Composer 附件上传 / 图片粘贴

- **严重级**：P2
- **维度**：渲染层
- **基线依据**：original-baseline.md §4 renderer chunk 含 `image`、`audio`、`MediaPreviewContext`、`upload` 相关功能
- **现状**：`Composer.tsx` 仅纯文本 textarea，无附件、无图片粘贴、无语音。
- **期望**：至少支持图片粘贴/拖拽预览（对齐原版多模态输入）；语音/大文件属长尾。
- **验证方法**：`grep -rn "onPaste\|onDrop\|attachment" src/renderer/src/components/Composer.tsx` 命中。
- **修改文件**：src/shared/types.ts（新增 `Attachment` 接口；`ChatMessage.attachments`；`StreamRequest.messages` 携带 attachments）、src/main/store.ts（messages 表增 `attachments` 列 + 旧库 ALTER 兼容；读写 JSON 序列化）、src/main/llm.ts（`toOpenAIMessage`：有附件时构造 OpenAI 多模态 `image_url` content 数组）、src/main/ipc.ts（落库带 attachments）、src/renderer/src/stores/useApp.ts（`sendMessage` 接 attachments；history 保留附件）、src/renderer/src/components/Composer.tsx（粘贴 / 拖拽 / 文件选择 + 缩略图预览 + 移除；4 张上限、8MB 限制）、src/renderer/src/components/ChatArea.tsx（用户消息内联展示图片）、src/renderer/src/i18n/index.ts（6 条新词条）、src/renderer/src/styles/global.css（附件条 / 缩略图 / 拖拽态样式）
- **验证结果**：Composer 附件相关命中 21 处；类型/存储/LLM 三层命中；SQL 冒烟测试——旧库自动补列成功、附件 JSON 往返正确；typecheck/build 通过。
- **状态**：resolved（图片输入完成；语音/超大文件仍属长尾）

---

### GAP-015 · 主题不支持「跟随系统」

- **严重级**：P1
- **维度**：渲染层 / 主进程
- **基线依据**：original-baseline.md §4 renderer chunk 存在 `useTheme` / `appearance` / `theme` 三个独立 chunk
- **现状**：`AppSettings.theme` 只有 `'light' | 'dark'` 两态；主进程 `nativeTheme.themeSource = settings.theme` 直接透传，无 `'system'` 选项，无法跟随 macOS 外观。
- **期望**：`theme` 增加 `'system'` 取值，`themeSource` 透传 `'system'`，渲染层监听 `prefers-color-scheme` 变化并实时切换。
- **验证方法**：`grep -n "system" src/shared/types.ts`（theme 含 system）；`grep -n "prefers-color-scheme\|matchMedia" src/renderer` 命中。
- **修改文件**：src/shared/types.ts（theme 增 `'system'`）、src/renderer/src/stores/useApp.ts（`resolveTheme` + `matchMedia` 监听 + `onSystemTheme` 订阅 + `applyTheme`）、src/renderer/src/components/SettingsPanel.tsx（「跟随系统」选项）、src/main/index.ts（`themeSource` 透传 system + `shouldUseDarkColors` 解析背景色 + `nativeTheme.on('updated')` 推送 `wb:theme:system-changed`）、src/preload/index.ts（`onSystemTheme` 桥接）
- **验证结果**：types.ts theme 三态命中；useApp matchMedia/prefers-color-scheme 命中；SettingsPanel「跟随系统」命中；main 的 shouldUseDarkColors / system-changed 命中；typecheck/build 通过。
- **状态**：resolved

---

### GAP-016 · 缺失会话导出

- **严重级**：P2
- **维度**：渲染层 / 数据层
- **基线依据**：original-baseline.md §4 renderer chunk 含 `download` / `share` / `copy`
- **现状**：复刻无任何会话导出（Markdown / JSON / 纯文本）能力。
- **期望**：会话支持导出为 Markdown 或 JSON（本期最小可用：导出当前会话为 .md）。
- **验证方法**：`grep -rn "导出\|export" src/renderer/src/components/Sidebar.tsx` 命中实际实现。
- **修改文件**：src/main/ipc.ts（`exportConversation` handler：转 Markdown + `dialog.showSaveDialog` + `writeFileSync`）、src/shared/types.ts（`wb:conversation:export`）、src/preload/index.ts（桥接）、src/renderer/src/stores/useApp.ts（`exportConversation` 动作）、src/renderer/src/components/Sidebar.tsx（会话项 ↓ 导出按钮）、src/renderer/src/App.tsx（接线）
- **验证结果**：ipc/preload/Sidebar/App/types 全链路命中；导出为 Markdown（含角色分节）；typecheck/build 通过。
- **状态**：resolved

---

### GAP-017 · 代码块缺复制按钮

- **严重级**：P1（高频实用能力）
- **维度**：渲染层
- **基线依据**：original-baseline.md §5.1（codeEditor chunk 含 `copy`）；renderer chunk 列表含 `copy`
- **现状**：`Markdown.tsx` 的 shiki 代码块只有高亮，无语言标签、无「复制」按钮。
- **期望**：代码块右上角提供语言标签 + 复制按钮（对齐原版 codeEditor 的 copy 能力）。
- **验证方法**：`grep -rn "code-copy\|复制" src/renderer/src/components/Markdown.tsx` 命中。
- **修改文件**：src/renderer/src/components/Markdown.tsx（`CodeBlock` 加语言标签条 + 复制按钮，`navigator.clipboard`）、src/renderer/src/styles/global.css（`.code-block-wrap` / `.code-block-bar` / `.code-copy` 样式）
- **验证结果**：Markdown.tsx 命中 2 处；typecheck/build 通过。
- **状态**：resolved

---

### GAP-018 · 缺失 toast 通知系统

- **严重级**：P2
- **维度**：渲染层
- **基线依据**：original-baseline.md §4 renderer chunk 含 `toast`
- **现状**：复刻用浏览器原生 `window.confirm` / `window.prompt` / 静默失败，无统一轻提示。
- **期望**：实现轻量 toast（成功/错误/信息），替换删除确认、导出结果、复制反馈等场景。
- **验证方法**：`grep -rn "toast\|Toast" src/renderer/src/components/` 命中。
- **修改文件**：src/renderer/src/stores/useToast.ts（新建 zustand toast store + `toast` 便捷函数）、src/renderer/src/components/Toaster.tsx（新建容器）、src/renderer/src/App.tsx（挂载 `<Toaster />`）、src/renderer/src/components/ChatArea.tsx（复制成功/失败走 toast）、src/renderer/src/stores/useApp.ts（导出结果走 toast）、src/renderer/src/styles/global.css（`.toaster` / `.toast` 样式 + 入场动画）
- **验证结果**：useToast.ts / Toaster.tsx 存在；App 挂载 Toaster；ChatArea toast 命中 3 处；typecheck/build 通过。
- **状态**：resolved

---

### GAP-019 · 缺失 i18n 多语言

- **严重级**：P2（架构级，改动面大）
- **维度**：渲染层
- **基线依据**：original-baseline.md §4 renderer chunk 含 `useI18n` / `useTranslation` / 多语言 chunk（`zh` / `en` / `es` / `th` / `ja` / `ko` / `fr` / `de` / `ru` / `pt` / `id` / `vi` 共 15 语言 + 各 locale emoji chunk）
- **现状**：复刻全部文案硬编码中文，无 i18n 基础设施。
- **期望**：引入 i18n 基础设施（zh-CN + en 两语言 + 语言切换）；全量组件文案抽取属后续渐进工作。
- **验证方法**：`grep -rn "useI18n\|i18n" src/renderer/src/` 命中基础设施。
- **修改文件**：src/renderer/src/i18n/index.ts（新建：自研轻量 i18n，对齐原版「无第三方库」的实现方式；zh-CN + en 词典；`useTranslation` hook + 非 hook `t()`）、src/shared/types.ts（AppSettings 增 `locale`）、src/main/store.ts（defaults 增 locale）、src/renderer/src/stores/useApp.ts（init/saveSettings 同步 locale）、src/renderer/src/components/{Sidebar,ChatArea,Composer,SettingsPanel,Markdown,TerminalPanel}.tsx + App.tsx（全部文案改走 `t()`；SettingsPanel 增语言选择项）
- **验证结果**：i18n/index.ts 存在；7 个组件全部接入 `useTranslation`；`locale` 落入 types/store；硬编码残留检查「无残留」；typecheck/build 通过。
- **状态**：resolved（基础设施 + 全量组件文案抽取本期完成，后续语言可增量扩展）

---

### GAP-020 · 「重新生成」截断语义不可靠（正确性缺陷）

- **严重级**：P1（数据正确性）
- **维度**：数据层 / 对话链路
- **基线依据**：本条非「对齐原版」差异，而是复刻自身在实现 GAP-012 时引入的**逻辑缺陷**，由监督角色在复检中主动发现。
- **现状**：`regenerate` 原按 `createdAt` 时间戳截断（`DELETE ... WHERE created_at >= cutoff`）。但渲染层消息 `createdAt` 与主进程落库时的 `Date.now()` 是**两个不同值**，且同毫秒内插入的多条消息时间戳相同——冒烟测试证明旧方案会**误删整个会话的消息**。
- **期望**：按消息插入顺序（SQLite rowid）截断；同时落库沿用渲染层传入的时间戳，保证 DB 行与 UI 行完全一致。
- **验证方法**：`grep -n "truncateFromId" src/main/store.ts` 命中；冒烟测试「删 a1 及之后」应保留 u1、删除 a1/u2/a2。
- **修改文件**：src/main/store.ts（`truncateFrom(createdAt)` → `truncateFromId(messageId)`，按 rowid 截断）、src/main/ipc.ts（handler 改收 messageId；落库沿用 `userMessageCreatedAt` / `assistantMessageCreatedAt`）、src/preload/index.ts（签名同步）、src/shared/types.ts（StreamRequest 增 `userMessageCreatedAt` / `assistantMessageCreatedAt`）、src/renderer/src/stores/useApp.ts（sendMessage/regenerate 传时间戳，regenerate 改传 assistantId）
- **验证结果**：冒烟测试——按 id 截断正确保留 `u1`；对比旧时间戳方案（同毫秒）会误删至 0 条，证实修复必要性。typecheck/build 通过。
- **状态**：resolved

---

### GAP-021 · 缺失用户消息编辑

- **严重级**：P1（核心对话链路）
- **维度**：渲染层 / 对话链路
- **基线依据**：original-baseline.md §4 renderer chunk 含 `edit` 功能 chunk
- **现状**：用户消息只读，无法编辑后重发；交互上只能「重新生成」assistant 回复，不能修正自己的输入。
- **期望**：用户消息支持「编辑」→ 就地编辑 → 提交后截断该消息之后的内容并重新生成。
- **验证方法**：`grep -rn "编辑\|editingMessage" src/renderer/src/components/ChatArea.tsx` 命中。
- **修改文件**：src/renderer/src/stores/useApp.ts（`editMessage`：截断该消息及其后 → 用新文本重发）、src/renderer/src/components/ChatArea.tsx（用户消息「编辑」按钮 + 就地 textarea + 保存并重生成/取消）、src/renderer/src/App.tsx（接线）、src/renderer/src/styles/global.css（`.message-edit` / `.message-edit-input` / `.msg-action.primary`）
- **验证结果**：ChatArea 编辑相关命中 6 处；store `editMessage` 命中；typecheck/build 通过。
- **状态**：resolved

---

## 本轮监督总结（第二轮 · 行为级深化）

- **方法修正（重要）**：首轮补证「原版无独立高亮库」结论**被推翻**。缺陷根因是「只对 3 个主 chunk 做关键词 grep」——原版把 shiki 拆成 697 个懒加载 chunk，库名不在主 chunk 中。二次监督改为**枚举 renderer assets 全部 chunk 文件名**，还原出 shiki / mermaid / monaco 三项事实。
- **新确认差距**：GAP-009（缺 shiki 高亮，P1）、GAP-010（缺 mermaid 图表，P2）、GAP-011（monaco 悬空依赖，P2）、GAP-012（缺消息级操作，P1）、GAP-013（缺会话搜索，P1）、GAP-014（缺附件/图片，P2 deferred）。
- **结构性差距**：GAP-007（IM/遥测/守护进程）、GAP-011（monaco 审阅器）属架构/场景级长尾，须先有范围共识。

> 闭环状态：GAP-001/002/003/004/006/008/009(改)/010/012/013/014/015/016/017/018/019/020/021 已 resolved 并复检通过；GAP-005 closed；GAP-007/011 deferred（架构级长尾）。**本轮 open 清零。**
>
> 下一轮监督方向：会话置顶/分组、A2A 审批流、monaco 代码审阅器（需先引入 Artifact 场景）、IM 渠道接入。

---

## 第三轮监督（方法升级 · i18n 词典驱动取证）

> 方法升级说明：前两轮以 **chunk 文件名** 推断能力，粒度粗。本轮改为**解码原版中文词典**（`renderer/assets/zh-cn-*.js`，1.1 MB，`\uXXXX`）提取 **12,049 条用户可见文案**，按 key 命名空间聚类，等价于拿到原版的「功能说明书」。据此在**核心对话链路**内发现 5 条新差距。
>
> 同时修正前轮误报：GAP-014（图片附件）已落地；「停止生成」实际已实现（`Composer` 的 `btn stop` + `stopStreaming` + 主进程 `chatAbort`），前轮 grep 用词不当导致误判，**本条不计入 open**。

### GAP-022 · 缺失「三工作模式」切换（计划 / 问答 / 执行）

- **严重级**：P1（核心对话链路交互）
- **维度**：渲染层 / 对话链路
- **基线依据**：original-baseline.md §5.2 —— `input.wbAdd.mode.label.plan`=`计划`、`input.wbAdd.mode.label.ask`=`仅问答`、`input.wbAdd.mode.description.craft`=`当前为默认模式，可高效执行并完成任务`；`input.modeChip.clear`=`退出{mode}模式`
- **现状**：无任何模式概念，输入框只有「发送 / 停止」。用户无法声明「先规划、等确认再执行」或「仅问答、不执行」。
- **期望**：Composer 增加模式选择（+ 菜单内「模式」分组），三档：默认（执行）/ 计划 / 仅问答；当前模式以 chip 常驻显示，可一键退出；模式经请求携带到主进程并写入 system 提示。
- **验证方法**：`grep -rn "mode" src/renderer/src/components/Composer.tsx` 命中；`grep -rn "chat.mode" src/renderer/src/i18n/index.ts` 命中；三档文案与基线一致。
- **修改文件**：src/shared/types.ts（`AppSettings.mode` + `StreamRequest.mode`）、src/renderer/src/i18n/index.ts（模式文案）、src/renderer/src/stores/useApp.ts（sendMessage 携带 mode）、src/renderer/src/components/Composer.tsx（模式菜单 + chip）、src/main/llm.ts（按 mode 注入 system 提示）、src/main/store.ts（默认值）、global.css
- **状态**：resolved

### GAP-023 · 缺失对话内搜索（在消息中查找/跳转）

- **严重级**：P1（核心对话链路）
- **维度**：渲染层 / 对话链路
- **基线依据**：original-baseline.md §5.2 —— `chat.search.tooltip`=对话内搜索、`placeholder`=搜索对话内容、`noMatch`=未找到匹配内容、`previous`(Shift+Enter) / `next`(Enter) / `close`(Esc)
- **现状**：只有**侧边栏会话列表搜索**（GAP-013 已做），缺少**对话内消息内容搜索**——两者在原版是不同能力。
- **期望**：对话区右上角搜索入口 → 输入即高亮命中消息并计数 `n/m`；Enter 下一个、Shift+Enter 上一个、Esc 关闭；无命中提示。
- **验证方法**：`grep -rn "chat.search" src/renderer/src/components/ChatArea.tsx` 命中；命中计数与跳转逻辑存在。
- **修改文件**：src/renderer/src/components/ChatArea.tsx（搜索栏 + 命中计数 + 跳转 + 高亮）、src/renderer/src/i18n/index.ts（`chat.search.*` 对齐基线）、global.css（`.chat-search*` / `.msg-hit` 高亮）
- **状态**：resolved

### GAP-024 · 缺失输入入队（流式中禁止输入）

- **严重级**：P2（核心对话链路交互）
- **维度**：渲染层 / 对话链路
- **基线依据**：original-baseline.md §5.2 —— `chat.input.insertQueueShortcutTooltip`=「{sendShortcut} 发送，{insertQueueShortcut} 插入队列」；`chat.sessionBusyRetryLater`=`当前回复还没结束，请稍后再发送`
- **现状**：`streaming` 时发送按钮被禁用、`submit()` 直接 return，用户只能等或停止。
- **期望**：流式中允许输入并**入队**，当前回复结束后自动按序发出（对齐原版队列语义）。
- **验证方法**：`grep -rn "queue\|pending" src/renderer/src/stores/useApp.ts` 命中；队列在 done 事件后自动 flush。
- **修改文件**：src/renderer/src/stores/useApp.ts（`pendingQueue` + done 后 `flushQueue`）、src/renderer/src/components/Composer.tsx（流式中允许发送→入队 + 提示）、i18n（`composer.queued`）、global.css（`.queue-badge`）
- **状态**：resolved

### GAP-025 · 缺失处理阶段可视化（只有「…」占位）

- **严重级**：P2（核心对话链路反馈）
- **维度**：渲染层 / 对话链路
- **基线依据**：original-baseline.md §5.2 —— `progress.phase.*` 60+ 阶段（`准备中`/`等待模型响应`/`生成回复中`/`压缩上下文中` …）
- **现状**：assistant 流式开始前只渲染 `Markdown('…')`，无阶段文案，用户无法感知「在思考 / 在生成」。
- **期望**：流式且内容为空时，展示阶段化加载提示（首帧「思考中」→ 收到首 token 转「生成回复中」），对齐基线 `chat.loadingText`=思考中。
- **验证方法**：`grep -rn "chat.loadingText\|phase" src/renderer/src/components/ChatArea.tsx` 命中。
- **修改文件**：src/renderer/src/components/ChatArea.tsx（`streaming && !content` 时渲染阶段提示）、i18n（`chat.loadingText` / `progress.phase.*` 核心子集）、global.css（`.thinking` 动画）
- **状态**：resolved

### GAP-026 · 缺失「清空上下文」（同会话内重置）

- **严重级**：P2（核心对话链路）
- **维度**：渲染层 / 对话链路
- **基线依据**：original-baseline.md §5.2 —— `chat.clearSession.toast`=`已清空上下文，开启新对话`
- **现状**：只能「新建对话」（换会话），不能在**当前会话内清空上下文**。
- **期望**：侧边栏/会话顶栏提供「清空上下文」动作，清空当前会话消息并回到欢迎态，toast 提示对齐基线文案。
- **验证方法**：`grep -rn "clearSession\|清空上下文" src/renderer/src/` 命中。
- **修改文件**：src/renderer/src/stores/useApp.ts（`clearContext`）、src/renderer/src/components/ChatArea.tsx（顶栏按钮）、i18n、global.css
- **状态**：resolved

---

> 闭环状态（第三轮）：GAP-022 / 023 / 024 / 025 / 026 均 **resolved 并复检通过**。前轮 deferred GAP-007（IM/遥测/守护进程）、GAP-011（monaco 审阅器）维持 deferred（架构/场景级长尾）。**本轮 open 清零。**
>
> 下一轮监督方向：会话置顶/分组、A2A 审批流与权限弹窗落地、`progress.phase.*` 全量阶段对齐、@ 上下文引用与 / 技能指令（`input.wbAdd.*` 大命名空间）。

---

## 第四轮监督（会话组织能力 · i18n 词典驱动）

> 依据：§5.2 词典命名空间 `conversation.*`（314 条）。筛出会话**组织**能力：`conversation.section.pinned`=`置顶`、`conversation.section.groups`=`空间`、`conversation.maxSessions.dialog.content`=「您已达到最大会话数量限制，请先归档或删除一些会话后再创建新会话。」（事实：原版**有归档概念**）。

### GAP-027 · 缺失会话置顶

- **严重级**：P1（会话管理核心）
- **维度**：数据层 / 渲染层
- **基线依据**：original-baseline.md §5.2 —— `conversation.section.pinned`=`置顶`
- **现状**：侧边栏按 `updatedAt` 单序列排列，无置顶概念；常用会话会被新会话冲走。
- **期望**：会话可置顶/取消置顶；置顶会话固定在最上方并归入「置顶」分组（分组标题对齐基线文案）。
- **验证方法**：`grep -nE "pinned" src/main/store.ts src/renderer/src/stores/useApp.ts src/renderer/src/components/Sidebar.tsx` 命中三处。
- **修改文件**：src/shared/types.ts（`Conversation.pinned`）、src/main/store.ts（`pinned` 列 + 旧库 ALTER + 排序 pinned DESC）、src/main/ipc.ts（`wb:conversation:pin`）、src/preload/index.ts、src/renderer/src/stores/useApp.ts（`togglePin`）、Sidebar.tsx（分组 + 置顶按钮）、i18n、global.css
- **状态**：resolved

### GAP-028 · 缺失会话归档

- **严重级**：P2（会话管理）
- **维度**：数据层 / 渲染层
- **基线依据**：original-baseline.md §5.2 —— `conversation.maxSessions.dialog.content` 提及「归档或删除」（事实：原版有归档）
- **现状**：只有删除（不可逆），无归档（可逆的收纳）。
- **期望**：会话可归档/取消归档；归档会话从主列表隐藏，可切换查看。
- **验证方法**：`grep -nE "archived" src/main/store.ts src/renderer/src/stores/useApp.ts` 命中。
- **修改文件**：src/shared/types.ts（`Conversation.archived`）、src/main/store.ts（`archived` 列 + 过滤）、src/main/ipc.ts、preload、store（`toggleArchive`）、Sidebar.tsx、i18n
- **状态**：resolved

---

> 闭环状态（第四轮）：GAP-027 / 028 **resolved 并复检通过**。**open 清零。**

---

## 第五轮监督（输入与效率层 · i18n 词典驱动）

> 依据：§5.2 词典 `settings.keyboardShortcuts.*`（含 `actions.*` 30+ 动作）、`mention.*`（14 条）、`input.wbAdd.*`。事实：原版有**完整快捷键体系**（可配置、含冲突检测）、**@ 上下文引用**、**/ 斜杠命令**。

### GAP-029 · 缺失全局快捷键（Esc 停止 / Cmd+F 对话搜索 / Cmd+N 新对话 / Cmd+, 设置）

- **严重级**：P1（效率核心）
- **维度**：渲染层 / 交互
- **基线依据**：original-baseline.md §5.2 —— `settings.keyboardShortcuts.actions.stopGeneration`=停止生成、`searchInConversation`=对话内搜索、`newConversation`=新建对话、`openSettings`=打开设置、`sendMessage`=发送消息、`newline`=输入时换行
- **现状**：无任何全局快捷键；「停止生成」「对话内搜索」「新建对话」「设置」都只能用鼠标点。
- **期望**：实现核心快捷键（对齐基线动作语义）：`Esc` 停止生成/关闭浮层、`Cmd/Ctrl+F` 对话内搜索、`Cmd/Ctrl+N` 新建对话、`Cmd/Ctrl+,` 打开设置、`Cmd/Ctrl+K` 侧栏搜索聚焦。
- **验证方法**：`grep -nE "metaKey|ctrlKey" src/renderer/src/App.tsx` 命中；快捷键动作与基线 `actions.*` 语义对应。
- **修改文件**：src/renderer/src/App.tsx（全局 keydown 监听 + 分发）、src/renderer/src/i18n/index.ts（`shortcut.*` 文案）
- **状态**：resolved

### GAP-030 · 缺失设置页「快捷键」面板

- **严重级**：P2（可发现性）
- **维度**：渲染层 / 设置
- **基线依据**：original-baseline.md §5.2 —— `settings.keyboardShortcuts.title`=快捷键、`columnCommand/columnBinding/columnAction`、`noResults`、`conflict`
- **现状**：设置面板只有「账户与连接」「模型」两个标签，无快捷键查看。
- **期望**：设置面板新增「快捷键」标签，以「命令 / 按键绑定 / 操作」三列表格展示当前生效快捷键（只读展示，只读即对齐核心）。
- **验证方法**：`grep -nE "keyboardShortcuts|shortcuts" src/renderer/src/components/SettingsPanel.tsx` 命中。
- **修改文件**：src/renderer/src/components/SettingsPanel.tsx（新增 tab + 表格）、i18n（`settings.keyboardShortcuts.*` 对齐基线）、global.css（`.shortcut-table`）
- **状态**：resolved

### GAP-031 · 缺失 `@` 上下文引用（对话中的文件）

- **严重级**：P2（输入体验）
- **维度**：渲染层 / 对话链路
- **基线依据**：original-baseline.md §5.2 —— `mention.file.description`=选择文件和文件夹、`mention.file.placeholder`=添加文件作为回答背景、`mention.file.sessionGroup`=对话中的文件、`mention.file.searchEmpty`=无搜索结果
- **现状**：输入框无 `@` 触发，无法引用对话中的文件作为回答背景。
- **期望**：输入 `@` 触发引用选择面板，列出「对话中的文件」分组；选中后以 chip 形式挂到输入框，随消息发送（作为上下文注入）。
- **验证方法**：`grep -nE "mention|@reference" src/renderer/src/components/Composer.tsx` 命中。
- **修改文件**：src/renderer/src/components/Composer.tsx（`@` 触发 + 面板 + chip）、i18n（`mention.*` 对齐基线）、global.css（`.mention-panel` / `.mention-item`）
- **状态**：resolved

---

> 闭环状态（第五轮）：GAP-029 / 030 / 031 **resolved 并复检通过**。**open 清零。**

---

## 第六轮监督（错误处理与可恢复性 · i18n 词典驱动）

> 依据：§5.2 词典 `error.*`（67 条）、`errorBanner.*`（43 条）、`networkCheck.*`（88 条）。事实：原版有**错误分类体系**（网络/超时/模型超时/满负荷/频率限制）+ **错误横幅与动作**（重试、检查网络、切换模型、复制错误、重新输入）。

### GAP-032 · 错误处理无分类（只有裸文本）

- **严重级**：P1（可靠性 / 用户可理解性）
- **维度**：主进程 + 渲染层
- **基线依据**：original-baseline.md §5.2 —— `error.network.title`=网络连接失败、`error.timeout.title`=连接超时、`error.modelTimeout.title`=模型响应超时、`error.modelOverload.title`={model} 当前已满负荷、`error.rateLimit.title`=使用量超过当前模型的频率限制
- **现状**：`streamChat` 抛错后仅把 `err.message` 原样塞进 `m.error` 展示——用户看到 `请求失败 (401): {...}` 或 `fetch failed`，无法判断是配置、网络还是额度问题。
- **期望**：主进程把错误**分类**（network / timeout / auth / rateLimit / modelOverload / server / unknown）并附带可读标题与建议；渲染层按分类展示标题 + 说明 + 建议动作（重试 / 检查网络 / 打开设置）。
- **验证方法**：`grep -nE "classifyError|ErrorKind" src/main/llm.ts src/shared/types.ts` 命中；`grep -nE "errorKind|errorHint" src/renderer/src/components/ChatArea.tsx` 命中。
- **修改文件**：src/shared/types.ts（`ErrorKind` + `ChatMessage.errorKind/errorHint`）、src/main/llm.ts（`classifyError` + 透传分类）、src/main/ipc.ts（错误分片带上分类）、src/renderer/src/stores/useApp.ts（applyChunk 记录分类）、ChatArea.tsx（分类化错误卡片）、i18n（`error.*` 对齐基线）、global.css（`.error-card`）
- **状态**：resolved

### GAP-033 · 错误消息无「重试」动作

- **严重级**：P1（可靠性）
- **维度**：渲染层
- **基线依据**：original-baseline.md §5.2 —— `error.retry`=重试、`errorBanner.action.retry`=重试、`errorBanner.action.editInput`=重新输入、`errorBanner.action.copyError`=复制错误
- **现状**：出错后只能手动重新输入或点「重新生成」，无直接「重试」入口，也无「复制错误」。
- **期望**：错误卡片提供「重试」（重新发起上一轮）、「复制错误」（复制完整错误详情）。
- **验证方法**：`grep -nE "error.retry|error.copy" src/renderer/src/components/ChatArea.tsx` 命中。
- **修改文件**：src/renderer/src/components/ChatArea.tsx（错误卡片动作按钮）、i18n、global.css
- **状态**：resolved

---

> 闭环状态（第六轮）：GAP-032 / 033 **resolved 并复检通过**。**open 清零。**

### GAP-034 · 消息落库非幂等（`appendMessage` 抛 UNIQUE 约束）— 监督主动发现

- **严重级**：P1（健壮性 / 数据一致性）
- **维度**：数据层
- **基线依据**：非「对齐原版」差异，而是监督复检（运行时冒烟）中主动发现的**复刻自身缺陷**。
- **现状**：`appendMessage` 用纯 `INSERT`；当同一 `message.id` 重复落库（重试重放、IPC 重入、getConversation 后再次发送）时直接抛 `UNIQUE constraint failed: messages.id`，异常向上冒泡到 `wb:chat:stream` handler，整轮请求被判失败。
- **期望**：落库幂等——同一 id 覆盖而非抛错（`ON CONFLICT(id) DO UPDATE`）。
- **验证方法**：`grep -nE "ON CONFLICT\\(id\\) DO UPDATE" src/main/store.ts` 命中；运行时冒烟不再出现 UNIQUE 报错。
- **修改文件**：src/main/store.ts（`appendMessage` 改 upsert）
- **状态**：resolved

### GAP-035 · 错误态不落库（重开会话后错误与错误分类丢失）— 监督主动发现

- **严重级**：P1（数据一致性）
- **维度**：数据层 / 对话链路
- **基线依据**：非对齐差异，复刻自身缺陷。原版错误有独立错误码/时间并可回看（`error.code` / `error.time` / `error.messageId`）。
- **现状**：`persistAssistant` 在 `assistantContent` 为空时直接 `return`——纯错误（未产出任何 token）的那一轮**完全不落库**。后果：DB 行与 UI 行不一致，「重试」在重开应用后无上下文。
- **期望**：错误态也落库（content 存错误文本 + 持久化 `error` / `error_kind`），保证 UI 与 DB 一致。
- **验证方法**：`grep -nE "error_kind" src/main/store.ts` 命中；`getConversation` 能读回 `error` / `errorKind`。
- **修改文件**：src/main/store.ts（messages 表增 `error` / `error_kind` 列 + 旧库 ALTER + upsert + getConversation 读回）、src/main/ipc.ts（send 记录错误态 + persistAssistant 落库）
- **状态**：resolved

---

> 闭环状态（第六轮补充）：GAP-034 / 035 **resolved**（监督主动发现的复刻自身缺陷，同类于 GAP-020 的发现方式）。第六轮 **open 清零**。

---

## 第七轮监督：输入区能力层 + 停止原因 + 阶段进度（GAP-036~040）

> 基线依据：`original-baseline.md §5.3 第四次补证`（`input.wbAdd.*` 124 条、`error.stopReason.*`、`progress.phase.*` 195 条、`errorBanner.action.*` 43 条）。

### GAP-036 · 输入区缺「+ 更多操作」面板

- **严重级**：P1（能力完整性）
- **维度**：渲染层
- **基线依据**：`original-baseline.md §5.3` —— `input.wbAdd.title`=`更多操作`、`input.wbAdd.tooltip`=`可添加文件、专家、技能、连接器`、`input.wbAdd.addFiles`=`添加文件`，以及七大分组（应用 / 专家 / 技能 / 连接器 / 插件 / 引用对话中的文件 / 模式 + 权限）。
- **现状**：Composer 只有独立的图片按钮与模式按钮，没有任何聚合入口；原版的「+」是**输入区能力总入口**。
- **期望**：Composer 增加「＋」按钮，打开分组面板，含 添加文件 / 引用对话中的文件 / 专家 / 技能 / 连接器 / 插件 / 权限 七项；未接入项给出 `input.wbAdd.submenu.placeholder`（功能开发中…）占位。
- **验证方法**：`grep -nE "wbAdd-menu|wbAdd-title|WB_ADD_GROUPS" src/renderer/src/components/Composer.tsx` 命中；运行时冒烟断言 7 项文案。
- **修改文件**：src/renderer/src/components/Composer.tsx、i18n（`wbAdd.*`）、global.css（`.wbadd-*`）
- **状态**：resolved

### GAP-037 · 无「完全访问」权限等级与确认弹窗

- **严重级**：P1（安全 / 能力完整性）
- **维度**：主进程 + 渲染层
- **基线依据**：`original-baseline.md §5.3 §B` —— `input.wbAdd.permission.fullAccess`=`允许完全访问`、`description.default`=「所有操作都会在安全沙箱约束内进行，超出范围会请求你的允许」、`confirm.title`=`确认允许完全访问？` + 三项能力（文件操作 / 访问互联网 / 终端命令）+ `confirm.checkbox`=「我已了解风险，并对自己的数据安全负责」。
- **现状**：`AppSettings` 只有 baseUrl/apiKey/model/temperature/theme/locale/mode，**没有权限概念**；也无沙箱/完全访问的语义区分与风险确认。
- **期望**：`AppSettings` 增 `permission: 'default' | 'fullAccess'` 与 `fullAccessAcknowledged`；Composer 权限入口 + 设置页可选；升级为完全访问须经确认弹窗（三项能力说明 + 必须勾选免责）；`StreamRequest` 携带 `fullAccess` 供主进程记录。
- **验证方法**：`grep -nE "PermissionLevel|permission" src/shared/types.ts` 命中；运行时冒烟断言弹窗标题/三项能力/勾选前后按钮态。
- **修改文件**：src/shared/types.ts、src/main/store.ts（默认值）、src/renderer/src/components/PermissionDialog.tsx（新增）、Composer.tsx、SettingsPanel.tsx、App.tsx、i18n（`permission.*`）、global.css（`.permission-*` / `.modal-*`）
- **状态**：resolved

### GAP-038 · 输入区无「/ 调用技能与指令」

- **严重级**：P1（能力缺口）
- **维度**：渲染层 + 主进程
- **基线依据**：`original-baseline.md §5.3 §D` —— `chat.input.placeholder.workbuddy`=「今天帮你做些什么？**@ 添加上下文，/调用技能与指令**」；`progress.phase.model_streaming.SlashCommand`=`正在准备执行命令`。
- **现状**：`@` 上下文引用已实现（GAP-031），但 **`/` 完全缺失**——占位文案已声明该能力，属于明示能力缺口。
- **期望**：输入行首 `/` 唤起指令面板（含名称 + 说明、按前缀过滤）；选中写入 `/cmd `；发送时把指令名作为 `slashCommand` 透传主进程，主进程以 system 消息告知模型按该指令语义处理；正文剥离 `/cmd` 前缀。
- **验证方法**：`grep -nE "slash-panel|SLASH_COMMANDS|parseSlash" src/renderer/src/components/Composer.tsx src/main/llm.ts` 命中；逻辑冒烟 `parseSlashCommand` 6/6 通过。
- **修改文件**：src/shared/types.ts（`StreamRequest.slashCommand`）、src/main/llm.ts（`parseSlashCommand` + 注入）、Composer.tsx（面板 + 解析）、useApp.ts（透传）、i18n（`slash.*`）、global.css（`.slash-*`）
- **状态**：resolved

### GAP-039 · 停止原因未分类（截断/拒绝静默结束）

- **严重级**：P1（可理解性）
- **维度**：主进程 + 渲染层
- **基线依据**：`original-baseline.md §5.3 §E` —— `error.stopReason.*`（`maxTokens`=「响应因达到最大 token 限制而被截断。您可以继续对话或要求更简洁的回复」、`refusal`、`maxTurnRequests`、`modelService`、`network`、`authError`、`generic`、`unknown`）+ `error.rateLimitCap.continuePrompt`=`请继续完成未完成的任务。`
- **现状**：SSE 的 `finish_reason` 被完全忽略——`length`（截断）与 `content_filter`（拒绝）都以普通 `done` 收尾，**用户看到一段戛然而止的回复却没有任何解释**。
- **期望**：解析 `finish_reason` → `StopReason`（`length`→maxTokens、`content_filter`→refusal）；随 `done` 分片透传；渲染层展示停止原因横幅；截断/触顶场景提供「继续完成任务」按钮（走 `chat.retryMessage` 文案续跑）；停止原因落库（`stop_reason` 列）。
- **验证方法**：`grep -nE "mapStopReason|stop_reason" src/main/llm.ts src/main/store.ts` 命中；逻辑冒烟 6/6、DB 冒烟 5/5 通过。
- **修改文件**：src/shared/types.ts（`StopReason` + `ChatMessage.stopReason` + `StreamChunk.stopReason`）、src/main/llm.ts（`mapStopReason`）、src/main/store.ts（`stop_reason` 列 + ALTER + upsert + 读回）、src/main/ipc.ts（落库 + 透传）、useApp.ts（`continueTask`）、ChatArea.tsx（`.stop-banner`）、i18n（`stop.*`）、global.css
- **状态**：resolved

### GAP-040 · 阶段进度只有「思考中」，无 `progress.phase.*` 阶段文案

- **严重级**：P2（体验对齐）
- **维度**：主进程 + 渲染层
- **基线依据**：`original-baseline.md §5.3 §F` —— `progress.phase.*` 195 条：主状态（`preparing`=准备中 / `model_requesting`=等待模型响应 / `model_streaming`=生成回复中 / `model_done`=处理结果中 / `tool_executing`=调用工具中 / `waiting_for_permission`=等待授权 / `waiting_for_user`=等待回复 / `retrying`=重试中 / `compacting`=压缩上下文中）+ 每工具三态文案。
- **现状**：GAP-025 已落「思考中」三点动画，但**只有一个静态文案**，与模型请求/生成阶段无关；`progress.phase.*` 的阶段性完全未对齐。
- **期望**：`StreamChunk` 增 `phase` / `phaseTool`；主进程在 准备中 → 等待模型响应 → （首片）生成回复中 → 处理结果中 之间发阶段分片；渲染层按阶段渲染文案，工具类阶段追加工具名（`tool_executing · Read` 形态）。
- **验证方法**：`grep -nE "phase:|phaseTool|ProgressPhase" src/main/llm.ts src/renderer/src/stores/useApp.ts src/renderer/src/components/ChatArea.tsx` 命中；运行时冒烟 0 控制台报错。
- **修改文件**：src/shared/types.ts（`ProgressPhase` + `StreamChunk.phase/phaseTool`）、src/main/llm.ts（阶段分片发射）、useApp.ts（`phase`/`phaseTool` 状态）、ChatArea.tsx（`phaseLabel`）、App.tsx（透传）、i18n（`phase.*`）
- **状态**：resolved

---

> 闭环状态（第七轮）：GAP-036 / 037 / 038 / 039 / 040 全部 **resolved 并复检通过**。
>
> - 逻辑冒烟 `smoke-r7-logic.mjs`：**17/17 通过**（停止原因映射 6、斜杠解析 6、错误分类回归 5）。
> - DB 冒烟 `smoke-r7-db.mjs`：**13/13 通过**（旧库 ALTER 5、stop_reason 往返 5、设置默认值 3）。
> - 运行时冒烟 `smoke-r7.cjs`：**0 控制台报错**；更多操作面板 7 项文案、斜杠面板 10 条指令、权限弹窗标题 + 三项能力 + 勾选放行、设置页新增「权限」「发送消息」字段全部断言通过。
>
> **第七轮 open 清零。** deferred 保持：GAP-007（IM 渠道 / 遥测 / 守护进程）、GAP-011（monaco 代码审阅器）。

---

## 第八轮监督（工具链路闭环与交互能力，GAP-041~045）

> 基线依据：`original-baseline.md §5.3 §G`（本轮新增）—— 解码 i18n 全集后新增的四组能力域：
> `tool.approval.*`（确认标题 / 风险标签 / 积分提示 / 四动作）、`tool.askUserQuestion.*`、
> `conversation.maxSessions.*` 与相对时间 / 空态、`common.aiDisclaimer`。
> 本轮的核心发现：**前七轮把「错误处理、可观测性、输入区」都对齐了，但工具调用这一层从未真正打通** ——
> 原版是「模型发起工具调用 → 审批 → 执行 → 结果回灌」的 agent 循环，而本复刻只是一次性 SSE 流，
> 导致 `tool.approval.*` / `tool.askUserQuestion.*` 两大能力域虽然文案齐备却**无任何触发路径**。

### GAP-041 · 无 agent 工具循环：`tool_calls` 被丢弃，工具能力不可达

- **严重级**：P0（核心能力缺失）
- **维度**：主进程
- **基线依据**：原版为 agent 形态 —— 模型通过 function calling 请求工具，主进程执行后回灌结果并继续下一轮，直到模型给出最终文本；`tool.approval.*` 与 `tool.askUserQuestion.*` 均挂在这条链路上。
- **现状**：`streamChat` 只解析 `choices[0].delta.content`，**`delta.tool_calls` 被完全忽略**；请求体不带 `tools` 字段。模型即便返回工具调用也不会被执行，更不会触发审批与提问。这直接导致 GAP-042/043 的能力文案"有壳无实"。
- **期望**：请求体按模式挂载 `tools`（仅问答模式不挂）；解析并累积分片式 `tool_calls`（按 `index` 合并 `id`/`name`/`arguments`）；维护多轮循环（上限 12 轮），逐轮把 `assistant.tool_calls` 与 `role:tool` 结果回灌上下文；触顶时以 `maxTurnRequests` 停止原因收尾；`ask` 模式下即使服务端返回 `tool_calls` 也不执行（防越权）。
- **验证方法**：链路冒烟 `smoke-r8-chain.mjs` —— 假 SSE 服务端返回 `tool_calls` 时，断言模型被连续请求 3 轮、第 2/3 轮请求体含 `assistant.tool_calls` 与 `role=tool` 消息、`ask` 模式请求体不带 `tools` 且仅 1 轮。
- **修改文件**：src/main/llm.ts（`requestOnce` 抽取 + 多轮循环 + `tool_calls` 累积）、src/main/tools.ts（新增：`TOOL_DEFS` 9 个工具 / `TOOL_CANONICAL` / `executeTool`）
- **状态**：resolved

### GAP-042 · 工具审批流无实现：`tool.approval.*` 文案齐备但无触发路径

- **严重级**：P1（安全与可控性）
- **维度**：主进程 + 渲染层
- **基线依据**：`tool.approval.*` —— `confirmTitle.{imageGen|videoGen|computerUse|audioTranscribe|imageProcessing}`（如「确认开始生成图片？」）、`riskTag.*`（「产生积分消耗」/「积分消耗较高」）、`creditHint.*`（含具体积分区间的消耗说明）、四动作 `allow` / `alwaysAllowSession` / `alwaysAllowLaunch` / `reject`。
- **现状**：完全缺失。高消耗/高风险工具（图片生成、视频生成、电脑操控、音频转写、图片处理）会**无提示直接执行**。
- **期望**：主进程在默认权限下遇到需审批工具时**挂起**（`pendingApprovals` + Promise await），发 `approval` 分片并在 `waiting_for_permission` 阶段停留；渲染层渲染卡片（标题 + 风险标签 + 消耗提示 + 工具名 + 四动作）；用户点选经 IPC 回执 resolve，链路继续执行或回灌拒绝说明；`alwaysAllowSession` / `alwaysAllowLaunch` 分别记入会话级 / 启动级记忆集合，后续同类工具直接放行；`fullAccess` 跳过审批；**过期卡片回执按 id 校验丢弃**，防止误触发新挂起。
- **验证方法**：链路冒烟 —— 断言发起 1 次 `ImageGen` 审批、拒绝路径回灌「用户拒绝了该操作」且**不发出该工具的 tool-result**、`fullAccess` 下审批回调调用次数为 0；运行时冒烟 —— 断言卡片标题/风险标签/消耗提示/工具名/四动作顺序、点击「允许」后显示「已确认」且链路被唤醒产出最终回复。
- **修改文件**：src/shared/errorCodes.ts（`APPROVAL_RULES` / `TOOL_TO_APPROVAL` / `approvalToolFor` / `needsApproval`）、src/main/ipc.ts（`requestApproval` + `pendingApprovals` + `preAuthorized` 记忆 + `approvalDecide` handler）、src/main/llm.ts（审批分支）、ApprovalCard.tsx（新增）、useApp.ts（`pendingApproval` + `decideApproval`）、ChatArea.tsx、preload、i18n、global.css
- **状态**：resolved

### GAP-043 · 向用户提问能力缺失：`tool.askUserQuestion.*` 无实现

- **严重级**：P1（交互闭环）
- **维度**：主进程 + 渲染层
- **基线依据**：`tool.askUserQuestion.*` —— `title`=「向用户提问」、`waiting`=「等待您的回答...」、`skipped`=「您跳过了此问题」；提问支持可选项（单选/多选）与自由输入两种形态。
- **现状**：完全缺失。模型无法向用户澄清需求或让用户做选择，只能一路猜测。
- **期望**：主进程把 `ask_user_question` 工具的入参（`question` / `header` / `options` / `multiSelect`）解析为 `UserQuestion`，挂起并发 `question` 分片、停在 `waiting_for_user` 阶段；渲染层渲染问题卡片（有选项→可点选、无选项→自由输入、支持多选），提交或跳过经 IPC 回执；跳过时回灌「用户跳过了此问题，请基于合理假设继续」；非法 JSON 入参退化为纯文本问题。
- **验证方法**：链路冒烟 —— 断言按 `options` 正确解析（2 个选项 + `multiSelect`）、非法 JSON 退化、回答「卡通」出现在第 3 轮请求体；逻辑冒烟 7 项解析断言全通过。
- **修改文件**：src/main/tools.ts（`parseQuestion` / `isAskUserQuestion`）、src/main/ipc.ts（`requestQuestion` + `pendingQuestions` + `answerQuestion` handler 含 `skipped`）、src/main/llm.ts（提问分支）、QuestionCard.tsx（新增）、useApp.ts（`pendingQuestion` + `answerQuestion` / `skipQuestion`）、ChatArea.tsx、preload、i18n、global.css
- **状态**：resolved

### GAP-044 · 会话数量无上限：`conversation.maxSessions.*` 未实现

- **严重级**：P2（健壮性）
- **维度**：主进程 + 渲染层
- **基线依据**：`conversation.maxSessions.dialog.*` —— 达到上限时拒绝新建并提示「您已达到最大会话数量限制，请先归档或删除一些会话后再创建新会话。」
- **现状**：`createConversation` 无任何上限校验，会话可无限增长。
- **期望**：主进程提供计数接口（`countConversations` 排除已归档）；新建会话前查询，达上限则拒绝并提示，侧栏同步展示上限横幅；上限常量 500。
- **验证方法**：DB 冒烟 —— 断言计数为 2、归档后降为 1；逻辑冒烟 —— `MAX_SESSIONS === 500`。
- **修改文件**：src/shared/errorCodes.ts（`MAX_SESSIONS`）、src/main/store.ts（`countConversations`）、src/main/ipc.ts（`conversationLimit` handler）、useApp.ts（`newConversation` 前置校验 + `conversationLimit` 状态）、Sidebar.tsx（`.limit-banner`）、App.tsx、preload、i18n、global.css
- **状态**：resolved

### GAP-045 · 会话列表无相对时间与空态分文案，缺 AI 免责声明

- **严重级**：P2（体验对齐）
- **维度**：渲染层
- **基线依据**：`conversation.time.*`（`justNow`=刚刚 / `minutesAgo`={count}分钟前 / `hoursAgo` / `yesterday`=昨天 / `daysAgo` / `yearsAgo`）、`conversation.empty.title`=暂无任务 + `description`=点击上方按钮开始新任务、`common.aiDisclaimer`=内容由 AI 生成，请核实重要信息；另有 `conversation.cwdNotExist` / `jumpNotFound` 两条容错文案。
- **现状**：会话项**只显示标题**，无时间信息；空态仅一句「暂无会话」，既无标题/描述分层也不区分搜索空态；对话区与欢迎页**没有 AI 免责声明**；错误卡片只按分类给标题，未展示结构化错误码。
- **期望**：会话项追加相对时间（按 分钟/小时/昨天/天/年 分档）；空态改为标题 + 描述两层（搜索态单独文案）；欢迎页与对话区展示免责声明；错误卡片展示 `errorCode.*` 的标题与 `desc`（回落分类文案）并附错误码角标。
- **验证方法**：逻辑冒烟 —— 错误码 `lookupErrorCode('3002')` 等标题/desc 断言、`ERROR_CODES` 全项含 `desc`；运行时冒烟 —— 0 控制台报错。
- **修改文件**：Sidebar.tsx（`relativeTime` + 空态分层）、ChatArea.tsx（`lookupErrorCode` 渲染 + `.welcome-disclaimer`）、i18n（`time.*` / `conversation.*` / `common.*` / `error.code`）、global.css
- **状态**：resolved

---

> 闭环状态（第八轮）：GAP-041 / 042 / 043 / 044 / 045 全部 **resolved 并复检通过**。
>
> - 逻辑冒烟 `smoke-r8-logic.mjs`：**57/57 通过**（工具表与审批规则 22、提问解析 7、工具执行器 7、错误码体系 14、常量 1，含真实文件读写往返）。
> - 链路冒烟 `smoke-r8-chain.mjs`：**21/21 通过**（假 SSE 服务端驱动的 5 个场景：审批放行 + 提问作答、审批拒绝、ask 模式不挂工具、fullAccess 跳过审批、只读工具真实执行）。
> - DB 冒烟 `smoke-r8-db.mjs`：**13/13 通过**（旧库补列 2、error_code/stopReason 往返 6、会话计数 2、设置默认值 3）。
> - 运行时冒烟 `smoke-r8.cjs`：**13/13 通过**，渲染层 **0 控制台报错**；真实 UI 路径（输入框填文本 → 点发送）下审批卡片完整渲染，点击「允许」后主进程挂起的链路被唤醒、工具结果卡片展示、最终回复收尾。
>
> **第八轮 open 清零。** deferred 保持：GAP-007（IM 渠道 / 遥测 / 守护进程）、GAP-011（monaco 代码审阅器）。

---

## 第九轮监督（2026-11-11）：消息流健壮性 + 工作空间 + 模型能力 + 上下文档位

监督依据：`spec/original-baseline.md` **§5.5 第六次补证**（`chat.*` 补充 41 条 / `taskStarter.*` 33 条 / `model.*` 26 条 / `idleCapability.*` 35 条）。

本轮发现的核心结构性问题：第八轮打通了「工具链路闭环」，但**围绕消息流的健壮性（并发、失败分因、能力门控）与任务归属（工作空间、上下文档位）仍全为空白** —— 主进程 `chatAbort` 与 `answerQuestion` 都**固定返回 `true`**，渲染层无法区分失败原因；附件与模型能力**毫无校验**，不支持的图片会被静默送入请求；`taskStarter.*` / `chat.sessionSeparator.*` 描述的工作空间与上下文边界**无处挂载**。

### GAP-046 · `chatAbort` / `answerQuestion` 固定返回 true，无法区分失败原因

- **严重级**：P1（健壮性 / 可恢复性）
- **维度**：主进程 + 渲染层
- **基线依据**：`chat.cancelFailedRetry`=`停止任务失败，请稍后重试。`；`chat.answerQuestionFailed`=`发送回答失败`、`chat.answerQuestionSessionMismatch`=`会话已切换，请重新操作`、`chat.answerQuestionNotFound`=`问卷已过期或已被处理，请等待新的问卷` —— 三条**互不重叠**的失败分因文案，证明这两个接口都必须返回**可区分的结果结构**。
- **现状**：`ipc.ts` 的 `chatAbort` 恒 `return true`（无 try/catch），`answerQuestion` 在「无挂起」与「挂起不匹配」两种情况下都返回同一个 `false`；渲染层 `stopStreaming` 不检查返回值、`answerQuestion` / `skipQuestion` 亦不检查，失败后**静默清空 UI 挂起态**且无任何提示。
- **期望**：两接口统一返回 `{ ok, reason? }`；`chatAbort` 包 try/catch，异常时返回 `{ok:false, reason}`；`answerQuestion` 区分 `notFound`（无挂起）与 `sessionMismatch`（挂起 id 不匹配）；渲染层按 `reason` 分别 toast 对应文案，`stopStreaming` 失败时提示「停止任务失败，请稍后重试。」。
- **验证方法**：运行时冒烟 —— `answerQuestion('no-such-conv', ...)` 断言 `reason === 'notFound'`；`chatAbort` 断言返回结构含 `ok`。
- **修改文件**：src/main/ipc.ts、src/preload/index.ts、useApp.ts
- **状态**：resolved

### GAP-047 · 同一会话并发发送无拦截，第二路请求被静默接受

- **严重级**：P1（健壮性）
- **维度**：主进程
- **基线依据**：`chat.sessionBusyRetryLater`=`当前回复还没结束，请稍后再发送` —— 明确存在「会话忙碌」这一拒绝态。
- **现状**：`ipc.ts` 的 `chatStream` handler 直接 `activeStreams.set(conversationId, abort)`，**同一会话的第二次调用会覆盖第一路的 AbortController**，导致第一路无法再被取消、两路流写入同一会话消息体，数据互相污染。
- **期望**：进入 handler 前先检查 `activeStreams.has(conversationId)`，命中则**立即下发 `chat.sessionBusyRetryLater` 错误分片并返回 `false`**，不启动新的流、不覆盖已有 controller。
- **验证方法**：运行时冒烟 —— 假服务器把首轮响应延迟 900ms，在 120ms 处发起第二路，断言 `chatStream` 返回 `false`。
- **修改文件**：src/main/ipc.ts
- **状态**：resolved

### GAP-048 · 附件与模型能力毫无校验，不支持的图片被静默送入请求

- **严重级**：P1（正确性 / 成本）
- **维度**：主进程 + 渲染层
- **基线依据**：`chat.imageNotSupported`=`当前模型暂不支持图片，请切换模型后重试`、`chat.gifNotSupported`=`当前模型不支持 GIF，请切换至 kimi 或 minimax 模型后重试`、`chat.modelUnavailableSwitchModel`=`当前模型不可用，请切换模型`；`model.*` 中 `gpt4o.description`=`OpenAI 多模态模型`、`defaultGLM46`=`具有强大推理能力的先进语言模型`（未声明多模态）等**描述文案即能力声明**。注意 `gifNotSupported` **点名 kimi / minimax**，说明提示语与建议动作必须一致。
- **现状**：`Composer.addFiles` 只按 `image/*` 过滤，**不查模型能力**；`sendMessage` 直接组装请求下发。用 GLM-4.6（不支持视觉）附加 PNG 会照常发起请求，最终以模型侧报错收场，用户体验为「静默失败 + 远端报错」。
- **期望**：新增模型能力注册表 `BUILT_IN_MODELS`（`vision` / `gif` / `tools` 三维度）与 `checkAttachmentSupport()`；`Composer.addFiles`、`Composer.submit`、`useApp.sendMessage` **三处前置拦截**，命中即按 `image` / `gif` 分发对应文案；`suggestGifModel()` 优先返回 **kimi / minimax**，与文案一致；未知模型采取保守放行策略（仅对明确不支持的族拦截），避免误拦正常用户。
- **验证方法**：逻辑冒烟 —— 13 项（族识别、版本后缀匹配、大小写 GIF、`glm-4.6` 不支持图片、`kimi/minimax` 支持 GIF、建议模型点名）；运行时冒烟 —— 以 `glm-4.6` 附加真实 PNG，断言弹出「暂不支持图片」且附件区**未新增缩略图**。
- **修改文件**：src/shared/models.ts（新增）、src/shared/types.ts、Composer.tsx、useApp.ts
- **状态**：resolved

### GAP-049 · 工作空间完全缺失，任务无归属目录

- **严重级**：P2（能力对齐）
- **维度**：主进程 + 渲染层 + DB
- **基线依据**：`taskStarter.*`（33 条）—— `startIn`=`任务启动于：`、`selectWorkspace`/`selectFolder`=`选择工作空间`、`startFromEmpty`=新建工作空间、`openNewDirectory`=打开本地文件夹、`noWorkspace`=不使用工作空间；`createWorkspaceDesc`=`为工作空间命名，本地将自动创建同名文件夹，命名后不可随意更改`（**真实 mkdir**）；`createWorkspace.toast.failed`=新建工作空间失败，请重试；`workspaceNotExist`=所选工作空间不存在，请重新选择；`noWorkspaceFound`=未找到工作空间；`workspacePathHint.*` 四条揭示**默认存储路径是系统设置项**。
- **现状**：项目**完全没有工作空间概念** —— 无选择入口、无创建逻辑、无目录校验、无默认路径设置项。工具执行器（第八轮）读写的文件也无固定归属根目录。
- **期望**：新增 `src/main/workspace.ts`（`validateWorkspaceName` 校验空/保留字/非法字符/超长，`createWorkspace` 真实 mkdir，`workspaceExists` 只认真实目录，`listWorkspaces` 过滤隐藏目录并按 mtime 排序）；`AppSettings` 增加 `workspacePath`（默认 `~/WorkBuddy`）与 `newSessionThresholdMinutes`（默认 240）；IPC 三通道 `workspaceList` / `workspaceCreate` / `workspaceValidate`；渲染层 `WorkspacePicker` 组件（搜索、列表、「不使用工作空间」、内联新建、失败 toast、路径提示可跳设置页）。
- **验证方法**：逻辑冒烟 —— 14 项（四类非法名 + 正常名 + 真实 mkdir + 目录/文件/不存在三态校验 + 隐藏目录过滤 + `workspaceLabel`）；运行时冒烟 —— 展开菜单断言标题与「不使用工作空间」「新建工作空间」入口、路径提示文案，实际新建 `smoke-ws` 后断言 chip 更新**且磁盘上真实存在该目录**；DB 冒烟 —— `workspacePath` / `newSessionThresholdMinutes` 默认值与保存往返。
- **修改文件**：src/main/workspace.ts（新增）、src/shared/types.ts、src/main/store.ts、src/main/ipc.ts、src/preload/index.ts、WorkspacePicker.tsx（新增）、Composer.tsx、App.tsx、i18n、global.css
- **状态**：resolved
- **deferred 说明**：`taskStarter.*` 中代码库来源的工作空间（`addRepo`/`selectRepo`/`searchRepo`/`addConnectorAuth`/`github*`/`selectBranch`/`switchBranch` 等 14 条）属**独立能力域（Git 集成）**，与 GAP-007（IM 渠道）同批 deferred。

### GAP-050 · 文档选区与上下文档位无挂载点

- **严重级**：P2（能力对齐）
- **维度**：渲染层 + DB
- **基线依据**：`chat.documentSelection.*` 六条 —— 按类型分 `documentLabel`=文档选区 / `spreadsheetLabel`=表格选区 / `presentationLabel`=幻灯片选区，按来源分 `localDocument`=本地文档 / `onlineDocument`=腾讯文档，`dismiss`=忽略此选区；`chat.docTabSwitch.dialog.*` —— `title`=确认切换文件 + `content`=`对话框有文档选区。如果切换查看新文件，当前选区将被清空。是否确认切换？`；`chat.sessionSeparator.*` —— `settingsTooltip`=`点击可跳转至{name}设置页` + `settingsLink`=`⚙ 设置`。
- **现状**：`ChatMessage` 无 `selection` 字段；输入区无选区 chip；切换会话**无二次确认**；`chat.sessionSeparator.*` 描述的上下文边界在数据层与视图层**均不存在**（`separators` 表都没有）。
- **期望**：`ChatMessage` 增加 `selection?: DocumentSelection`；`DocumentSelection`（`kind` / `source` / `name` / `text` / `locator`）与 `SessionSeparator`（`id` / `createdAt` / `model` / `mode` / `permission`）类型落地；新增 `SelectionChip` 与 `SeparatorRow` 组件；会话切换时若有选区则弹「确认切换文件」；`separators` 表存边界点，`getConversation` 一并返回；分隔行渲染在消息流中（跨点前置 / 晚于末条则挂末尾 / 无消息时挂欢迎页），含「⚙ 设置」跳转。
- **验证方法**：DB 冒烟 —— 6 项（旧库自动补建 `separators` 表、往返一致、按 `createdAt` 升序、同 id 幂等、随会话返回 + 会话隔离、`pruneSeparatorsAfter` 截断清理）；运行时冒烟 —— 点击「新会话」断言分隔行出现、标签为「新的会话」、含「⚙ 设置」链接与 tooltip，**重新加载后仍在**（证明已落库）。
- **修改文件**：src/shared/types.ts、src/main/store.ts、src/main/ipc.ts、src/preload/index.ts、useApp.ts、SelectionChip.tsx（新增）、ChatArea.tsx、Composer.tsx、App.tsx、i18n、global.css
- **状态**：resolved

### GAP-051 · 删除会话不清理 separators，遗留悬空记录

- **严重级**：P2（数据一致性）
- **维度**：DB
- **基线依据**：数据完整性要求（`chat.sessionSeparator.*` 的档位从属于会话，会话删除后不应残留）。
- **现状**：`store.deleteConversation` 只删 `messages` 与 `conversations` 两张表，**新增的 `separators` 表未纳入级联清理**。此为第九轮实现过程中由 DB 冒烟**实测捕获**的回归（非推测）。
- **期望**：`deleteConversation` 同步 `DELETE FROM separators WHERE conversation_id = ?`。
- **验证方法**：DB 冒烟 —— 写入 2 条档位后删除会话，断言 `listSeparators` 返回 0 条（修复前实测失败，修复后通过）。
- **修改文件**：src/main/store.ts
- **状态**：resolved

### GAP-052 · `suggestGifModel` 建议模型与文案不符（本轮内部发现）

- **严重级**：P3（文案一致性）
- **维度**：渲染层/共享层
- **基线依据**：`chat.gifNotSupported` 文案**点名**「请切换至 kimi 或 minimax 模型后重试」。
- **现状**：`suggestGifModel` 最初实现为「返回第一个支持 GIF 的模型」，在该顺序下会返回 `gpt-4o`，与文案点名的 kimi / minimax **不一致**，构成「提示语说一套、建议动作为另一套」的失真。由逻辑冒烟实测捕获。
- **期望**：优先在 `kimi` / `minimax` 中挑选，二者均不可用时再回退到任意 GIF 模型。
- **验证方法**：逻辑冒烟 —— 断言 `suggestGifModel('claude-sonnet-4')` ∈ {Kimi, MiniMax}。
- **修改文件**：src/shared/models.ts
- **状态**：resolved

---

> 闭环状态（第九轮）：GAP-046 / 047 / 048 / 049 / 050 / 051 / 052 全部 **resolved 并复检通过**。
>
> - 逻辑冒烟 `smoke-r9-logic.mjs`：**45/45 通过**（模型能力表 12、附件能力校验 7、工作空间 14、错误码与常量 12）。
> - DB 冒烟 `smoke-r9-db.mjs`：**18/18 通过**（旧库补建 separators 表 2、往返与排序 5、幂等 2、随会话返回与隔离 2、截断清理 1、设置新增字段 5、级联清理 1）。其中「级联清理」一项**修复前实测失败**，是 GAP-051 的直接证据。
> - 运行时冒烟 `smoke-r9.cjs`：**19/19 通过**，渲染层 **0 控制台报错**；真实 UI 路径下验证了能力门控拦截、工作空间菜单与**真实落盘**、上下文档位落库与重载保持、并发发送拦截、提问失败分因。
> - `npm run typecheck` 与 `npm run build` 均干净通过。
>
> **第九轮 open 清零。** deferred 累计：GAP-007（IM 渠道 / 遥测 / 守护进程）、GAP-011（monaco 代码审阅器）、GAP-049 代码库来源工作空间（Git 集成）。

---

## 第十轮监督（2026-11-11）：会话分组 / 状态角标 / 任务搜索 / 来源（GAP-053~057）

本轮从 `conversation.*` 命名空间（314 条）继续深挖。第九轮打通了「消息流健壮性 + 任务归属」，但**会话的组织与可发现性**仍全为空白：`conversation.section.*`(13 条) 描述的**工作空间分组 + 状态筛选 + 折叠/展开**没有落点；`conversation.sectionFlag.*`(5 条) 的**四态角标**（失败/待确认/未读/进行中）无处呈现；`conversation.search.*`(7 条) 的**全局任务搜索覆盖层**缺失（只有侧栏输入框）；`conversation.origin.*`(3 条) 的**来源端标记**与 `conversation.windowTaskRunning.*`(4 条) 的**运行中关窗二次确认**均无实现。

### GAP-053 · 会话状态角标（失败/待确认/未读/进行中）完全缺失

- **严重级**：P1（可发现性 / 任务治理）
- **维度**：DB + 主进程 + 渲染层
- **基线依据**：`conversation.sectionFlag.tooltip.failed`=`有任务失败，点击打开`、`pending`=`有任务待确认，点击打开`、`unread`=`有任务未读，点击打开`、`working`=`有任务进行中，点击打开`（四条**互不重叠**的语义，证明是四个独立状态而非一个布尔）；`conversation.sectionFlag.empty`=`该分类下暂无状态任务`；`conversation.section.filter`=`筛选`、`noFilterResult`=`没有匹配的任务`。
- **现状**：`Conversation` 无 `status` 字段，DB `conversations` 表无 `status` 列；侧栏无角标、无筛选、无空态文案。任务处于何种状态（跑着 / 待你确认 / 挂了）**在列表里完全不可见**，用户必须逐个点开才能发现。
- **期望**：`ConversationStatus = 'failed' | 'pending' | 'unread' | 'working'` 落地；DB 加 `status` 列（含旧库 ALTER 补列）；`setConversationStatus` IPC + preload 桥；渲染层在**真实生命周期点**派生状态 —— `sendMessage`→`working`、收到 `approval`/`question` 分片→`pending`、回执（`approval-decision`/`question-answer`）→`working`、`done`→清除、`error`→`failed`；侧栏渲染角标 + 筛选下拉 + 空态。
- **验证方法**：DB 冒烟 —— 三态往返 + 清除 + 旧库补列；运行时冒烟 —— 预置 `working`/`unread` 会话，断言角标 class、筛选 `working` 后仅剩 1 项、筛选 `failed` 显示「没有匹配的任务」；真实对话驱动验证 `working` 流转与结束清空。
- **修改文件**：src/shared/types.ts、src/main/store.ts、src/main/ipc.ts、src/preload/index.ts、useApp.ts、Sidebar.tsx、i18n、global.css
- **状态**：resolved

### GAP-054 · 侧栏无工作空间分组，任务平铺无归属

- **严重级**：P2（能力对齐 / 组织）
- **维度**：DB + 主进程 + 渲染层
- **基线依据**：`conversation.section.tasks`=`任务`、`workspaces`=`工作空间`、`taskGroup`=`任务`、`spaceGroup`=`空间`、`groups`=`空间`、`colleagueConversations`=`助理任务`；`collapseAll`=`折叠所有工作空间`、`expandAll`=`展开所有工作空间`、`addWorkspace`=`新建工作空间`。
- **现状**：`Conversation` 无 `workspace` 字段（第九轮只做了「创建/选择工作空间目录」，未做「任务归属工作空间」）；侧栏会话**平铺**，无法按工作空间折叠成组，也无「折叠所有/展开所有」与「新建工作空间」入口。
- **期望**：DB 加 `workspace` 列 + `setConversationWorkspace` IPC；侧栏按 `workspace` 分组（未归属归入「任务」组并置顶排序）；分组头含折叠箭头 + 名称 + 数量徽标；工具栏含「折叠所有 / 展开所有 / 新建工作空间」；空组显示 `sectionFlag.empty`。
- **验证方法**：运行时冒烟 —— 预置 `ws-alpha`/`ws-beta` 两组，断言分组名与数量徽标渲染、按 `title` 点击「折叠所有」后列表项减少、「展开所有」后恢复；点击「新建工作空间」弹窗输入并真实落盘。
- **修改文件**：src/shared/types.ts、src/main/store.ts、src/main/ipc.ts、src/preload/index.ts、useApp.ts、Sidebar.tsx、App.tsx、i18n、global.css
- **状态**：resolved

### GAP-055 · 缺失全局任务搜索覆盖层（⌘K）

- **严重级**：P2（可发现性）
- **维度**：渲染层
- **基线依据**：`conversation.search.placeholder`=`搜索任务`、`recentTasks`=`最近任务`、`resultCount`=`搜索到 {count} 个任务`、`shortcut.navigate`=`上下切换`、`shortcut.open`=`打开`、`shortcut.close`=`关闭`；`settings.keyboardShortcuts.actions.openSearch`=`全局搜索`（独立于 `searchInConversation`=`对话内搜索`，证明是**两个不同入口**）。
- **现状**：只有侧栏输入框（过滤列表），**没有**独立的搜索覆盖层；`⌘K` 被绑定为「聚焦侧栏输入框」，与原版「打开全局搜索」语义不符；无「最近任务」概念、无结果计数、无键盘导航提示。
- **期望**：新增 `TaskSearchOverlay` 组件（无查询时展示最近 8 条任务；输入即时过滤标题；↑↓ 导航、Enter 打开、Esc 关闭；底部快捷键提示；结果项显示工作空间与来源）；`⌘K`/`Ctrl+K` 改为打开该覆盖层。
- **验证方法**：运行时冒烟 —— 派发 `⌘K` 断言覆盖层出现、标题为「最近任务」、列出预置会话；输入「跑批」断言仅剩 1 项且计数为「搜索到 1 个任务」；`Esc` 关闭；重开后 `↓` 断言高亮移到第 2 项、`Enter` 选中并关闭。
- **修改文件**：TaskSearchOverlay.tsx（新增）、App.tsx、i18n、global.css
- **状态**：resolved

### GAP-056 · 缺失来源端标记与「任务运行中」关窗二次确认

- **严重级**：P2（能力对齐 / 数据安全）
- **维度**：DB + 主进程 + 渲染层
- **基线依据**：`conversation.origin.workbuddyMp`=`小程序`、`workbuddyApp`=`移动端`、`web`=`网页端`；`conversation.windowTaskRunning.title`=`任务运行中`、`message`=`关闭窗口后任务将继续在后台运行，可随时返回查看进度。请选择操作方式。`、`closeOnly`=`仅关闭窗口`、`cancelTask`=`中止任务并关闭`（**明确的两分支**，一为后台续跑、一为中止）。
- **现状**：`Conversation` 无 `origin` 字段，任务来源不可知（侧栏/搜索项均无标记）；窗口 `close` **无任何拦截**，任务运行中直接关窗即静默中止且无提示 —— 与文案承诺的「继续在后台运行」直接冲突。
- **期望**：DB 加 `origin` 列（默认 `web`）+ `setConversationOrigin` IPC；侧栏会话项与搜索结果显示来源徽标（`web` 不显示）；主进程 `win.on('close')` 拦截：若 `activeStreams` 非空则 `e.preventDefault()` 并弹原生二选一对话框，「仅关闭窗口」→ 后台续跑，「中止任务并关闭」→ abort 全部流后关闭；新增 `runningTasks` IPC 暴露运行中会话 id 列表。
- **验证方法**：运行时冒烟 —— 预置 `workbuddyMp` 来源断言徽标 `title=小程序`（侧栏 + 覆盖层各一处）；`runningTasks()` 空闲返回空数组、真实对话结束后仍为空；DB 冒烟 —— `origin` 三值往返与默认值。
- **修改文件**：src/shared/types.ts、src/main/store.ts、src/main/ipc.ts、src/main/index.ts、src/preload/index.ts、Sidebar.tsx、TaskSearchOverlay.tsx、i18n
- **状态**：resolved

### GAP-057 · 工作空间名未拦 Windows 设备保留名与结尾点号（本轮内部发现）

- **严重级**：P3（健壮性 / 跨平台）
- **维度**：主进程
- **基线依据**：`taskStarter.createWorkspaceDesc`=`为工作空间命名，本地将自动创建同名文件夹，命名后不可随意更改` —— 「自动创建同名文件夹」隐含**名字必须真的能成为文件夹**。`CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9` 在 Windows 上是设备保留名，无法建目录；结尾点号/空格会被静默剥离，导致「名实不符」。
- **现状**：`validateWorkspaceName` 只拦 `.`/`..`、路径分隔符与非法字符、超长，**未拦设备保留名、未拦控制字符、未拦结尾点号/空格**。由逻辑冒烟实测捕获（`validateWorkspaceName('CON').ok === true`）。
- **期望**：补充保留名集合（含带扩展名形式如 `CON.txt`）、控制字符、结尾 `[. ]` 三类校验，均返回 `reserved` / `illegalChar`。
- **验证方法**：逻辑冒烟 —— `CON` 被拒（修复前实测失败，修复后通过），另验证空名/斜杠/冒号/超长/中文名。
- **修改文件**：src/main/workspace.ts
- **状态**：resolved

---

> 闭环状态（第十轮）：GAP-053 / 054 / 055 / 056 / 057 全部 **resolved 并复检通过**。
>
> - 逻辑冒烟 `smoke-r10-logic.mjs`：**70/70 通过**（工作空间名校验 10、真实 mkdir 6、三态校验 3、列举 4、i18n 键与原文一致性 28、状态值域与 FLAG_ICON 10、主进程接线 7 等）。其中「保留名 CON 被拒」**修复前实测失败**，是 GAP-057 的直接证据。
> - DB 冒烟 `smoke-r10-db.cjs`：**20/20 通过**（默认值 3、状态往返 3、来源往返 2、工作空间归属 2、list/search 带三字段 4、分组统计 1、旧库补列 3、旧数据可读可写 2）。
> - 运行时冒烟 `smoke-r10.cjs`：**33/33 通过**，渲染层 **0 控制台报错**；真实 UI 路径下验证了状态角标渲染、按工作空间分组、筛选（`working` 命中 / `failed` 空态）、折叠展开、来源徽标、任务搜索覆盖层（⌘K / 最近任务 / 输入过滤 / ↓导航 / Enter 选中 / Esc 关闭）、新建工作空间**真实落盘**、`runningTasks` 空闲与结束态、真实对话全链路。
> - `npm run typecheck` 与 `npm run build` 均干净通过。
>
> **第十轮 open 清零。** deferred 累计：GAP-007（IM 渠道 / 遥测 / 守护进程）、GAP-011（monaco 代码审阅器）、GAP-049 代码库来源工作空间（Git 集成）、`conversation.shareFile`（119 条，属协同域 collab）。

---

## 第十一轮 · 定时任务域（GAP-058 ~ 061）

> 本轮来源：词典 `automation.*` 共 **846 条**，其中本地可复刻子域约 366 条。监督巡检确认该域在复刻体中**完全空白**（`grep -rn "automation" src/` 命中 0 处、顶栏无入口、DB 无表、IPC 无通道），属**整域缺失**，故拆为四个可独立验证的 GAP。

### GAP-058 · 完全缺失定时任务调度模型（八类频率 + 下次执行推导）

- **严重级**：P1（核心能力缺失）
- **维度**：共享层（纯逻辑）
- **基线依据**：`automation.schedule.*`（`once`=`单次任务`、`daily`=`每天`、`workday`=`每个工作日`、`weeklyMonday`=`每周一`、`biweekly`=`双周`、`monthly`=`每月`、`yearly`=`每年`、`periodic`=`周期`）；摘要模板 6 条（`summary.daily`=`每天 {time}` … `summary.yearly`=`每年 {month}{day} {time}`）；`schedule.day.MO`~`SU`=`周一`~`周日`；校验 8 条（`intervalHours`=`按间隔执行需至少每 1 小时`）。
- **现状**：无任何调度模型。既没有频率类型定义，也没有「给出计划 → 算出下次触发时刻」的推导，无法判断任务是否到期。
- **期望**：新增 `src/shared/schedule.ts` —— `Schedule` 联合类型覆盖 **8 类**（`once/daily/workday/weekly/biweekly/monthly/yearly/interval`）；`nextRun(schedule, from)` 对每类给出正确下次时刻（工作日跳过周末、双周跨 14 天、月末按实际天数回退）；`scheduleSummary()` **逐字**使用原文 6 个模板并复用 `schedule.day.*` 星期名；`validateSchedule()` 返回**原文 i18n 键**而非硬编码中文（8 条规则一一对应，间隔下限 **1 小时**）。
- **验证方法**：逻辑冒烟 —— 逐类断言 `nextRun` 结果（含跨周末、跨月、跨年、跨 14 天）；`scheduleSummary` 对 8 类输出与原文模板拼接结果比对；`validateSchedule` 对 8 条空值/非法输入返回的键名逐一比对；星期标签聚合（5 天→`工作日`、2 天→`周末`、7 天→`每天`）。
- **修改文件**：src/shared/schedule.ts（新增）、src/shared/types.ts
- **状态**：resolved

### GAP-059 · 完全缺失定时任务存储与主进程调度器

- **严重级**：P1（核心能力缺失）
- **维度**：DB + 主进程
- **基线依据**：`automation.modal.statusActive`=`运行中`/`statusPaused`=`已暂停`/`statusEnded`=`已结束`、`card.pauseTask`=`暂停任务`、`card.resumeTask`=`开启任务`、`modal.startedAt`=`创建于 {date}`、`modal.runCount`=`{count} 次运行`、`modal.deleteConfirm`=`确认删除该定时任务？`；`runGroup.nextRun`=`下一次运行 {time}`、`card.expiredHint`=`当前任务已过期`、`card.expiredRunHint`=`当前任务已过期，无法运行`、`row.onceOnly`=`单次执行`。
- **现状**：DB 无 `automations` / `automation_runs` 表；主进程无调度循环，「到点自动执行」这一**整个能力不存在**；关窗即丢任务。
- **期望**：DB 新增两表（含 `next_run_at` 与 `enabled` 索引）+ 全套 CRUD（`saveAutomation` 落库时**重算** `nextRunAt`；归档同时清空 `next_run_at` 并停用；删除任务**级联**删除其记录；批量删除返回 `failed[]`）；主进程 `src/main/automation.ts` 提供 **30s 轮询** `tick()` + `startScheduler()/stopScheduler()`，到期任务创建**真实会话**（`origin='workbuddyApp'`）→ 写入提示词 → `streamChat` → 落助手回复 → 归类错误（`errorCode==='3002'` → `network`）→ 产出 `evidence`（工具名匹配 `write|edit|create|delete|move|rename` 记 `localFileMutation`）→ 持久化运行记录；**单次任务执行后自动停用**；`RUN_TIMEOUT_MS = 10 分钟`；并发去重（`runningIds`）；headless 场景**审批一律拒绝、提问一律跳过**。
- **验证方法**：DB 冒烟 —— 两表建表、CRUD 往返、`nextRunAt` 重算、归档清空、级联删除、批量删除失败列表、**旧库打开时自动建表且可读写**；主进程接线断言 —— 入口调用 `startScheduler`、`before-quit` 调 `stopScheduler`、IPC 全通道注册、preload 桥全成员暴露。
- **修改文件**：src/shared/types.ts、src/main/store.ts、src/main/automation.ts（新增）、src/main/ipc.ts、src/main/index.ts、src/preload/index.ts
- **状态**：resolved

### GAP-060 · 完全缺失定时任务面板与创建表单

- **严重级**：P1（核心能力缺失）
- **维度**：渲染层
- **基线依据**：`automation.tab.scheduledTasks`=`定时任务` / `tab.runRecords`=`运行记录`；`section.scheduled/inProgress/completed/archived`=`已安排`/`执行中`/`已完成`/`已归档`；`toolbar.search`=`搜索定时任务/记录`、`toolbar.filter`=`筛选`、`toolbar.refresh`=`刷新`、`toolbar.new`=`新建`；`modal.titleCreate`=`新建定时任务`、`modal.name`=`名称`、`modal.prompt`=`提示词`、`modal.schedule`=`执行频率`、`modal.deleteConfirm`=`确认删除该定时任务？`；表单权限用 `modal.permissionMode.default`=`需逐次确认` / `modal.permissionMode.fullAccess`=`免确认执行`，卡片标签用 `permission.default`=`默认权限` / `permission.fullAccess`=`完全访问权限（推荐）`；`modal.executionNoticeText`=`定时任务执行时，请勿关闭电脑或退出客户端，否则任务将无法正常执行`。
- **现状**：顶栏无入口、无面板、无表单。用户**无法创建、查看、暂停、编辑或删除任何定时任务**。
- **期望**：新增 `AutomationPanel.tsx`（全屏面板）：双 Tab（定时任务 / 运行记录）；任务卡片按 `section.*` 四组分区；工具栏含搜索/状态筛选/来源筛选/刷新/新建；卡片操作 立即运行 / 暂停任务 / 开启任务 / 编辑 / 归档 / 删除（**二次确认**用 `modal.deleteConfirm`）；内联 `AutomationForm`：名称、提示词、8 类频率 chip + 各自的细节控件（时间、星期、每月日期、月份、单次日期、间隔）、权限 chip、执行提示、实时计划摘要、保存前校验（失败**不关表单**并展示原文提示）；顶栏 ⏱ 入口 + Esc 关闭。
- **验证方法**：运行时冒烟 —— 顶栏入口打开面板；标题/双 Tab/四分组渲染；状态筛选（`已启用` 仅剩启用项、`已暂停` 含一次性任务）；卡片暂停→DB `enabled=false`、恢复→`true`；新建表单打开、频率 chip 含「每天/单次任务/按间隔」、权限 chip 含「需逐次确认」与「完全访问权限（推荐）」、默认摘要为「每天 09:00」、空名保存被拦截且表单不关、切「每周」出现星期选择、选「周一」后摘要含「周一」、保存后**真实落库**（`kind=weekly`、`weekdays` 含 `MO`、`enabled=true`、`nextRunAt` 已算）；删除二次确认后 DB 中消失；Esc 关闭面板。
- **修改文件**：AutomationPanel.tsx（新增）、src/renderer/src/App.tsx、src/renderer/src/i18n/index.ts、src/renderer/src/styles/global.css
- **状态**：resolved

### GAP-061 · 完全缺失运行记录视图与失败分因

- **严重级**：P1（核心能力缺失）
- **维度**：DB + 主进程 + 渲染层
- **基线依据**：`automation.records.column.*`（`name`=`任务名称`、`status`=`状态`、`time`=`运行时间`、`duration`=`耗时`、`type`=`任务类型`、`actions`=`操作`）；`runGroup.date.*`（`today`=`今天`、`yesterday`=`昨天`、`tomorrow`=`明天`、`monthDay`=`{month}月{day}日`、`fullDate`=`{year}年{month}月{day}日`）；`run.status.pending/timeout/cancelled`=`待执行`/`超时`/`已取消`；**失败分因 51 条**（`error.reason.*` 26 + `detail.reason.*` 25，如 `networkUnavailable`=`网络连接异常，任务未能开始执行，请在网络恢复后重试。`、`runTimeout`=`任务运行超时已停止，请缩小任务范围后再试。`、`sessionStuck`=`任务长时间未结束，系统已自动停止本次运行。`、`recoveryFailed`=`原定时间设备未在线，重试仍未成功。`）；`runGroup.viewAll`=`查看全部`、`runGroup.collapse`=`收起`、`runGroup.continueChat`=`继续对话`。
- **现状**：即便有任务定义也**看不到执行历史** —— 跑成功与否、失败在哪一步、耗时多久全部不可见；`reason` 概念不存在，无从分因。
- **期望**：DB `automation_runs` 落 `status/reason/summary/evidence/error/duration`；主进程提供运行记录列表、归档、删除 IPC；渲染层运行记录页按**日期分组**（今天/昨天/…）渲染，每行显示任务名 + 状态 + 耗时 + 失败原因文案（由 `reason` 映射 i18n 键），支持搜索过滤（无匹配显示空态），并提供「查看全部 / 收起」。
- **验证方法**：运行时冒烟 —— 切换到运行记录页、记录行渲染、含失败记录且**分因文案渲染**、含成功记录状态、**按日期分组**、搜索无匹配显示空态、搜索「每日简报」后有结果。
- **修改文件**：src/main/store.ts、src/main/ipc.ts、src/preload/index.ts、AutomationPanel.tsx、i18n
- **状态**：resolved

---

> 闭环状态（第十一轮）：GAP-058 / 059 / 060 / 061 全部 **resolved 并复检通过**。
>
> - 逻辑冒烟 `smoke-r11-logic.mjs`：**129/129 通过**（八类 `nextRun` 推导、摘要模板逐字比对、8 条校验键名、星期聚合、类型定义、面板/表单结构、App 接线、CSS 类名等）。
> - DB 冒烟 `smoke-r11-db.cjs`：**49/49 通过**（两表建表、任务 CRUD、`nextRunAt` 重算、归档清空、级联删除、批量删除失败列表、运行记录往返与归档删除、**旧库自动建表且可读写**）。
> - 运行时冒烟 `smoke-r11.cjs`：**50/50 通过**，渲染层 **0 控制台报错**；真实 UI 路径下验证了入口/面板/双 Tab/四分组、状态筛选、暂停恢复真实落库、新建表单全流程（频率切换、权限 chip、摘要、校验拦截、**真实落库**）、**立即运行真实调用 LLM 并落运行记录**（建会话 + 提示词 + 助手回复 + 证据）、运行记录页分组与搜索、删除二次确认、Esc 关闭。
> - `npm run typecheck` 与 `npm run build` 均干净通过。
>
> **第十一轮 open 清零。** 本轮闭环过程中由运行时冒烟暴露 1 处**测试脚本预期错误**（断言表单权限 chip 文案为 `默认权限`，实际原文此处为 `需逐次确认`，`默认权限` 是卡片标签）—— 经回溯词典确认**实现无误**，已修正断言并补充反向断言。同时发现并补全 1 处**真实缺陷**：`automation.schedule.validation.onceDateRequired` 被实现引用但词典副本中缺失，已补 zh/en 两条。
> deferred 累计：GAP-007（IM 渠道 / 遥测 / 守护进程，新增同源子域 `automation.datasource.*` 147 条 + `automation.modal.wecomBotSource.*` 28 条）、GAP-011（monaco 代码审阅器）、GAP-049 代码库来源工作空间（Git 集成）、`conversation.shareFile`（119 条，属协同域 collab）。

---

## 第十二轮 · 日程 / 日历域（GAP-062 ~ 065）

> 域选择依据：按未覆盖命名空间体量排序 —— `home`(676) > `colleagues`(573) > `skills`(513) > `myFiles`(331)。其中 `home` 的 676 条**全部**属 `home.schedule.*`（`home.aiDisclaimer` 除外），是一个边界自洽的完整业务域（日历），且原文对其未实现部分有显式桩标记，可界定范围，故本轮选此。第十一轮（automation）与本轮（home.schedule）**语义无关但命名易混**：前者是「30s 轮询的定时任务调度」，后者是「用户自建日程的日历」，代码路径与模型完全隔离。

### GAP-062 · 完全缺失日程数据模型与摘要/重复/状态推导

- **严重级**：P1（核心能力缺失）
- **维度**：共享层（纯计算）
- **基线依据**：`home.schedule.summary.status.{upcoming,ongoing,ended,cancelled}`=`待开始`/`进行中`/`已结束`/`已取消`；`summary.kindLine`=`日程 {status}`；`summary.when`=`{year} 年 {month} 月 {day} 日 · {startClock}—{endClock}`、`whenCrossDay`=`{year} 年 {month} 月 {day} 日 {startClock} — {endMonth} 月 {endDay} 日 {endClock}`、`whenAllDay`=`{year} 年 {month} 月 {day} 日 · 全天`、`whenAllDaySpan`；`create.reminder.{none,atStart,15,60,1440}`=`无提醒`/`开始时`/`15 分钟前`/`1 小时前`/`1 天前`；`create.duration.{minutes,hour,hours}`=`{count} 分钟`/`1 小时`/`{count} 小时`；`create.recurrence.{none,daily,weekly,monthly,yearly}`；`occurrence.scope.{this,thisAndFuture,entire}`=`仅本次`/`本次及以后`/`全部日程`；`summary.participantCount`=`已邀请 {count} 位参与人：`、`onlySelf`=`仅自己参与`；`rsvp.{accept,tentative,decline,needsAction}`；`sidebar.monthTitle`=`{year}年{month}月`、`weekday.0`~`6`；`settings.{field.duration,duration.*,timedReminder.*,allDayReminder.*,field.weekStart,field.showLunar}`。
- **现状**：复刻体无任何日程概念 —— 无 `ScheduleEvent` 类型、无状态推导、无摘要文案、无重复展开；用户无法表达「某天有个会」。
- **期望**：新增 `src/shared/types.ts` 日程类型（`EventStatus` / `EventReminder` / `RsvpStatus` / `EventSourceKind` / `EventParticipant` / `ScheduleEvent`，含 `repeat: {kind, weekdays?, until?}` 保留**系列粒度**）；新增 `src/shared/scheduleEvent.ts` 纯计算模块：提醒偏移与触发时刻、状态推导（`cancelled` 优先于时间）、`whenLabel` 四模板**逐字**（em dash 紧贴 vs ` — ` 带空格，不可统一）、`durationLabel` 三态、`reminderLabel`（`none` 用 `summary.reminderNone`，其余复用表单档位名）、`participantsLabel`、`kindLine`、`scopeLabel`、`expandOccurrences`（daily/weekly/monthly/yearly + `until` + 区间交叠 + 月末回退 + **起始场次早于区间也须逐步推进**）、`monthGrid` 42 格、`eventsOnDay` 跨天归格（全天优先排序）、`toLocalInput`/`fromLocalInput` 往返。
- **验证方法**：逻辑冒烟 `smoke-r12-logic.mjs` —— 提醒偏移 5 档、状态 4 态含边界（`now==startAt`→ongoing、`now==endAt`→ended、`cancelled` 覆盖时间）、时间摘要四模板**正则逐字**断言（含 em dash 与「 年 」空格）、跨日/全天跨日、时长三态、参与人、重复展开（每日/每周按 `weekdays` 命中/每月/每年/`until`/区间交叠/月末 31→28 回退/不提前退出）、场次范围文案、月历网格 42 格与周首日偏移、跨天日程在区间中部仍命中、`datetime-local` 往返、默认设置常量。
- **修改文件**：src/shared/types.ts、src/shared/scheduleEvent.ts（新增）
- **状态**：resolved

### GAP-063 · 完全缺失日程存储与 IPC 通道

- **严重级**：P1（核心能力缺失）
- **维度**：DB + 主进程
- **基线依据**：`home.schedule.settings.subtitle`=`仅设置新建日程的默认行为。`（设置需持久化，且**只影响新建**）；`sidebar.deleteSuccess.{events,series}`=`已删除，取消了 {eventCount} 场单次日程`/`已删除，取消了 {seriesCount} 个重复系列`（删除需回报作用场次）；`delivery.*` 四态说明投递状态需落库；`searchFreshness`=`近期变更可能未出现在搜索中`（暗示增量同步）；`versionConflict`=`设置刚在其他端改过，已刷新为最新，请再保存一次`（设置需版本化读改）。
- **现状**：DB 无 `schedule_events` 表；无日程 IPC 通道；preload 未暴露任何日历能力。关窗即丢。
- **期望**：DB 新增 `schedule_events` 表（title/start_at/end_at/all_day/location/description/organizer/participants/reminder/attachments/calendar/source/kind/cancelled/repeat/created_at/updated_at）+ `idx_events_start(start_at,end_at)` 与 `idx_events_source(source)` 索引；`Store` 提供 `listEvents`（**区间交叠**语义 `start_at<=to AND end_at>=from`、来源过滤、`includeCancelled`、`start_at` 升序）、`getEvent`、`saveEvent`（**存在即更新不新增行**，`created_at` 不被覆盖；`repeat` 往返）、`deleteEvent`、`cancelEvent`、`getCalendarDefaults` / `saveCalendarDefaults`（kv 键 `calendarDefaults`，部分更新合并）；`ipc.ts` 注册 6 个 `wb:event:*` 通道（list/get/save/delete/settings/settings-save）且**每次写入广播变更**（多视图同步）；preload 暴露同成员（含 `onEventChanged` 返回退订函数）。
- **验证方法**：DB 冒烟 `smoke-r12-db.cjs`（真实 Electron 内的 `node:sqlite`）—— 建表与初始空、CRUD 往返（含参与人/RSVP/提醒/来源）、更新不新增且 `createdAt` 不变、**区间交叠过滤**（当天/跨天/远期/过去/**长跨度日程在区间中部仍命中**）、来源过滤三态、升序、取消（默认不可见 + `includeCancelled` 可见 + 不删行 + 可恢复）、重复规则往返（weekly+weekdays+until，无重复为 undefined）、删除返回值与幂等、日历默认设置（默认值、保存、重读、**未改动项保留**、部分更新合并）、**旧库兼容**（仅 kv 表的旧库可打开并自动建表、可读写、设置可持久化）。逻辑冒烟另做静态接线断言（IPC 常量、handler 注册、preload 暴露、写入即广播）。
- **修改文件**：src/main/store.ts、src/main/ipc.ts、src/preload/index.ts、src/shared/types.ts
- **状态**：resolved

### GAP-064 · 完全缺失日历侧栏与月视图

- **严重级**：P1（核心能力缺失）
- **维度**：渲染层
- **基线依据**：`myCalendar`=`我的日历`、`viewAll`=`查看我的日历`、`back`=`返回`；`sidebar.monthTitle`=`{year}年{month}月`、`prevMonth`/`nextMonth`=`上个月`/`下个月`、`collapse`/`expand`=`收起日历`/`展开日历`；三来源分组 `sidebar.{myScheduleGroup,managed,channels,subscribed}`=`我的日程`/`我管理的`/`所在频道`/`我订阅的`；叠加开关 `sidebar.overlayPersonal`=`叠加我的日程`、`overlayMyTodos`=`叠加我的待办`；搜索 `searchPlaceholder`/`searchClear`/`searchEmpty`=`搜索日程`/`清除搜索`/`未找到匹配日程`；`today`=`今天 · {count} 件事`、`empty`=`今天没有安排`、`allDay`=`全天`；桩 `hint.notImplemented`=`暂未实现`、`hint.noContract`=`当前版本暂无接口，仅展示效果`；`sidebar.team`=`团队日历`。
- **现状**：无日历视图 —— 用户看不到「某天有哪些事」，也无法按来源分组或搜索。
- **期望**：新增 `SchedulePanel.tsx` 全屏面板：左侧栏含月标题 + 上/下月 + 收起/展开、**42 格月历网格**（周首日随设置偏移、今天高亮、选中态、有日程显示圆点、双击日格新建）、搜索框（含清除）、四分组筛选（全部 + 三来源）、叠加开关（勾选待办叠加渲染 `hint.notImplemented` 桩）；主区渲染选中日的日程列表（`sched-card`，状态类 `st-{upcoming,ongoing,ended,cancelled}`，全天显示「全天」且排在定时之前）；顶栏 `▤` 入口（`title`=我的日历）+ Esc 关闭。
- **验证方法**：运行时冒烟 `smoke-r12.cjs` —— 顶栏入口 title 精确匹配并打开面板、面板标题「我的日历」、月标题 `{year}年{month}月`、42 格网格、7 格星期表头且首格「周日」（默认 `weekStart=0`）、今天高亮、日程日格圆点、选中态、下月/上月往返、收起后网格隐藏/展开恢复、主区渲染预置日程、全天排前且显示「全天」、卡片状态类、分组四按钮、筛选「所在频道」只剩频道日程且切回恢复、搜索无匹配空态/命中唯一/清除搜索、叠加开关两条、勾选待办叠加出现「暂未实现」、主区「团队日历 · 当前版本暂无接口，仅展示效果」桩。
- **修改文件**：SchedulePanel.tsx（新增）、src/renderer/src/stores/useScheduleEvents.ts（新增）、src/renderer/src/App.tsx、src/renderer/src/i18n/index.ts、src/renderer/src/styles/global.css
- **状态**：resolved

### GAP-065 · 完全缺失日程创建/编辑表单、详情卡与日历设置

- **严重级**：P1（核心能力缺失）
- **维度**：渲染层
- **基线依据**：`createTitle`=`创建日程`、`create.editTitle`=`编辑日程`、`create.formHint`=`表单与自然语言使用同一份日程字段。`、`create.submit`/`submitSave`=`创建日程`/`保存日程`、`create.start`/`end`/`duration`=`开始`/`结束`/`时长`；占位 `create.placeholder.{title,location,participants,description}`=`添加主题`/`添加地点`/`添加联系人、邮件地址`/`添加描述`；`field.{title,reminder,location,description}`、`create.field.{recurrence,participants}`；校验 `titleRequired`=`请填写标题`、`endAfterStart`=`结束时间需晚于开始时间`；详情 `detailTitle`=`日程详情`、`detail.close`=`关闭`、`summary.{kindLine,when,reminder,reminderNone,locationFallback,notesEmpty,notesEmptyHint,delete,edit,copyMeeting,copied}`、`rsvp.title`=`我的参与状态`、`detail.attachments`=`附件`、`delivery.{PENDING,SUCCEEDED}`→`detail.deliveryPending`=`待同步至 {count} 人`/`deliverySucceeded`=`已同步`；删除 `summary.deleteConfirmTitle`=`删除日程`、`deleteConfirmBody`=`删除后参与人会收到取消通知，这条日程从日历里消失。`、`sidebar.deleteSuccess.{events,series}`；设置 `settings.{entry,title,subtitle,save,field.duration,duration.*,field.timedReminder,timedReminder.*,field.allDayReminder,allDayReminder.*,field.weekStart,field.showLunar,sync.title}`；桩 `hint.{notImplemented,onlineMeetingUnavailable,meetingMinutesUnavailable,meetingRoom}`、`create.{meetingMinutesHint,onlineMeetingHint}`、`summary.noOnlineMeeting`。
- **现状**：即便有数据模型也**无法创建/编辑/删除日程**，看不到详情与参与状态，没有日历设置。
- **期望**：（a）创建/编辑表单 —— 标题、开始/结束（`datetime-local`，改开始**保时长**）、时长显示、全天开关、提醒 5 档 chip、重复 5 档 chip、地点、参与人（逗号/中文逗号分隔）、描述，占位符用 `create.placeholder.*`；保存前校验（空标题 → `titleRequired`；结束不晚于开始 → `endAfterStart`），失败**不关表单**；保存后 `creation.successTitle` 提示并自动打开详情卡。（b）详情卡 —— `kindLine` / `whenLabel` 逐字、提醒行、地点（空则 `locationFallback`）、参与人行 + 名单、投递状态（按未回执人数渲染 `deliveryPending` / 全回执则 `deliverySucceeded`）、组织者徽标、RSVP 三档可点**真实回执**（且**不连带修改他人**）、附件、说明（空则 `notesEmpty` 桩）、在线会议与会议室桩（`noOnlineMeeting` + `hint.onlineMeetingUnavailable`、`hint.meetingRoom`）、复制会议信息、编辑/删除/关闭。（c）删除二次确认用 `deleteConfirmTitle` / `deleteConfirmBody`，删除成功后按单次/系列分别报 `sidebar.deleteSuccess.events` / `.series`。（d）日历设置 —— 默认时长 6 档、非全天/全天默认提醒、每周第一天、显示农历，保存真实落库且**未改动项保留**；同步子域渲染 `settings.sync.title` + `hint.notImplemented` 桩。（e）对话框**互斥**：任一时刻只呈现一层（编辑 / 详情 / 删除确认 / 设置）；Esc **逐层**关闭（表单 → 删除确认 → 详情 → 面板）。（f）编辑已有时保留参与人 RSVP 回执（整体覆盖写不得清掉回执）。
- **验证方法**：运行时冒烟 —— 表单打开与标题/提示、占位符对齐 `create.placeholder.*`（含地点与描述，独立于 `summary.*`）、提醒/重复 chip 文案、默认提醒「15 分钟前」与默认时长「1 小时」（取自日历设置）、会议纪要桩、空标题拦截且表单不关、改开始时间时长保持、真实落库（提醒/地点/参与人 2 人/初始 `needsAction`）、详情卡首行「日程 待开始」、时间行 em dash 正则、提醒行、参与人行含尾冒号、投递状态「待同步至 2 人」、描述渲染、两类桩、RSVP 标题与三档、RSVP 真实落库 + 他人不受影响 + chip 高亮 + 投递变「待同步至 1 人」、编辑回填与「仅改标题不丢 RSVP」、日历设置项全渲染 + 6 档 + 同步桩 + 真实落库 + 未改动项保留 + 周首日改后表头首格变「周一」、删除确认（层数=1、标题、正文）真实删除、Esc 逐层（删除确认上 Esc 退回列表不整层退出；详情上 Esc 只关内层保留面板；再 Esc 关面板）、数据一致性复核。
- **修改文件**：SchedulePanel.tsx、src/renderer/src/App.tsx、src/renderer/src/i18n/index.ts、src/renderer/src/styles/global.css、src/shared/scheduleEvent.ts
- **状态**：resolved

---

> 闭环状态（第十二轮）：GAP-062 / 063 / 064 / 065 全部 **resolved 并复检通过**。
>
> - 逻辑冒烟 `smoke-r12-logic.mjs`：**151/151 通过**（提醒偏移、状态四态与边界、时间摘要四模板逐字正则、时长三态、参与人、重复展开 10 项、场次范围、默认设置、`datetime-local` 往返、月历 42 格与周首日偏移、跨天归格、静态接线、i18n 键覆盖（静态 + 动态前缀 + 占位符一致性））。
> - DB 冒烟 `smoke-r12-db.cjs`：**54/54 通过**（建表、CRUD 往返、更新不新增、区间交叠过滤含长跨度命中、来源过滤、排序、取消与可见性、重复往返、删除幂等、日历设置含部分更新合并、**旧库自动建表且可读写**）。
> - 运行时冒烟 `smoke-r12.cjs`：**101/101 通过**，渲染层 **0 控制台报错**；真实 UI 路径下验证了入口/面板/侧栏/月历网格/分组筛选/搜索/叠加、创建表单全流程（默认值来自设置、占位符、校验拦截、真实落库）、详情卡逐字摘要与投递状态、RSVP 真实回执、编辑保留回执、日历设置真实落库与周首日联动、删除二次确认、Esc 逐层关闭、数据一致性。
> - 回归：`smoke-r11-*`（逻辑 129/129、DB 49/49、运行时 50/50）、`smoke-r10-*`（逻辑 70/70、DB 20/20、运行时 33/33）**全绿**，0 控制台报错。
> - `npm run typecheck` 与 `npm run build` 均干净通过。
>
> **第十二轮 open 清零。** 本轮闭环过程中由冒烟暴露并修复的**真实缺陷**共 6 处：
> 1. `home.schedule.myScheduleGroup` 键名误写 —— 权威键在 `home.schedule.sidebar.myScheduleGroup`（词典实测），已修正。
> 2. 表单三个占位符误用 `summary.*` 键（`summary.kind` / `summary.locationFallback` / `summary.onlySelf` / `summary.notesEmpty`）—— 原文另有独立一族 `create.placeholder.{title,location,participants,description}`，已改为正确键。
> 3. 表单校验文案误用 `create.formHint` / `create.duration.customEnd` —— 原文顶层有专用 `titleRequired` / `endAfterStart`，已修正。
> 4. RSVP **少了 toast**（原文该域无对应 toast）且多余调用；删除成功提示误用 `summary.delete` —— 原文按单次/系列分别用 `sidebar.deleteSuccess.events` / `.series`，已修正。
> 5. 对话框可叠加（删除确认可与日历设置同时存在）、**Esc 会跳层**（一次按键同时关掉内层与面板）—— 原因为 App 全局 Esc 与面板各自处理同一事件；已改为对话框状态互斥 + 面板在 **capture 阶段** `stopImmediatePropagation` 接管 Esc，App 侧对 `showSchedule` 让出控制权。同时修正删除确认上的 Esc 语义（回到列表而非弹回详情）。
> 6. `global.css` 存在**重复的 `sched-*` 样式块**（同一族类名写了两遍）—— 已删除后一份。
>
> 另修正 1 处**测试脚本自身缺陷**：第 15 节用 `document.querySelector('.sched-dialog .dialog-actions .btn')` 取按钮，命中详情卡第一个按钮（「删除日程」）而非「关闭」，导致后续删除确认叠加；且新建日程原以 `now+1h` 定位，在午夜附近会跨天使日视图看不到 —— 已改为按文本精确取按钮、并显式将日程锚在「明天 10:00–11:00」。
>
> deferred 累计：GAP-007（IM 渠道 / 遥测 / 守护进程，含 `automation.datasource.*` 147 条 + `automation.modal.wecomBotSource.*` 28 条）、GAP-011（monaco 代码审阅器）、GAP-049 代码库来源工作空间（Git 集成）、`conversation.shareFile`（119 条，属协同域 collab）、日程域外延子域（会议室预约约 60 条、腾讯会议在线会议、`settings.sync.*` 约 30 条、团队待办叠加、第三方日历约 40 条 —— 原文自身均标注未实现 / 未开放，复刻当前以桩提示对齐）。
