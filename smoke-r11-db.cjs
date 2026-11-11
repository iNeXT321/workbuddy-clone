/**
 * 第十一轮 DB 冒烟 —— 定时任务存储与调度器状态推进（automations / automation_runs）
 * 运行：在真实 Electron 运行时内执行（node:sqlite 的 DatabaseSync 需 Electron）
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage smoke-r11-db.cjs
 *
 * 依赖前置：先由 smoke-r11-db-prep.mjs 用 esbuild 把 store.ts 打包成 .smoke-store.cjs
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
function eq(name, actual, expected) {
  ok(name, actual === expected, { actual, expected })
}

app.whenReady().then(async () => {
  const storePath = path.join(__dirname, '.smoke-store.cjs')
  if (!fs.existsSync(storePath)) {
    console.error('缺少打包产物 .smoke-store.cjs，请先运行 smoke-r11-db-prep.mjs')
    app.exit(2)
    return
  }

  console.log('\n[第十一轮 DB 冒烟]')

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r11-db-'))
  app.setPath('userData', tmp)
  const { Store } = require(storePath)
  const db = new Store()

  const now = Date.now()

  // ---------- 1. 新建（insert） ----------
  console.log('\n-- 定时任务新建 --')
  const a1 = {
    id: 'auto-1',
    name: '每日简报',
    prompt: '汇总昨日动态',
    schedule: { kind: 'daily', time: '09:00' },
    permission: 'default',
    enabled: true,
    archived: false,
    env: 'local',
    createdAt: now,
    updatedAt: now
  }
  const saved = db.saveAutomation(a1)
  eq('保存返回 id 一致', saved.id, 'auto-1')
  eq('名称落库', saved.name, '每日简报')
  eq('schedule JSON 往返', saved.schedule.kind, 'daily')
  eq('schedule.time 往返', saved.schedule.time, '09:00')
  ok('enabled 落库为 true', saved.enabled === true)
  ok('next_run_at 已自动计算', typeof saved.nextRunAt === 'number' && saved.nextRunAt > now, saved.nextRunAt)

  // ---------- 2. 更新（upsert） ----------
  console.log('\n-- 定时任务更新（upsert） --')
  const upd = db.saveAutomation({ ...saved, name: '每日简报（改）', schedule: { kind: 'weekly', time: '08:30', weekdays: ['MO'] } })
  eq('同 id 为更新而非新增', db.listAutomations(true).length, 1)
  eq('名称已更新', upd.name, '每日简报（改）')
  eq('schedule 已更新', upd.schedule.kind, 'weekly')
  ok('next_run_at 随 schedule 变化', upd.nextRunAt !== saved.nextRunAt, { before: saved.nextRunAt, after: upd.nextRunAt })

  // ---------- 3. 启停 ----------
  console.log('\n-- 启停 --')
  const paused = db.setAutomationEnabled('auto-1', false)
  ok('暂停后 enabled=false', paused.enabled === false)
  ok('暂停后 next_run_at 清空', !paused.nextRunAt)
  const resumed = db.setAutomationEnabled('auto-1', true)
  ok('恢复后 enabled=true', resumed.enabled === true)
  ok('恢复后 next_run_at 重算', typeof resumed.nextRunAt === 'number' && resumed.nextRunAt > now)

  // ---------- 4. 归档 / 取消归档 ----------
  console.log('\n-- 归档 --')
  const arch = db.setAutomationArchived('auto-1', true)
  ok('归档后 archived=true', arch.archived === true)
  ok('归档同时停用', arch.enabled === false)
  eq('默认列表不含归档项', db.listAutomations(false).length, 0)
  eq('includeArchived 含归档项', db.listAutomations(true).length, 1)
  const unarch = db.setAutomationArchived('auto-1', false)
  ok('取消归档后 archived=false', !unarch.archived)
  eq('取消归档后回到默认列表', db.listAutomations(false).length, 1)

  // ---------- 5. dueAutomations 到点判定 ----------
  console.log('\n-- 到点任务查询 --')
  const past = { ...a1, id: 'auto-due', schedule: { kind: 'once', at: now + 60000 }, enabled: true, createdAt: now, updatedAt: now }
  db.saveAutomation(past)
  eq('未到点 → due 为空', db.dueAutomations(now).filter((a) => a.id === 'auto-due').length, 0)
  eq('到点 → due 含该项', db.dueAutomations(now + 120000).filter((a) => a.id === 'auto-due').length, 1)
  // 停用项不应出现在 due
  db.setAutomationEnabled('auto-due', false)
  eq('停用后不再 due', db.dueAutomations(now + 120000).filter((a) => a.id === 'auto-due').length, 0)
  db.setAutomationEnabled('auto-due', true)

  // ---------- 6. markAutomationRun：once 执行后停用 ----------
  console.log('\n-- 执行后推进 --')
  db.markAutomationRun('auto-due', now + 70000)
  const afterOnce = db.getAutomation('auto-due')
  eq('once 执行后自动停用', afterOnce.enabled, false)
  eq('once 执行后 last_run_at 写入', afterOnce.lastRunAt, now + 70000)
  ok('once 执行后无 next_run_at', !afterOnce.nextRunAt)
  // daily 执行后应仍有下一次
  db.markAutomationRun('auto-1', now)
  const afterDaily = db.getAutomation('auto-1')
  eq('daily 执行后仍启用', afterDaily.enabled, true)
  ok('daily 执行后有下一次', typeof afterDaily.nextRunAt === 'number' && afterDaily.nextRunAt > now)

  // ---------- 7. 运行记录 upsert ----------
  console.log('\n-- 运行记录 --')
  const runBase = {
    id: 'run-1',
    automationId: 'auto-1',
    taskName: '每日简报（改）',
    status: 'running',
    startedAt: now
  }
  db.addAutomationRun(runBase)
  eq('记录写入', db.listAutomationRuns('auto-1').length, 1)
  eq('初始状态 running', db.listAutomationRuns('auto-1')[0].status, 'running')
  db.addAutomationRun({ ...runBase, status: 'succeeded', finishedAt: now + 5000, summary: '完成', evidence: { assistantOutput: true } })
  eq('同 id 为更新（不重复）', db.listAutomationRuns('auto-1').length, 1)
  const r0 = db.listAutomationRuns('auto-1')[0]
  eq('状态已更新为 succeeded', r0.status, 'succeeded')
  eq('summary 落库', r0.summary, '完成')
  ok('evidence JSON 往返', r0.evidence && r0.evidence.assistantOutput === true, r0.evidence)
  eq('finishedAt 落库', r0.finishedAt, now + 5000)

  // 失败记录含分因
  db.addAutomationRun({ id: 'run-2', automationId: 'auto-1', taskName: '每日简报（改）', status: 'failed', reason: 'network', startedAt: now + 1000, finishedAt: now + 2000, error: 'fetch failed' })
  const failed = db.listAutomationRuns('auto-1').find((r) => r.id === 'run-2')
  eq('失败分因 reason 落库', failed.reason, 'network')
  eq('错误全文落库', failed.error, 'fetch failed')
  eq('列表按 started_at 倒序（新在前）', db.listAutomationRuns('auto-1')[0].id, 'run-2')

  // 测试运行标记
  db.addAutomationRun({ id: 'run-3', automationId: 'auto-1', taskName: '每日简报（改）', status: 'succeeded', startedAt: now + 3000, test: true })
  ok('test 标记落库', db.listAutomationRuns('auto-1').find((r) => r.id === 'run-3').test === true)

  // ---------- 8. 记录归档 / 删除 ----------
  console.log('\n-- 记录归档与删除 --')
  db.setRunArchived('run-1', true)
  ok('归档后默认列表不含 run-1', !db.listAutomationRuns('auto-1').some((r) => r.id === 'run-1'))
  ok('includeArchived 含 run-1', db.listAutomationRuns('auto-1', true).some((r) => r.id === 'run-1'))
  db.deleteAutomationRun('run-2')
  ok('删除后记录消失', !db.listAutomationRuns('auto-1', true).some((r) => r.id === 'run-2'))

  // ---------- 9. 批量删除 ----------
  console.log('\n-- 批量删除 --')
  db.saveAutomation({ ...a1, id: 'auto-2', name: '任务二', createdAt: now, updatedAt: now })
  const batch = db.deleteAutomations(['auto-2', 'not-exist'])
  eq('批量删除成功数 1', batch.success, 1)
  eq('批量删除失败列表含不存在 id', batch.failed[0], 'not-exist')

  // ---------- 10. 删除任务级联清理记录 ----------
  console.log('\n-- 删除任务级联 --')
  db.deleteAutomation('auto-1')
  ok('任务删除后记录一并清理', db.listAutomationRuns('auto-1', true).length === 0)
  ok('任务本身消失', db.getAutomation('auto-1') === null)

  // ---------- 11. 旧库补列（模拟旧版本无 automation 表） ----------
  console.log('\n-- 旧库兼容 --')
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r11-db2-'))
  // 手动建一个只含 conversations/messages 的旧库，再让 Store 打开
  const { DatabaseSync } = require('node:sqlite')
  const oldDb = new DatabaseSync(path.join(tmp2, 'workbuddy.db'))
  oldDb.exec(`
    CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, content TEXT, created_at INTEGER);
  `)
  oldDb.close()
  app.setPath('userData', tmp2)
  const { Store: Store2 } = require(storePath)
  let db2 = null
  let opened = true
  try {
    db2 = new Store2()
  } catch (e) {
    opened = false
    console.log('  打开旧库异常:', e.message)
  }
  ok('旧库可打开（自动建 automation 表）', opened)
  if (opened) {
    const list = db2.listAutomations(true)
    ok('旧库打开后 automation 列表为空但可用', Array.isArray(list) && list.length === 0)
    const s = db2.saveAutomation({ id: 'x', name: 'n', prompt: 'p', schedule: { kind: 'daily', time: '09:00' }, permission: 'default', enabled: true, createdAt: now, updatedAt: now })
    ok('旧库可写入新表', s.id === 'x')
  }

  console.log(`\n结果：${pass}/${pass + fail} 通过`)
  app.exit(fail === 0 ? 0 : 1)
})
