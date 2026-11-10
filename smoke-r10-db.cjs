/**
 * 第十轮 DB 冒烟 —— 会话状态角标 / 来源 / 工作空间归属 的落库、读取与旧库补列
 * 运行：在真实 Electron 运行时内执行（node:sqlite 的 DatabaseSync 需 Electron）
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron --no-sandbox --disable-gpu smoke-r10-db.cjs
 *
 * 依赖前置：先由 smoke-r10-db-prep.mjs 用 esbuild 把 store.ts 打包成 .smoke-store.cjs
 */
const { app } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  ✓ ' + name)
  } else {
    fail++
    console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
  }
}

app.whenReady().then(async () => {
  const storePath = path.join(__dirname, '.smoke-store.cjs')
  if (!fs.existsSync(storePath)) {
    console.error('缺少打包产物 .smoke-store.cjs，请先运行 smoke-r10-db-prep.mjs')
    app.exit(2)
    return
  }

  console.log('\n[第十轮 DB 冒烟]')

  // ---------- 1. 新库建会话：默认来源 / 工作空间 / 状态 ----------
  const tmp1 = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r10-db1-'))
  app.setPath('userData', tmp1)
  const { Store } = require(storePath)
  const db = new Store()

  const a = db.createConversation('r10-a')
  ok('createConversation 默认 origin=web', a.origin === 'web', a.origin)
  ok('createConversation workspace=null', a.workspace === null, a.workspace)
  ok('createConversation status=undefined', a.status === undefined, a.status)

  // ---------- 2. 状态角标往返 ----------
  db.setConversationStatus(a.id, 'working')
  ok('setConversationStatus(working) 落库', db.getConversation(a.id).status === 'working')
  db.setConversationStatus(a.id, 'pending')
  ok('setConversationStatus(pending) 覆盖', db.getConversation(a.id).status === 'pending')
  db.setConversationStatus(a.id, undefined)
  ok('setConversationStatus(undefined) 清除', db.getConversation(a.id).status === undefined)

  // ---------- 3. 来源往返 ----------
  db.setConversationOrigin(a.id, 'workbuddyMp')
  ok('setConversationOrigin(workbuddyMp)', db.getConversation(a.id).origin === 'workbuddyMp')
  db.setConversationOrigin(a.id, 'workbuddyApp')
  ok('setConversationOrigin(workbuddyApp) 覆盖', db.getConversation(a.id).origin === 'workbuddyApp')

  // ---------- 4. 工作空间归属 ----------
  db.setConversationWorkspace(a.id, 'my-ws')
  ok('setConversationWorkspace 落库', db.getConversation(a.id).workspace === 'my-ws')
  db.setConversationWorkspace(a.id, null)
  ok('setConversationWorkspace(null) 移出', db.getConversation(a.id).workspace === null)

  // ---------- 5. listConversations 一并返回三字段 ----------
  db.setConversationStatus(a.id, 'failed')
  db.setConversationWorkspace(a.id, 'ws-x')
  const listed = db.listConversations().find((c) => c.id === a.id)
  ok('listConversations 带 status', listed && listed.status === 'failed', listed && listed.status)
  ok('listConversations 带 workspace', listed && listed.workspace === 'ws-x', listed && listed.workspace)
  ok('listConversations 带 origin', listed && listed.origin === 'workbuddyApp', listed && listed.origin)

  // ---------- 6. searchConversations 也带三字段 ----------
  const sFound = db.searchConversations('r10-a').find((c) => c.id === a.id)
  ok('searchConversations 带 status/workspace', !!sFound && sFound.status === 'failed' && sFound.workspace === 'ws-x')

  // ---------- 7. 可按 workspace 分组统计 ----------
  const b = db.createConversation('r10-b')
  db.setConversationWorkspace(b.id, 'ws-y')
  const grouped = {}
  for (const c of db.listConversations()) {
    const k = c.workspace || ''
    grouped[k] = (grouped[k] || 0) + 1
  }
  ok('可按 workspace 分组', grouped['ws-x'] >= 1 && grouped['ws-y'] >= 1, grouped)

  // ---------- 8. 旧库补列：手工造一个无三列的旧库，再让 Store 打开 ----------
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r10-legacy-'))
  const legacyDir = path.join(tmp2, 'db')
  fs.mkdirSync(legacyDir, { recursive: true })
  {
    const { DatabaseSync } = require('node:sqlite')
    const legacy = new DatabaseSync(path.join(legacyDir, 'workbuddy.db'))
    // 旧版表结构（无 status / origin / workspace）
    legacy.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0
      );
    `)
    legacy
      .prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?,?,?,?)')
      .run('legacy-1', '旧会话', Date.now(), Date.now())
    legacy.close()
  }
  app.setPath('userData', tmp2)
  const db2 = new Store()
  const cols = db2.db.prepare("PRAGMA table_info('conversations')").all().map((c) => c.name)
  ok('旧库自动补 status 列', cols.includes('status'), cols.join(','))
  ok('旧库自动补 origin 列', cols.includes('origin'), cols.join(','))
  ok('旧库自动补 workspace 列', cols.includes('workspace'), cols.join(','))
  const legacyConv = db2.getConversation('legacy-1')
  ok('旧库老数据仍可读（status 为 undefined）', !!legacyConv && legacyConv.status === undefined)
  db2.setConversationStatus('legacy-1', 'unread')
  ok('旧库老数据可写入新列', db2.getConversation('legacy-1').status === 'unread')

  console.log(`\n结果：${pass}/${pass + fail} 通过`)
  fs.rmSync(tmp1, { recursive: true, force: true })
  fs.rmSync(tmp2, { recursive: true, force: true })
  app.exit(fail === 0 ? 0 : 1)
}).catch((e) => {
  console.error('冒烟异常：', e)
  app.exit(2)
})
