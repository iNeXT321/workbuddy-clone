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
  AutomationRun,
  ScheduleEvent,
  Colleague,
  ChannelBinding,
  ChannelKind,
  ColleagueVisibility,
  ColleagueStatus,
  ColleagueMemory,
  ColleagueQuota,
  ColleagueTask,
  ChannelState,
  Skill
} from '../shared/types'
import { nextRun } from '../shared/schedule'
import { DEFAULT_CALENDAR_DEFAULTS } from '../shared/scheduleEvent'
import { PLAN_LIMITS, DEFAULT_PLAN, isExclusiveChannel, CLOUD_SUBJECT } from '../shared/colleague'
import { emptyMetrics } from '../shared/skill'

/**
 * 本地存储层 —— 对齐 WorkBuddy 本体的 node:sqlite 用法：
 * - node:sqlite（DatabaseSync）
 * - WAL 模式 + synchronous=NORMAL（本体的 openWorkbuddyRawSqliteDatabase 同款 pragma）
 * - safeStorage 加密 API key（本体的 credential-protection 同款思路）
 */

export class Store {
  private db: DatabaseSync
  private settingsRow = 'settings'
  /**
   * 单调递增毫秒时间戳 —— 保证同一毫秒内多次写入也严格递增。
   * 用于 updated_at 等参与排序的字段，避免并列导致列表顺序不确定。
   */
  private lastTs = 0
  private nextTimestamp(): number {
    const t = Date.now()
    this.lastTs = t > this.lastTs ? t : this.lastTs + 1
    return this.lastTs
  }

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
      -- 日程 / 日历（对齐 home.schedule.*，676 条）
      CREATE TABLE IF NOT EXISTS schedule_events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        start_at INTEGER NOT NULL,
        end_at INTEGER NOT NULL,
        all_day INTEGER NOT NULL DEFAULT 0,
        location TEXT,
        description TEXT,
        organizer TEXT,
        participants TEXT,
        reminder TEXT,
        attachments TEXT,
        calendar TEXT,
        source TEXT,
        kind TEXT,
        cancelled INTEGER NOT NULL DEFAULT 0,
        repeat TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_start ON schedule_events(start_at, end_at);
      CREATE INDEX IF NOT EXISTS idx_events_source ON schedule_events(source);
      -- 数字员工 / 助理（对齐 colleagues.*，573 条）
      CREATE TABLE IF NOT EXISTS colleagues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        description TEXT,
        personality TEXT,
        responsibilities TEXT,
        tags TEXT,
        avatar TEXT,
        model TEXT,
        visibility TEXT NOT NULL DEFAULT 'personal',
        status TEXT NOT NULL DEFAULT 'idle',
        online INTEGER NOT NULL DEFAULT 1,
        pinned INTEGER NOT NULL DEFAULT 0,
        source TEXT,
        connections TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_colleagues_pinned ON colleagues(pinned);
      CREATE INDEX IF NOT EXISTS idx_colleagues_status ON colleagues(status);
      -- 渠道绑定（对齐 bindChannel.*）：subject = 助理 id 或 'cloud'（云助理全局条目）
      CREATE TABLE IF NOT EXISTS colleague_channels (
        subject TEXT NOT NULL,
        channel TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'unbound',
        bound_at INTEGER,
        PRIMARY KEY (subject, channel)
      );
      CREATE INDEX IF NOT EXISTS idx_channels_channel ON colleague_channels(channel, state);
      -- 助理内存记忆（对齐 imConfig.memory.*）
      CREATE TABLE IF NOT EXISTS colleague_memory (
        subject TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
      -- 助理任务（对齐 detail.tasks / detail.taskTable.*）
      CREATE TABLE IF NOT EXISTS colleague_tasks (
        id TEXT PRIMARY KEY,
        colleague_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        source TEXT,
        conversation_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ctasks_colleague ON colleague_tasks(colleague_id);
      -- 技能（对齐 skills.*）—— 安装状态 / 自动触发 / 置顶 / 同步 / 付费
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        source TEXT NOT NULL DEFAULT 'installed',
        installed_group TEXT,
        version TEXT,
        author TEXT,
        license TEXT,
        installed INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        pinned INTEGER NOT NULL DEFAULT 0,
        builtin INTEGER NOT NULL DEFAULT 0,
        needs_api_key INTEGER NOT NULL DEFAULT 0,
        api_key_configured INTEGER NOT NULL DEFAULT 0,
        sync_state TEXT NOT NULL DEFAULT 'localOnly',
        cloud_available INTEGER NOT NULL DEFAULT 0,
        paid_kind TEXT NOT NULL DEFAULT 'free',
        price REAL,
        purchased_until INTEGER,
        purchased_at INTEGER,
        refund_count INTEGER NOT NULL DEFAULT 0,
        risk_level TEXT,
        metrics TEXT NOT NULL DEFAULT '{}',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source, installed);
      CREATE INDEX IF NOT EXISTS idx_skills_pinned ON skills(pinned, updated_at);
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

  // ---------- 日程 / 日历（对齐 home.schedule.*） ----------
  /**
   * 列出日程 —— 时间区间过滤（日历把区间内的日程铺到月视图）。
   * `source` 命中时按来源组过滤（对齐 sidebar.managed/channels/subscribed）。
   */
  listEvents(opts: { from?: number; to?: number; source?: string; includeCancelled?: boolean } = {}): ScheduleEvent[] {
    const where: string[] = []
    const args: Array<string | number> = []
    // 与区间有交叠：start < to && end >= from
    if (opts.to !== undefined) {
      where.push('start_at <= ?')
      args.push(opts.to)
    }
    if (opts.from !== undefined) {
      where.push('end_at >= ?')
      args.push(opts.from)
    }
    if (opts.source) {
      where.push('source = ?')
      args.push(opts.source)
    }
    if (!opts.includeCancelled) where.push('cancelled = 0')
    const sql = `SELECT * FROM schedule_events${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY start_at ASC`
    const rows = this.db.prepare(sql).all(...args) as Array<Record<string, unknown>>
    return rows.map((r) => this.rowToEvent(r))
  }

  getEvent(id: string): ScheduleEvent | null {
    const row = this.db.prepare('SELECT * FROM schedule_events WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? this.rowToEvent(row) : null
  }

  private rowToEvent(r: Record<string, unknown>): ScheduleEvent {
    return {
      id: String(r.id),
      title: String(r.title),
      startAt: Number(r.start_at),
      endAt: Number(r.end_at),
      allDay: !!r.all_day,
      location: (r.location as string) ?? undefined,
      description: (r.description as string) ?? undefined,
      organizer: (r.organizer as string) ?? undefined,
      participants: r.participants ? (JSON.parse(String(r.participants)) as ScheduleEvent['participants']) : undefined,
      reminder: (r.reminder as ScheduleEvent['reminder']) ?? undefined,
      attachments: r.attachments ? (JSON.parse(String(r.attachments)) as string[]) : undefined,
      calendar: (r.calendar as string) ?? undefined,
      source: (r.source as ScheduleEvent['source']) ?? undefined,
      kind: (r.kind as ScheduleEvent['kind']) ?? undefined,
      cancelled: !!r.cancelled,
      repeat: r.repeat ? (JSON.parse(String(r.repeat)) as ScheduleEvent['repeat']) : undefined,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at)
    }
  }

  /** 新建 / 保存日程（对齐 toast.createSuccess / saved）；存在同 id 则更新 */
  saveEvent(input: ScheduleEvent & { createdAt?: number }): ScheduleEvent {
    const now = Date.now()
    const existing = this.getEvent(input.id)
    const vals = [
      input.title,
      input.startAt,
      input.endAt,
      input.allDay ? 1 : 0,
      input.location ?? null,
      input.description ?? null,
      input.organizer ?? null,
      input.participants ? JSON.stringify(input.participants) : null,
      input.reminder ?? null,
      input.attachments ? JSON.stringify(input.attachments) : null,
      input.calendar ?? null,
      input.source ?? null,
      input.kind ?? null,
      input.cancelled ? 1 : 0,
      input.repeat ? JSON.stringify(input.repeat) : null
    ]
    if (existing) {
      this.db
        .prepare(
          `UPDATE schedule_events SET title=?, start_at=?, end_at=?, all_day=?, location=?, description=?,
           organizer=?, participants=?, reminder=?, attachments=?, calendar=?, source=?, kind=?,
           cancelled=?, repeat=?, updated_at=? WHERE id=?`
        )
        .run(...vals, now, input.id)
    } else {
      this.db
        .prepare(
          `INSERT INTO schedule_events (title, start_at, end_at, all_day, location, description, organizer,
           participants, reminder, attachments, calendar, source, kind, cancelled, repeat,
           id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(...vals, input.id, input.createdAt ?? now, now)
    }
    return this.getEvent(input.id)!
  }

  /** 删除日程 —— 对齐 `summary.delete`（deleteConfirmBody 承诺「从日历里消失」） */
  deleteEvent(id: string): boolean {
    const before = this.getEvent(id)
    if (!before) return false
    this.db.prepare('DELETE FROM schedule_events WHERE id = ?').run(id)
    return true
  }

  /** 取消日程 —— 对齐 `summary.status.cancelled` / `detail.cancelEvent` */
  cancelEvent(id: string): ScheduleEvent | null {
    const e = this.getEvent(id)
    if (!e) return null
    return this.saveEvent({ ...e, cancelled: true })
  }

  /** 读取日历默认设置 —— 对齐 `settings.*`（无则回落默认值） */
  getCalendarDefaults(): import('../shared/scheduleEvent').CalendarDefaults {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get('calendarDefaults') as
      | { value: string }
      | undefined
    if (!row) return { ...DEFAULT_CALENDAR_DEFAULTS }
    try {
      return { ...DEFAULT_CALENDAR_DEFAULTS, ...(JSON.parse(row.value) as Partial<import('../shared/scheduleEvent').CalendarDefaults>) }
    } catch {
      return { ...DEFAULT_CALENDAR_DEFAULTS }
    }
  }

  /** 保存日历默认设置 —— 对齐 `settings.save` / `settings.saveFailed` */
  saveCalendarDefaults(patch: Partial<import('../shared/scheduleEvent').CalendarDefaults>): import('../shared/scheduleEvent').CalendarDefaults {
    const next = { ...this.getCalendarDefaults(), ...patch }
    this.db
      .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('calendarDefaults', JSON.stringify(next))
    return next
  }

  // ---------- 数字员工 / 助理（对齐 colleagues.*） ----------

  private rowToColleague(r: Record<string, unknown>): Colleague {
    return {
      id: String(r.id),
      name: String(r.name),
      displayName: String(r.display_name),
      role: String(r.role),
      description: (r.description as string) ?? undefined,
      personality: (r.personality as string) ?? undefined,
      responsibilities: r.responsibilities ? (JSON.parse(String(r.responsibilities)) as string[]) : [],
      tags: r.tags ? (JSON.parse(String(r.tags)) as string[]) : [],
      avatar: (r.avatar as string) ?? undefined,
      model: (r.model as string) ?? undefined,
      visibility: ((r.visibility as string) ?? 'personal') as ColleagueVisibility,
      status: ((r.status as string) ?? 'idle') as ColleagueStatus,
      online: !!r.online,
      pinned: !!r.pinned,
      source: ((r.source as string) ?? 'personal') as Colleague['source'],
      connections: r.connections ? (JSON.parse(String(r.connections)) as string[]) : [],
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at)
    }
  }

  /**
   * 列出助理 —— 对齐 `colleagues.*` 列表。
   * 排序对齐 `action.pin` 语义：置顶优先，其次按最近更新倒序。
   */
  listColleagues(): Colleague[] {
    const rows = this.db
      .prepare('SELECT * FROM colleagues ORDER BY pinned DESC, updated_at DESC')
      .all() as Array<Record<string, unknown>>
    return rows.map((r) => this.rowToColleague(r))
  }

  getColleague(id: string): Colleague | null {
    const row = this.db.prepare('SELECT * FROM colleagues WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? this.rowToColleague(row) : null
  }

  /** 名称唯一性 —— 对齐 `createDialog.nameDuplicated`（同 display_name 视为重复） */
  isColleagueNameTaken(displayName: string, exceptId?: string): boolean {
    const row = this.db
      .prepare('SELECT id FROM colleagues WHERE display_name = ?')
      .get(displayName) as { id: string } | undefined
    if (!row) return false
    return exceptId === undefined || row.id !== exceptId
  }

  /** 新建 / 保存助理 —— 存在同 id 则更新（对齐 `createDialog` / `editDialog`） */
  saveColleague(input: Colleague): Colleague {
    // 单调递增时间戳：同一毫秒内多次写入也不会并列，保证
    // `ORDER BY pinned DESC, updated_at DESC` 的排序确定（否则置顶/取消置顶
    // 连击时两者 updated_at 相同，列表顺序不确定）。
    const now = this.nextTimestamp()
    const existing = this.getColleague(input.id)
    const vals = [
      input.name,
      input.displayName,
      input.role,
      input.description ?? null,
      input.personality ?? null,
      JSON.stringify(input.responsibilities ?? []),
      JSON.stringify(input.tags ?? []),
      input.avatar ?? null,
      input.model ?? null,
      input.visibility,
      input.status,
      input.online ? 1 : 0,
      input.pinned ? 1 : 0,
      input.source ?? 'personal',
      JSON.stringify(input.connections ?? [])
    ]
    if (existing) {
      this.db
        .prepare(
          `UPDATE colleagues SET name=?, display_name=?, role=?, description=?, personality=?,
           responsibilities=?, tags=?, avatar=?, model=?, visibility=?, status=?, online=?,
           pinned=?, source=?, connections=?, updated_at=? WHERE id=?`
        )
        .run(...vals, now, input.id)
    } else {
      this.db
        .prepare(
          `INSERT INTO colleagues (name, display_name, role, description, personality,
           responsibilities, tags, avatar, model, visibility, status, online, pinned, source,
           connections, id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(...vals, input.id, input.createdAt ?? now, now)
    }
    return this.getColleague(input.id)!
  }

  /**
   * 删除助理 —— 对齐 `action.delete*`。
   * 级联清理该助理的渠道绑定 / 内存记忆 / 任务（对齐「删除后无法继续指派任务」）。
   */
  deleteColleague(id: string): boolean {
    if (!this.getColleague(id)) return false
    this.db.prepare('DELETE FROM colleagues WHERE id = ?').run(id)
    this.db.prepare('DELETE FROM colleague_channels WHERE subject = ?').run(id)
    this.db.prepare('DELETE FROM colleague_memory WHERE subject = ?').run(id)
    this.db.prepare('DELETE FROM colleague_tasks WHERE colleague_id = ?').run(id)
    return true
  }

  /** 置顶 / 取消置顶 —— 对齐 `action.pin` / `action.unpin` */
  setColleaguePinned(id: string, pinned: boolean): Colleague | null {
    const c = this.getColleague(id)
    if (!c) return null
    return this.saveColleague({ ...c, pinned })
  }

  /** 暂停 / 恢复 —— 对齐 `action.pauseColleague` / `action.resumeColleague`（status 转 idle/working） */
  setColleaguePaused(id: string, paused: boolean): Colleague | null {
    const c = this.getColleague(id)
    if (!c) return null
    return this.saveColleague({ ...c, status: paused ? 'idle' : 'working', online: !paused })
  }

  /** 发布 / 改可见范围 —— 对齐 `publishDialog.*` + `action.publishToProject` */
  setColleagueVisibility(id: string, visibility: ColleagueVisibility): Colleague | null {
    const c = this.getColleague(id)
    if (!c) return null
    return this.saveColleague({ ...c, visibility })
  }

  /** 复制为新助理 —— 对齐 `action.copyAsNew`（昵称沿用、名称加「副本」语义由 UI 拼装） */
  cloneColleague(id: string, patch: Partial<Colleague> = {}): Colleague | null {
    const src = this.getColleague(id)
    if (!src) return null
    return this.saveColleague({
      ...src,
      id: `col_${Math.random().toString(36).slice(2, 10)}`,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...patch
    })
  }

  /** 配额 —— 对齐 `quotaLimit.*`（{limit} 由套餐决定，used 为当前助理数） */
  getColleagueQuota(plan: string = DEFAULT_PLAN): ColleagueQuota {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM colleagues').get() as { n: number }
    return { plan, limit: PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS[DEFAULT_PLAN], used: Number(row.n) }
  }

  // ---------- 渠道绑定（对齐 bindChannel.*） ----------

  listChannelBindings(subject?: string): ChannelBinding[] {
    const rows = (
      subject
        ? this.db.prepare('SELECT * FROM colleague_channels WHERE subject = ?').all(subject)
        : this.db.prepare('SELECT * FROM colleague_channels').all()
    ) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      subject: String(r.subject),
      channel: String(r.channel) as ChannelKind,
      state: (String(r.state) as ChannelBinding['state']) ?? 'unbound',
      boundAt: r.bound_at === null || r.bound_at === undefined ? undefined : Number(r.bound_at)
    }))
  }

