/**
 * 第十二轮 DB 冒烟 —— 日程存储（schedule_events 表）与日历默认设置
 * 运行（需真实 Electron 内的 node:sqlite）：
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron \
 *     --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage smoke-r12-db.cjs
 *
 * 依赖前置：node smoke-r12-db-prep.mjs（用 esbuild 打包 store.ts → .smoke-store.cjs）
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
    console.error('缺少打包产物 .smoke-store.cjs，请先运行 smoke-r12-db-prep.mjs')
    app.exit(2)
    return
  }
  const { Store } = require(storePath)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r12-db-'))
  app.setPath('userData', tmp)
  const store = new Store()

  const DAY = 86400000
  const base = new Date(2026, 11, 15, 10, 0, 0, 0).getTime()
  const ev = (over = {}) => ({
    id: 'e1',
    title: '方案评审',
    startAt: base,
    endAt: base + 3600000,
    allDay: false,
    reminder: '15',
    source: 'managed',
    kind: 'personal',
    participants: [{ name: '李昊', rsvp: 'needsAction' }],
    cancelled: false,
    createdAt: base,
    updatedAt: base,
    ...over
  })

  console.log('\n[第十二轮 DB 冒烟 · 日程存储]')

  // ---------- 1. 建表与初始状态 ----------
  console.log('\n-- 建表 --')
  const tables = store.db ? [] : []
  eq('初始列表为空', store.listEvents().length, 0)

  // ---------- 2. CRUD ----------
  console.log('\n-- CRUD --')
  const saved = store.saveEvent(ev())
  eq('保存后 id 一致', saved.id, 'e1')
  eq('标题往返', saved.title, '方案评审')
  eq('起点往返', saved.startAt, base)
  eq('终点往返', saved.endAt, base + 3600000)
  eq('全天往返', saved.allDay, false)
  eq('提醒往返', saved.reminder, '15')
  eq('来源往返', saved.source, 'managed')
  eq('参与人往返', saved.participants.length, 1)
  eq('参与人名往返', saved.participants[0].name, '李昊')
  eq('RSVP 往返', saved.participants[0].rsvp, 'needsAction')
  eq('列表 1 条', store.listEvents().length, 1)

  // ---------- 3. 更新 ----------
  console.log('\n-- 更新 --')
  store.saveEvent(ev({ title: '改名后', location: 'A 栋 3 楼' }))
  eq('更新后标题', store.getEvent('e1').title, '改名后')
  eq('更新后地点', store.getEvent('e1').location, 'A 栋 3 楼')
  eq('更新不新增行', store.listEvents().length, 1)
  eq('createdAt 不被覆盖', store.getEvent('e1').createdAt, base)

  // ---------- 4. 区间过滤（交叠语义） ----------
  console.log('\n-- 区间过滤 --')
  store.saveEvent(ev({ id: 'e2', title: '后天会议', startAt: base + 2 * DAY, endAt: base + 2 * DAY + 3600000 }))
  store.saveEvent(ev({ id: 'e3', title: '上月会议', startAt: base - 30 * DAY, endAt: base - 30 * DAY + 3600000 }))
  eq('共 3 条', store.listEvents().length, 3)
  eq('当天区间命中 e1', store.listEvents({ from: base, to: base + DAY }).map((e) => e.id).sort().join(','), 'e1')
  eq('跨天区间命中 e1+e2', store.listEvents({ from: base, to: base + 3 * DAY }).length, 2)
  eq('远期区间命中 e2', store.listEvents({ from: base + 2 * DAY, to: base + 3 * DAY }).map((e) => e.id).join(','), 'e2')
  eq('过去区间命中 e3', store.listEvents({ from: base - 31 * DAY, to: base - 29 * DAY }).map((e) => e.id).join(','), 'e3')
  // 交叠：跨度跨过整段区间的日程也应命中
  const longEv = ev({ id: 'e-long', startAt: base - 5 * DAY, endAt: base + 5 * DAY })
  store.saveEvent(longEv)
  eq('长跨天日程在区间中部仍命中', store.listEvents({ from: base, to: base + DAY }).some((e) => e.id === 'e-long'), true)

  // ---------- 5. 来源过滤 ----------
  console.log('\n-- 来源过滤 --')
  store.saveEvent(ev({ id: 'e-ch', title: '频道日程', source: 'channels', kind: 'channel' }))
  eq('按 managed 过滤', store.listEvents({ source: 'managed' }).every((e) => e.source === 'managed'), true)
  eq('按 channels 过滤命中 1 条', store.listEvents({ source: 'channels' }).length, 1)
  eq('按 subscribed 过滤 0 条', store.listEvents({ source: 'subscribed' }).length, 0)

  // ---------- 6. 排序 ----------
  console.log('\n-- 排序 --')
  const ordered = store.listEvents()
  ok('按 startAt 升序', ordered.every((e, i) => i === 0 || ordered[i - 1].startAt <= e.startAt), ordered.map((e) => e.startAt))

  // ---------- 7. 取消与可见性 ----------
  console.log('\n-- 取消 --')
  const c = store.cancelEvent('e1')
  eq('取消返回记录了 cancelled', c.cancelled, true)
  eq('默认列表不含已取消', store.listEvents().some((e) => e.id === 'e1'), false)
  eq('includeCancelled 可查到', store.listEvents({ includeCancelled: true }).some((e) => e.id === 'e1'), true)
  eq('取消不删行', store.getEvent('e1').cancelled, true)
  store.saveEvent(ev({ cancelled: false }))
  eq('可恢复为未取消', store.getEvent('e1').cancelled, false)

  // ---------- 8. 重复规则往返 ----------
  console.log('\n-- 重复往返 --')
  store.saveEvent(ev({ id: 'e-rep', repeat: { kind: 'weekly', weekdays: [2, 4], until: base + 30 * DAY } }))
  const rep = store.getEvent('e-rep').repeat
  eq('重复类型往返', rep.kind, 'weekly')
  eq('星期集合往返', rep.weekdays.join(','), '2,4')
  eq('截止时间往返', rep.until, base + 30 * DAY)
  store.saveEvent(ev({ id: 'e-norep' }))
  eq('无重复时为空', store.getEvent('e-norep').repeat, undefined)

  // ---------- 9. 删除 ----------
  console.log('\n-- 删除 --')
  const beforeCount = store.listEvents({ includeCancelled: true }).length
  eq('删除返回 true', store.deleteEvent('e2'), true)
  eq('删除后少 1 条', store.listEvents({ includeCancelled: true }).length, beforeCount - 1)
  eq('删除不存在返回 false', store.deleteEvent('nope'), false)
  eq('已删除不可查', store.getEvent('e2'), null)

  // ---------- 10. 日历默认设置 ----------
  console.log('\n-- 日历默认设置 --')
  const d0 = store.getCalendarDefaults()
  eq('默认时长 60', d0.defaultDurationMinutes, 60)
  eq('默认全天提醒', d0.allDayReminder, 'sameDay0900')
  const d1 = store.saveCalendarDefaults({ defaultDurationMinutes: 90, showLunar: true })
  eq('保存后时长 90', d1.defaultDurationMinutes, 90)
  eq('保存后 showLunar true', d1.showLunar, true)
  const d2 = store.getCalendarDefaults()
  eq('重读时长 90', d2.defaultDurationMinutes, 90)
  eq('重读 showLunar true', d2.showLunar, true)
  eq('未改动项保留默认', d2.timedReminder, d0.timedReminder)
  const d3 = store.saveCalendarDefaults({ timedReminder: 'min30' })
  eq('部分更新保留已改项', d3.defaultDurationMinutes, 90)
  eq('部分更新生效', d3.timedReminder, 'min30')

  // ---------- 11. 旧库兼容 ----------
  console.log('\n-- 旧库兼容 --')
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r12-legacy-'))
  app.setPath('userData', legacyDir)
  // 先造一个「旧库」：只有 kv 表
  const DatabaseSync = require('node:sqlite').DatabaseSync
  fs.mkdirSync(path.join(legacyDir, 'db'), { recursive: true })
  const legacy = new DatabaseSync(path.join(legacyDir, 'db', 'workbuddy.db'))
  legacy.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);')
  legacy.exec("INSERT INTO kv (key, value) VALUES ('settings', '{}')")
  legacy.close()
  const legacyStore = new Store()
  eq('旧库可打开（自动建 schedule_events）', Array.isArray(legacyStore.listEvents()), true)
  eq('旧库打开后日程列表为空', legacyStore.listEvents().length, 0)
  const ls = legacyStore.saveEvent(ev({ id: 'legacy-1', title: '旧库写入' }))
  eq('旧库可写入新表', ls.id, 'legacy-1')
  eq('旧库写入后可读', legacyStore.getEvent('legacy-1').title, '旧库写入')
  eq('旧库日历默认值可用', legacyStore.getCalendarDefaults().defaultDurationMinutes, 60)
  legacyStore.saveCalendarDefaults({ weekStart: 1 })
  eq('旧库可保存日历设置', new Store().getCalendarDefaults().weekStart, 1)

  console.log(`\n结果：${pass}/${pass + fail} 通过`)
  app.exit(fail === 0 ? 0 : 1)
})
