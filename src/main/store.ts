import { app, safeStorage } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { AppSettings, Conversation, ChatMessage } from '../shared/types'

/**
 * 本地存储层 —— 对齐 WorkBuddy 本体的 node:sqlite 用法：
 * - node:sqlite（DatabaseSync）
 * - WAL 模式 + synchronous=NORMAL（本体的 openWorkbuddyRawSqliteDatabase 同款 pragma）
 * - safeStorage 加密 API key（本体的 credential-protection 同款思路）
 */

class Store {
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
        archived INTEGER NOT NULL DEFAULT 0
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
        stop_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
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

    // 兼容旧库：conversations 表补 pinned / archived 列（对齐原版置顶 / 归档）
    const convCols = this.db.prepare('PRAGMA table_info(conversations)').all() as Array<{ name: string }>
    if (!convCols.some((c) => c.name === 'pinned')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
    }
    if (!convCols.some((c) => c.name === 'archived')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
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
      sendShortcut: 'Enter'
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
    }>
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      pinned: !!r.pinned,
      archived: !!r.archived,
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

  createConversation(title: string): Conversation {
    const now = Date.now()
    const id = crypto.randomUUID()
    this.db
      .prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, title || '新对话', now, now)
    return { id, title: title || '新对话', createdAt: now, updatedAt: now, pinned: false, archived: false, messages: [] }
  }

  getConversation(id: string): Conversation | null {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | { id: string; title: string; created_at: number; updated_at: number; pinned: number; archived: number }
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
    }>
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pinned: !!row.pinned,
      archived: !!row.archived,
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role as ChatMessage['role'],
        content: m.content,
        createdAt: m.created_at,
        attachments: m.attachments ? (JSON.parse(m.attachments) as ChatMessage['attachments']) : undefined,
        error: m.error ?? undefined,
        errorKind: (m.error_kind as ChatMessage['errorKind']) ?? undefined,
        stopReason: (m.stop_reason as ChatMessage['stopReason']) ?? undefined
      }))
    }
  }

  appendMessage(conversationId: string, msg: ChatMessage): void {
    // 幂等写入：同一消息 id 重复落库（重试/重放）时覆盖而非抛 UNIQUE 约束错误
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, attachments, error, error_kind, stop_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           created_at = excluded.created_at,
           attachments = excluded.attachments,
           error = excluded.error,
           error_kind = excluded.error_kind,
           stop_reason = excluded.stop_reason`
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
        msg.stopReason ?? null
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
    }>
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      pinned: !!r.pinned,
      archived: !!r.archived,
      messages: []
    }))
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id)
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
