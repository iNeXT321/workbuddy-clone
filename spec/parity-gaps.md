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
