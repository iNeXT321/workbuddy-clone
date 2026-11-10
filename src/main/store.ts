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
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attachments TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    `)

    // 兼容旧库：老版本 messages 表无 attachments 列，补列（ALTER 幂等失败则忽略）
    const cols = this.db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === 'attachments')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN attachments TEXT')
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
      mode: 'default'
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
  listConversations(): Conversation[] {
    const rows = this.db
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
      .all() as Array<{ id: string; title: string; created_at: number; updated_at: number }>
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messages: []
    }))
  }

  createConversation(title: string): Conversation {
    const now = Date.now()
    const id = crypto.randomUUID()
    this.db
      .prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, title || '新对话', now, now)
    return { id, title: title || '新对话', createdAt: now, updatedAt: now, messages: [] }
  }

  getConversation(id: string): Conversation | null {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | { id: string; title: string; created_at: number; updated_at: number }
      | undefined
    if (!row) return null
    const msgs = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY rowid ASC')
      .all(id) as Array<{ id: string; role: string; content: string; created_at: number; attachments: string | null }>
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role as ChatMessage['role'],
        content: m.content,
        createdAt: m.created_at,
        attachments: m.attachments ? (JSON.parse(m.attachments) as ChatMessage['attachments']) : undefined
      }))
    }
  }

  appendMessage(conversationId: string, msg: ChatMessage): void {
    this.db
      .prepare(
        'INSERT INTO messages (id, conversation_id, role, content, created_at, attachments) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        msg.id,
        conversationId,
        msg.role,
        msg.content,
        msg.createdAt,
        msg.attachments && msg.attachments.length ? JSON.stringify(msg.attachments) : null
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

  // 会话搜索：按标题或消息内容检索（对齐原版 search 能力）
  searchConversations(query: string): Conversation[] {
    const q = `%${query}%`
    const rows = this.db
      .prepare(
        `SELECT DISTINCT c.* FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.title LIKE ? OR m.content LIKE ?
         ORDER BY c.updated_at DESC`
      )
      .all(q, q) as Array<{ id: string; title: string; created_at: number; updated_at: number }>
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
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