  /**
   * 绑定渠道 —— 对齐 `bindChannel.*`。
   * 独占规则（`bindChannel.colleague.subtitle`）：除小程序外，同一渠道同一时刻只能被 1 个主体占用；
   * 已有其他主体占用时，先把旧主体的该渠道置回 unbound（相当于「转绑」）。
   * 小程序是全局共享，不做占用清理。
   */
  bindChannel(subject: string, channel: ChannelKind, state: ChannelState = 'bound'): ChannelBinding[] {
    const now = Date.now()
    if (state === 'bound' && isExclusiveChannel(channel)) {
      this.db
        .prepare('UPDATE colleague_channels SET state = ?, bound_at = NULL WHERE channel = ? AND subject <> ?')
        .run('unbound', channel, subject)
    }
    this.db
      .prepare(
        `INSERT INTO colleague_channels (subject, channel, state, bound_at) VALUES (?,?,?,?)
         ON CONFLICT(subject, channel) DO UPDATE SET state = excluded.state, bound_at = excluded.bound_at`
      )
      .run(subject, channel, state, state === 'bound' ? now : null)
    return this.listChannelBindings(subject)
  }

  unbindChannel(subject: string, channel: ChannelKind): ChannelBinding[] {
    return this.bindChannel(subject, channel, 'unbound')
  }

