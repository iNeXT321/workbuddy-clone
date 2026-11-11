import { app, safeStorage } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type {
  AppSettings,
  Conversation,
  ChatMessage,
  SessionSeparator,
  ConversationOrigin,
  Automation,
  AutomationRun
} from '../shared/types'
import { nextRun } from '../shared/schedule'

/**
 * 本地存储层 —— 对齐 WorkBuddy 本体的 node:sqlite 用法：
 * - node:sqlite（DatabaseSync）
 * - WAL 模式 + synchronous=NORMAL（本体的 openWorkbuddyRawSqliteDatabase 同款 pragma）
 * - safeStorage 加密 API key（本体的 credential-protection 同款思路）
 */

export class Store {
  private db: DatabaseSync
  private settingsRow = 'settings'

  constructor() {
    const dir = join(app.getPath('userData'), 'db')
    mkdirSync(dir, { recursive: true })
    this.db = new DatabaseSync(join(dir, 'workbuddy.db'))

    // 对齐本体：WAL + synchronous=NORMAL
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        status TEXT,
        origin TEXT,
        workspace TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attachments TEXT,
        error TEXT,
        error_kind TEXT,
        stop_reason TEXT,
        error_code TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
      -- 上下文档位（对齐 chat.sessionSeparator.*）：会话内的上下文边界点
      CREATE TABLE IF NOT EXISTS separators (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        model TEXT,
        mode TEXT,
        permission TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_separators_conv ON separators(conversation_id);
      -- 定时任务（对齐 automation.*）：schedule / workspaces / evidence 以 JSON 存储
      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        schedule TEXT NOT NULL,
        permission TEXT,
        delivery_target TEXT,
        workspaces TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        archived INTEGER NOT NULL DEFAULT 0,
        env TEXT,
        last_run_at INTEGER,
        next_run_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_automations_enabled ON automations(enabled);
      -- 定时任务运行记录（对齐 automation.records.* / run.*）
      CREATE TABLE IF NOT EXISTS automation_runs (
        id TEXT PRIMARY KEY,
        automation_id TEXT NOT NULL,
        task_name TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        conversation_id TEXT,
        summary TEXT,
        evidence TEXT,
        error TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        test INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_runs_automation ON automation_runs(automation_id);
    `)

    // 兼容旧库：老版本 messages 表无 attachments 列，补列（ALTER 幂等失败则忽略）
    const cols = this.db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === 'attachments')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN attachments TEXT')
    }
    // 兼容旧库：messages 表补 error / error_kind 列（错误态持久化）
    if (!cols.some((c) => c.name === 'error')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN error TEXT')
    }
    if (!cols.some((c) => c.name === 'error_kind')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN error_kind TEXT')
    }
    // 兼容旧库：messages 表补 stop_reason 列（停止原因持久化）
    if (!cols.some((c) => c.name === 'stop_reason')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN stop_reason TEXT')
    }
    // 兼容旧库：messages 表补 error_code 列（结构化错误码持久化）
    if (!cols.some((c) => c.name === 'error_code')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN error_code TEXT')
    }

    // 兼容旧库：conversations 表补 pinned / archived 列（对齐原版置顶 / 归档）
    const convCols = this.db.prepare('PRAGMA table_info(conversations)').all() as Array<{ name: string }>
    if (!convCols.some((c) => c.name === 'pinned')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
    }
    if (!convCols.some((c) => c.name === 'archived')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
    }
    // 兼容旧库：conversations 表补 status / origin / workspace 列（对齐 sectionFlag / origin / 分组）
    if (!convCols.some((c) => c.name === 'status')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN status TEXT')
    }
    if (!convCols.some((c) => c.name === 'origin')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN origin TEXT')
    }
    if (!convCols.some((c) => c.name === 'workspace')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN workspace TEXT')
    }
  }

  // ---------- 设置 ----------
  getSettings(): AppSettings {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(this.settingsRow) as
      | { value: string }
      | undefined
    const defaults: AppSettings = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      theme: 'dark',
      locale: 'zh-CN',
      mode: 'default',
      // 权限默认走沙箱（对齐 input.wbAdd.permission.description.default）
      permission: 'default',
      fullAccessAcknowledged: false,
      // 发送快捷键默认 Enter（对齐 chat.input.sendShortcutTooltip 的默认值）
      sendShortcut: 'Enter',
      // 工作空间默认放在用户主目录下的 WorkBuddy 工作区（对齐 taskStarter.*）
      workspacePath: join(app.getPath('home'), 'WorkBuddy'),
      // 新开会话建议阈值：默认 240 分钟（对齐 chat.clearSession.idleTimeoutToast 的节流语义）
      newSessionThresholdMinutes: 240
    }
    if (!row) return defaults
    try {
      const parsed = JSON.parse(row.value) as AppSettings
      return { ...defaults, ...parsed }
    } catch {
      return defaults
    }
  }

  saveSettings(s: AppSettings): AppSettings {
    const toStore = { ...s }
    // API key 用 safeStorage 加密后落盘
    if (toStore.apiKey) {
      toStore.apiKey = this.encryptSecret(toStore.apiKey)
    }
    this.db
      .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(this.settingsRow, JSON.stringify(toStore))
    return s
  }

  // 解密 API key，供主进程发请求时使用
  getApiKey(): string {
    const s = this.getSettings()
    if (!s.apiKey) return ''
    return this.decryptSecret(s.apiKey)
  }

  private encryptSecret(plain: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(plain).toString('base64')
    }
    return 'plain:' + plain
  }

  private decryptSecret(stored: string): string {
    if (stored.startsWith('enc:')) {
      try {
        return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
      } catch {
        return ''
      }
    }
    if (stored.startsWith('plain:')) return stored.slice(6)
    return stored
  }

  // ---------- 会话 ----------
  // includeArchived=false 时过滤归档会话；排序：置顶优先，再按更新时间倒序
  listConversations(includeArchived = false): Conversation[] {
    const sql = includeArchived
      ? 'SELECT * FROM conversations ORDER BY pinned DESC, updated_at DESC'
      : 'SELECT * FROM conversations WHERE archived = 0 ORDER BY pinned DESC, updated_at DESC'
    const rows = this.db.prepare(sql).all() as Array<{
      id: string
      title: string
      created_at: number
      updated_at: number
      pinned: number
      archived: number
      status: string | null
      origin: string | null
      workspace: string | null
    }>
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      pinned: !!r.pinned,
      archived: !!r.archived,
      status: (r.status as Conversation['status']) ?? undefined,
      origin: (r.origin as Conversation['origin']) ?? undefined,
      workspace: r.workspace,
      messages: []
    }))
  }

  // 切换置顶（对齐原版 conversation.section.pinned）
  togglePin(id: string): boolean {
    const row = this.db.prepare('SELECT pinned FROM conversations WHERE id = ?').get(id) as
      | { pinned: number }
      | undefined
    if (!row) return false
    const next = row.pinned ? 0 : 1
    this.db.prepare('UPDATE conversations SET pinned = ? WHERE id = ?').run(next, id)
    return !!next
  }

  // 切换归档（对齐原版「归档或删除」语义）；归档时自动取消置顶
  toggleArchive(id: string): boolean {
    const row = this.db.prepare('SELECT archived FROM conversations WHERE id = ?').get(id) as
      | { archived: number }
      | undefined
    if (!row) return false
    const next = row.archived ? 0 : 1
    this.db
      .prepare('UPDATE conversations SET archived = ?, pinned = CASE WHEN ? = 1 THEN 0 ELSE pinned END WHERE id = ?')
      .run(next, next, id)
    return !!next
  }

  createConversation(title: string, origin?: ConversationOrigin): Conversation {
    const now = Date.now()
    const id = crypto.randomUUID()
    // 本机创建的会话来源默认为 web 端（对齐 conversation.origin.web；移动端/小程序经渠道接入后回填）
    const org: ConversationOrigin = origin ?? 'web'
    this.db
      .prepare('INSERT INTO conversations (id, title, created_at, updated_at, origin) VALUES (?, ?, ?, ?, ?)')
      .run(id, title || '新对话', now, now, org)
    return {
      id,
      title: title || '新对话',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      archived: false,
      origin: org,
      workspace: null,
      messages: []
    }
  }

  // 会话数量（不含归档）—— 供会话上限提示使用（对齐 conversation.maxSessions.dialog.*）
  countConversations(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE archived = 0').get() as { n: number }
    return row.n
  }

  /**
   * 更新任务状态角标（对齐 conversation.sectionFlag.*）。
   * status 为空表示清除角标（「该分类下暂无状态任务」态）。
   */
  setConversationStatus(id: string, status: Conversation['status']): void {
    this.db.prepare('UPDATE conversations SET status = ? WHERE id = ?').run(status ?? null, id)
  }

  /** 更新任务来源端（对齐 conversation.origin.*：web / workbuddyApp / workbuddyMp） */
  setConversationOrigin(id: string, origin: Conversation['origin']): void {
    this.db.prepare('UPDATE conversations SET origin = ? WHERE id = ?').run(origin ?? null, id)
  }

  /** 把任务移入工作空间（对齐 conversation.section.workspaces；null = 未归属） */
  setConversationWorkspace(id: string, workspace: string | null): void {
    this.db.prepare('UPDATE conversations SET workspace = ? WHERE id = ?').run(workspace, id)
  }

  // ---------- 上下文档位（对齐 chat.sessionSeparator.*） ----------
  // 存「新会话开始」边界：该时间点之后的消息属于新的一段上下文
  addSeparator(
    conversationId: string,
    sep: { id: string; createdAt: number; model: string; mode: string; permission: string }
  ): void {
    this.db
      .prepare(
        'INSERT INTO separators (id, conversation_id, created_at, model, mode, permission) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING'
      )
      .run(sep.id, conversationId, sep.createdAt, sep.model, sep.mode, sep.permission)
  }

  listSeparators(conversationId: string): SessionSeparator[] {
    const rows = this.db
      .prepare('SELECT * FROM separators WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as Array<{
      id: string
      created_at: number
      model: string
      mode: string
      permission: string
    }>
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      model: r.model,
      mode: r.mode as SessionSeparator['mode'],
      permission: r.permission as SessionSeparator['permission']
    }))
  }

  // 截断消息时同步清理其后的档位（按时间戳判定边界归属）
  pruneSeparatorsAfter(conversationId: string, timestamp: number): void {
    this.db
      .prepare('DELETE FROM separators WHERE conversation_id = ? AND created_at >= ?')
      .run(conversationId, timestamp)
  }

  // ---------- 定时任务（对齐 automation.*） ----------
  /** 列出定时任务 —— `archived` 为 true 时返回归档项（对齐 action.archive / empty.archived） */
  listAutomations(includeArchived = false): Automation[] {
    const rows = this.db
      .prepare(
        includeArchived
          ? 'SELECT * FROM automations ORDER BY created_at DESC'
          : 'SELECT * FROM automations WHERE archived = 0 ORDER BY created_at DESC'
      )
      .all() as Array<Record<string, unknown>>
    return rows.map((r) => this.rowToAutomation(r))
  }

  getAutomation(id: string): Automation | null {
    const row = this.db.prepare('SELECT * FROM automations WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? this.rowToAutomation(row) : null
  }

  private rowToAutomation(r: Record<string, unknown>): Automation {
    return {
      id: String(r.id),
      name: String(r.name),
      prompt: String(r.prompt),
      schedule: JSON.parse(String(r.schedule)) as Automation['schedule'],
      permission: (r.permission as Automation['permission']) ?? 'default',
      deliveryTarget: (r.delivery_target as string) ?? undefined,
      workspaces: r.workspaces ? (JSON.parse(String(r.workspaces)) as string[]) : undefined,
      enabled: !!r.enabled,
      archived: !!r.archived,
      env: (r.env as Automation['env']) ?? 'local',
      lastRunAt: r.last_run_at === null || r.last_run_at === undefined ? undefined : Number(r.last_run_at),
      nextRunAt: r.next_run_at === null || r.next_run_at === undefined ? undefined : Number(r.next_run_at),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at)
    }
  }

  /**
   * 新建 / 保存定时任务 —— 传入 id 存在则更新，否则插入（对齐 toast.createSuccess / saved）。
   * 自动重算 nextRunAt（对齐 row.startsIn `{time}执行`）。
   */
  saveAutomation(input: Omit<Automation, 'createdAt' | 'updatedAt'> & { createdAt?: number }): Automation {
    const now = Date.now()
    const existing = this.getAutomation(input.id)
    const next = input.enabled ? nextRun(input.schedule, now) : undefined
    if (existing) {
      this.db
        .prepare(
          `UPDATE automations SET name=?, prompt=?, schedule=?, permission=?, delivery_target=?,
           workspaces=?, enabled=?, archived=?, env=?, next_run_at=?, updated_at=? WHERE id=?`
        )
        .run(
          input.name,
          input.prompt,
          JSON.stringify(input.schedule),
          input.permission,
          input.deliveryTarget ?? null,
          input.workspaces ? JSON.stringify(input.workspaces) : null,
          input.enabled ? 1 : 0,
          input.archived ? 1 : 0,
          input.env ?? 'local',
          next ?? null,
          now,
          input.id
        )
    } else {
      this.db
        .prepare(
          `INSERT INTO automations (id, name, prompt, schedule, permission, delivery_target, workspaces,
           enabled, archived, env, last_run_at, next_run_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          input.id,
          input.name,
          input.prompt,
          JSON.stringify(input.schedule),
          input.permission,
          input.deliveryTarget ?? null,
          input.workspaces ? JSON.stringify(input.workspaces) : null,
          input.enabled ? 1 : 0,
          input.archived ? 1 : 0,
          input.env ?? 'local',
          input.lastRunAt ?? null,
          next ?? null,
          input.createdAt ?? now,
          now
        )
    }
    return this.getAutomation(input.id)!
  }

  /** 启停 —— 对齐 toast.enabled / toast.paused;恢复时重算 nextRunAt */
  setAutomationEnabled(id: string, enabled: boolean): Automation | null {
    const a = this.getAutomation(id)
    if (!a) return null
    return this.saveAutomation({ ...a, enabled })
  }

  /** 归档 / 取消归档 —— 对齐 action.archive / action.unarchive / toast.archived */
  setAutomationArchived(id: string, archived: boolean): Automation | null {
    const a = this.getAutomation(id)
    if (!a) return null
    if (archived) {
      this.db.prepare('UPDATE automations SET archived = 1, enabled = 0, next_run_at = NULL, updated_at = ? WHERE id = ?').run(Date.now(), id)
      return this.getAutomation(id)
    }
    return this.saveAutomation({ ...a, archived: false })
  }

  /** 删除定时任务 —— 对齐 delete.title / delete.description（记录一并清理） */
  deleteAutomation(id: string): void {
    this.db.prepare('DELETE FROM automation_runs WHERE automation_id = ?').run(id)
    this.db.prepare('DELETE FROM automations WHERE id = ?').run(id)
  }

  /** 批量删除 —— 对齐 batch.deleteResult.allSucceeded / partial */
  deleteAutomations(ids: string[]): { success: number; failed: string[] } {
    let success = 0
    const failed: string[] = []
    for (const id of ids) {
      const a = this.getAutomation(id)
      if (!a) {
        failed.push(id)
        continue
      }
      this.deleteAutomation(id)
      success++
    }
    return { success, failed }
  }

  /** 到点待执行的定时任务 —— 供调度器轮询（enabled 且 nextRunAt <= now） */
  dueAutomations(now: number = Date.now()): Automation[] {
    const rows = this.db
      .prepare('SELECT * FROM automations WHERE enabled = 1 AND archived = 0 AND next_run_at IS NOT NULL AND next_run_at <= ?')
      .all(now) as Array<Record<string, unknown>>
    return rows.map((r) => this.rowToAutomation(r))
  }

  /** 标记已执行并推进 nextRunAt（once 类型执行后自动停用，对齐 onceOnly 语义） */
  markAutomationRun(id: string, runAt: number): void {
    const a = this.getAutomation(id)
    if (!a) return
    const next = a.schedule.kind === 'once' ? undefined : nextRun(a.schedule, runAt)
    this.db
      .prepare('UPDATE automations SET last_run_at = ?, next_run_at = ?, enabled = ?, updated_at = ? WHERE id = ?')
      .run(runAt, next ?? null, next === undefined ? 0 : 1, Date.now(), id)
  }

  // ---------- 运行记录（对齐 automation.records.* / run.* / detail.*） ----------
  addAutomationRun(run: AutomationRun): void {
    this.db
      .prepare(
        `INSERT INTO automation_runs (id, automation_id, task_name, status, reason, started_at, finished_at,
         conversation_id, summary, evidence, error, archived, test) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, reason=excluded.reason, finished_at=excluded.finished_at,
           conversation_id=excluded.conversation_id, summary=excluded.summary, evidence=excluded.evidence,
           error=excluded.error, archived=excluded.archived`
      )
      .run(
        run.id,
        run.automationId,
        run.taskName,
        run.status,
        run.reason ?? null,
        run.startedAt,
        run.finishedAt ?? null,
        run.conversationId ?? null,
        run.summary ?? null,
        run.evidence ? JSON.stringify(run.evidence) : null,
        run.error ?? null,
        run.archived ? 1 : 0,
        run.test ? 1 : 0
      )
  }

  private rowToRun(r: Record<string, unknown>): AutomationRun {
    return {
      id: String(r.id),
      automationId: String(r.automation_id),
      taskName: String(r.task_name),
      status: r.status as AutomationRun['status'],
      reason: (r.reason as string) ?? undefined,
      startedAt: Number(r.started_at),
      finishedAt: r.finished_at === null || r.finished_at === undefined ? undefined : Number(r.finished_at),
      conversationId: (r.conversation_id as string) ?? undefined,
      summary: (r.summary as string) ?? undefined,
      evidence: r.evidence ? (JSON.parse(String(r.evidence)) as Automation['schedule'] extends never ? never : AutomationRun['evidence']) : undefined,
      error: (r.error as string) ?? undefined,
      archived: !!r.archived,
      test: !!r.test
    }
  }

  listAutomationRuns(automationId?: string, includeArchived = false): AutomationRun[] {
    const where: string[] = []
    const params: unknown[] = []
    if (automationId) {
      where.push('automation_id = ?')
      params.push(automationId)
    }
    if (!includeArchived) where.push('archived = 0')
    const sql = `SELECT * FROM automation_runs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY started_at DESC`
    const rows = this.db.prepare(sql).all(...(params as never[])) as Array<Record<string, unknown>>
    return rows.map((r) => this.rowToRun(r))
  }

  setRunArchived(runId: string, archived: boolean): void {
    this.db.prepare('UPDATE automation_runs SET archived = ? WHERE id = ?').run(archived ? 1 : 0, runId)
  }

  deleteAutomationRun(runId: string): void {
    this.db.prepare('DELETE FROM automation_runs WHERE id = ?').run(runId)
  }

  getConversation(id: string): Conversation | null {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | {
          id: string
          title: string
          created_at: number
          updated_at: number
          pinned: number
          archived: number
          status: string | null
          origin: string | null
          workspace: string | null
        }
      | undefined
    if (!row) return null
    const msgs = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY rowid ASC')
      .all(id) as Array<{
      id: string
      role: string
      content: string
      created_at: number
      attachments: string | null
      error: string | null
      error_kind: string | null
      stop_reason: string | null
      error_code: string | null
    }>
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pinned: !!row.pinned,
      archived: !!row.archived,
      status: (row.status as Conversation['status']) ?? undefined,
      origin: (row.origin as Conversation['origin']) ?? undefined,
      workspace: row.workspace,
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role as ChatMessage['role'],
        content: m.content,
        createdAt: m.created_at,
        attachments: m.attachments ? (JSON.parse(m.attachments) as ChatMessage['attachments']) : undefined,
        error: m.error ?? undefined,
        errorKind: (m.error_kind as ChatMessage['errorKind']) ?? undefined,
        stopReason: (m.stop_reason as ChatMessage['stopReason']) ?? undefined,
        errorCode: m.error_code ?? undefined
      })),
      // 上下文档位随会话一起返回（对齐 chat.sessionSeparator.*）
      separators: this.listSeparators(id)
    }
  }

  appendMessage(conversationId: string, msg: ChatMessage): void {
    // 幂等写入：同一消息 id 重复落库（重试/重放）时覆盖而非抛 UNIQUE 约束错误
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, attachments, error, error_kind, stop_reason, error_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           created_at = excluded.created_at,
           attachments = excluded.attachments,
           error = excluded.error,
           error_kind = excluded.error_kind,
           stop_reason = excluded.stop_reason,
           error_code = excluded.error_code`
      )
      .run(
        msg.id,
        conversationId,
        msg.role,
        msg.content,
        msg.createdAt,
        msg.attachments && msg.attachments.length ? JSON.stringify(msg.attachments) : null,
        msg.error ?? null,
        msg.errorKind ?? null,
        msg.stopReason ?? null,
        msg.errorCode ?? null
      )
    this.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(msg.createdAt, conversationId)
  }

  // 删除单条消息（对齐原版消息级操作）
  deleteMessage(conversationId: string, messageId: string): void {
    this.db.prepare('DELETE FROM messages WHERE id = ? AND conversation_id = ?').run(messageId, conversationId)
  }

  // 截断消息：删除指定消息及其之后的所有消息（按插入顺序 rowid，避免时间戳同毫秒不可靠）
  truncateFromId(conversationId: string, fromMessageId: string): void {
    const target = this.db.prepare('SELECT rowid FROM messages WHERE id = ?').get(fromMessageId) as
      | { rowid: number }
      | undefined
    if (!target) return
    this.db
      .prepare('DELETE FROM messages WHERE conversation_id = ? AND rowid >= ?')
      .run(conversationId, target.rowid)
  }

  // 会话搜索：按标题或消息内容检索（对齐原版 search 能力）；归档会话不参与
  searchConversations(query: string): Conversation[] {
    const q = `%${query}%`
    const rows = this.db
      .prepare(
        `SELECT DISTINCT c.* FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.archived = 0 AND (c.title LIKE ? OR m.content LIKE ?)
         ORDER BY c.pinned DESC, c.updated_at DESC`
      )
      .all(q, q) as Array<{
      id: string
      title: string
      created_at: number
      updated_at: number
      pinned: number
      archived: number
      status: string | null
      origin: string | null
      workspace: string | null
    }>
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      pinned: !!r.pinned,
      archived: !!r.archived,
      status: (r.status as Conversation['status']) ?? undefined,
      origin: (r.origin as Conversation['origin']) ?? undefined,
      workspace: r.workspace,
      messages: []
    }))
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id)
    // 级联清空该会话的上下文档位（对齐 chat.sessionSeparator.*，避免悬空记录）
    this.db.prepare('DELETE FROM separators WHERE conversation_id = ?').run(id)
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  renameConversation(id: string, title: string): void {
    this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, id)
  }
}

// 懒初始化：必须在 app.whenReady() 之后才能 getPath('userData')，
// 因此这里不立即 new，改为首次访问时创建。
let _store: Store | null = null

export function getStore(): Store {
  if (!_store) {
    _store = new Store()
  }
  return _store
}