  /** 渠道当前占用主体 —— 对齐「同一渠道同一时间只能由 1 位助理占用」 */
  channelOwner(channel: ChannelKind): string | null {
    const row = this.db
      .prepare("SELECT subject FROM colleague_channels WHERE channel = ? AND state = 'bound'")
      .get(channel) as { subject: string } | undefined
    return row ? row.subject : null
  }

  /** 是否已连接 IM（云助理状态徽标用）—— 对齐 `dashboard.imConnected` */
  hasAnyChannelBound(subject?: string): boolean {
    const sql = subject
      ? "SELECT COUNT(*) AS n FROM colleague_channels WHERE state = 'bound' AND subject = ?"
      : "SELECT COUNT(*) AS n FROM colleague_channels WHERE state = 'bound'"
    const row = (subject ? this.db.prepare(sql).get(subject) : this.db.prepare(sql).get()) as { n: number }
    return Number(row.n) > 0
  }

  // ---------- 内存记忆（对齐 imConfig.memory.*） ----------

  /** 读取内存记忆开关 —— 默认开启（对齐 `switch.status`「默认开启」） */
  getColleagueMemory(subject: string): ColleagueMemory {
    const row = this.db.prepare('SELECT * FROM colleague_memory WHERE subject = ?').get(subject) as
      | Record<string, unknown>
      | undefined
    if (!row) return { subject, enabled: true, updatedAt: 0 }
    return { subject, enabled: !!row.enabled, updatedAt: Number(row.updated_at) }
  }

  saveColleagueMemory(subject: string, enabled: boolean): ColleagueMemory {
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO colleague_memory (subject, enabled, updated_at) VALUES (?,?,?)
         ON CONFLICT(subject) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
      )
      .run(subject, enabled ? 1 : 0, now)
    return { subject, enabled, updatedAt: now }
  }

  /** 默认主体：assistant（云助理）由 UI 显式传 'cloud'；此处提供便捷读取 */
  getMemoryForCloud(): ColleagueMemory {
    return this.getColleagueMemory(CLOUD_SUBJECT)
  }

  // ---------- 助理任务（对齐 detail.tasks / detail.taskTable.*） ----------

  listColleagueTasks(colleagueId?: string): ColleagueTask[] {
    const rows = (
      colleagueId
        ? this.db
            .prepare('SELECT * FROM colleague_tasks WHERE colleague_id = ? ORDER BY created_at DESC')
            .all(colleagueId)
        : this.db.prepare('SELECT * FROM colleague_tasks ORDER BY created_at DESC').all()
    ) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      id: String(r.id),
      colleagueId: String(r.colleague_id),
      name: String(r.name),
      status: String(r.status),
      source: (r.source as string) ?? undefined,
      conversationId: (r.conversation_id as string) ?? undefined,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at)
    }))
  }

  saveColleagueTask(input: {
    id: string
    colleagueId: string
    name: string
    status: string
    source?: string
    conversationId?: string
    createdAt?: number
  }): ColleagueTask {
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO colleague_tasks (id, colleague_id, name, status, source, conversation_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status,
           source = excluded.source, conversation_id = excluded.conversation_id, updated_at = excluded.updated_at`
      )
      .run(
        input.id,
        input.colleagueId,
        input.name,
        input.status,
        input.source ?? null,
        input.conversationId ?? null,
        input.createdAt ?? now,
        now
      )
    return this.listColleagueTasks(input.colleagueId).find((t) => t.id === input.id)!
  }

  deleteColleagueTask(id: string): boolean {
    const before = this.db.prepare('SELECT id FROM colleague_tasks WHERE id = ?').get(id) as
      | { id: string }
      | undefined
    if (!before) return false
    this.db.prepare('DELETE FROM colleague_tasks WHERE id = ?').run(id)
    return true
  }

  // ---------- 技能（对齐 skills.*） ----------

  private rowToSkill(r: Record<string, unknown>): Skill {
    return {
      id: String(r.id),
      name: String(r.name),
      description: r.description == null ? undefined : String(r.description),
      source: (String(r.source) as Skill['source']) ?? 'installed',
      installedGroup: r.installed_group == null ? undefined : (String(r.installed_group) as Skill['installedGroup']),
      version: r.version == null ? undefined : String(r.version),
      author: r.author == null ? undefined : String(r.author),
      license: r.license == null ? undefined : String(r.license),
      installed: Number(r.installed) === 1,
      enabled: Number(r.enabled) === 1,
      pinned: Number(r.pinned) === 1,
      builtin: Number(r.builtin) === 1,
      needsApiKey: Number(r.needs_api_key) === 1,
      apiKeyConfigured: Number(r.api_key_configured) === 1,
      sync: (String(r.sync_state) as Skill['sync']) ?? 'localOnly',
      cloudAvailable: Number(r.cloud_available) === 1,
      paidKind: (String(r.paid_kind) as Skill['paidKind']) ?? 'free',
      price: r.price == null ? undefined : Number(r.price),
      purchasedUntil: r.purchased_until == null ? undefined : Number(r.purchased_until),
      purchasedAt: r.purchased_at == null ? undefined : Number(r.purchased_at),
      refundCount: Number(r.refund_count ?? 0),
      riskLevel: r.risk_level == null ? undefined : (String(r.risk_level) as Skill['riskLevel']),
      metrics: r.metrics ? { ...emptyMetrics(), ...(JSON.parse(String(r.metrics)) as object) } : emptyMetrics(),
      tags: r.tags ? (JSON.parse(String(r.tags)) as string[]) : [],
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at)
    }
  }

  /** 列出技能 —— 置顶优先、其次更新时间倒序（对齐 card.pin 排序语义） */
  listSkills(): Skill[] {
    const rows = this.db
      .prepare('SELECT * FROM skills ORDER BY pinned DESC, updated_at DESC')
      .all() as Array<Record<string, unknown>>
    return rows.map((r) => this.rowToSkill(r))
  }

  getSkill(id: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? this.rowToSkill(row) : null
  }

  saveSkill(input: Skill): Skill {
    const now = this.nextTimestamp()
    const existing = this.getSkill(input.id)
    const vals = [
      input.name,
      input.description ?? null,
      input.source,
      input.installedGroup ?? null,
      input.version ?? null,
      input.author ?? null,
      input.license ?? null,
      input.installed ? 1 : 0,
      input.enabled ? 1 : 0,
      input.pinned ? 1 : 0,
      input.builtin ? 1 : 0,
      input.needsApiKey ? 1 : 0,
      input.apiKeyConfigured ? 1 : 0,
      input.sync,
      input.cloudAvailable ? 1 : 0,
      input.paidKind,
      input.price ?? null,
      input.purchasedUntil ?? null,
      input.purchasedAt ?? null,
      input.refundCount ?? 0,
      input.riskLevel ?? null,
      JSON.stringify(input.metrics ?? emptyMetrics()),
      JSON.stringify(input.tags ?? [])
    ]
    if (existing) {
      this.db
        .prepare(
          `UPDATE skills SET name=?, description=?, source=?, installed_group=?, version=?, author=?,
           license=?, installed=?, enabled=?, pinned=?, builtin=?, needs_api_key=?, api_key_configured=?,
           sync_state=?, cloud_available=?, paid_kind=?, price=?, purchased_until=?, purchased_at=?,
           refund_count=?, risk_level=?, metrics=?, tags=?, updated_at=? WHERE id=?`
        )
        .run(...vals, now, input.id)
    } else {
      this.db
        .prepare(
          `INSERT INTO skills (name, description, source, installed_group, version, author, license,
           installed, enabled, pinned, builtin, needs_api_key, api_key_configured, sync_state,
           cloud_available, paid_kind, price, purchased_until, purchased_at, refund_count, risk_level,
           metrics, tags, id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(...vals, input.id, input.createdAt ?? now, now)
    }
    return this.getSkill(input.id)!
  }

  /** 删除技能记录 —— 对齐 `delete.title`（卸载技能） */
  deleteSkill(id: string): boolean {
    if (!this.getSkill(id)) return false
    this.db.prepare('DELETE FROM skills WHERE id = ?').run(id)
    return true
  }

  /** 安装 / 卸载 —— 卸载不删记录（保留可重装），仅翻 installed 位 */
  setSkillInstalled(id: string, installed: boolean): Skill | null {
    const s = this.getSkill(id)
    if (!s) return null
    return this.saveSkill({
      ...s,
      installed,
      // 安装即默认启用「自动触发」（对齐 card.enable 语义：安装后可立即在对话中自动触发）；
      // 卸载后不保留启用态
      enabled: installed ? true : false,
      installedGroup: installed ? (s.installedGroup ?? 'market') : s.installedGroup
    })
  }

  /** 启用 / 停用「自动触发」—— 对齐 `card.enable` / `card.disable` */
  setSkillEnabled(id: string, enabled: boolean): Skill | null {
    const s = this.getSkill(id)
    if (!s) return null
    return this.saveSkill({ ...s, enabled })
  }

  /** 置顶 / 取消置顶 —— 对齐 `card.pin` / `card.unpin` */
  setSkillPinned(id: string, pinned: boolean): Skill | null {
    const s = this.getSkill(id)
    if (!s) return null
    return this.saveSkill({ ...s, pinned })
  }

  /** 已启用的技能数 —— 对齐 `enabledWarning`（超 80 个告警） */
  countEnabledSkills(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM skills WHERE enabled = 1 AND installed = 1').get() as { n: number }
    return Number(row.n)
  }

  /** 上传到云端（桩）—— 对齐 `cloud.action.upload`，仅翻转同步态 */
  setSkillSync(id: string, sync: Skill['sync']): Skill | null {
    const s = this.getSkill(id)
    if (!s) return null
    return this.saveSkill({ ...s, sync, cloudAvailable: sync !== 'localOnly' })
  }

  /** 购买（桩）—— 对齐 `buySkill`：monthly 需有效期 */
  purchaseSkill(id: string, kind: 'monthly' | 'permanent', price?: number): Skill | null {
    const s = this.getSkill(id)
    if (!s) return null
    const now = Date.now()
    return this.saveSkill({
      ...s,
      paidKind: kind,
      price: price ?? s.price,
      purchasedAt: now,
      purchasedUntil: kind === 'monthly' ? now + 30 * 86400000 : undefined
    })
  }

  /** 退款（桩）—— 对齐 `refund.confirmBody`：退款同时卸载，且累计次数 */
  refundSkill(id: string): Skill | null {
    const s = this.getSkill(id)
    if (!s) return null
    return this.saveSkill({
      ...s,
      refundCount: (s.refundCount ?? 0) + 1,
      purchasedAt: undefined,
      purchasedUntil: undefined,
      installed: false,
      enabled: false
    })
  }

  /** 批量启用 / 停用 —— 返回各自成败（对齐 `batch.togglePartialFailed`） */
  batchSetSkillEnabled(ids: string[], enabled: boolean): { ok: string[]; failed: string[] } {
    const ok: string[] = []
    const failed: string[] = []
    for (const id of ids) {
      const r = this.setSkillEnabled(id, enabled)
      if (r) ok.push(id)
      else failed.push(id)
    }
    return { ok, failed }
  }

  /** 批量卸载 —— 对齐 `batch.uninstall` */
  batchUninstallSkills(ids: string[]): { ok: string[]; failed: string[] } {
    const ok: string[] = []
    const failed: string[] = []
    for (const id of ids) {
      const r = this.setSkillInstalled(id, false)
      if (r) ok.push(id)
      else failed.push(id)
    }
    return { ok, failed }
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
