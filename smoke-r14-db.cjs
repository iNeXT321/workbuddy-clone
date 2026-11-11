/**
 * 第十四轮 DB 冒烟 —— 技能市场 / 技能管理存储（skills 单表 + 索引）。
 * 运行（需真实 Electron 内的 node:sqlite）：
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron \
 *     --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage smoke-r14-db.cjs
 *
 * 依赖前置：node smoke-r14-db-prep.mjs
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
    console.error('缺少打包产物 .smoke-store.cjs，请先运行 smoke-r14-db-prep.mjs')
    app.exit(2)
    return
  }
  const { Store } = require(storePath)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r14-db-'))
  app.setPath('userData', tmp)
  const store = new Store()

  const base = new Date(2026, 11, 15, 10, 0, 0, 0).getTime()
  const sk = (over = {}) => ({
    id: 's1',
    name: 'PDF 总结',
    description: '把 PDF 总结成要点',
    source: 'installed',
    installedGroup: 'custom',
    version: '1.0.0',
    author: 'wb',
    license: 'MIT',
    installed: true,
    enabled: true,
    pinned: false,
    builtin: false,
    needsApiKey: false,
    apiKeyConfigured: false,
    sync: 'localOnly',
    cloudAvailable: false,
    paidKind: 'free',
    refundCount: 0,
    riskLevel: 'safe',
    metrics: { downloadCount: 100, starCount: 10, useCount: 5, installCount: 3 },
    tags: ['pdf', 'summary'],
    createdAt: base,
    updatedAt: base,
    ...over
  })

  console.log('\n[第十四轮 DB 冒烟 · 技能存储]')

  // ---------- 1. 初始状态 ----------
  console.log('\n-- 建表 --')
  eq('初始技能列表为空', store.listSkills().length, 0)
  eq('初始启用数为 0', store.countEnabledSkills(), 0)
  eq('getSkill 不存在返回 null', store.getSkill('nope'), null)
  eq('deleteSkill 不存在返回 false', store.deleteSkill('nope'), false)

  // ---------- 2. CRUD ----------
  console.log('\n-- CRUD --')
  const saved = store.saveSkill(sk({ id: 's1' }))
  eq('保存后 id 一致', saved.id, 's1')
  eq('名称往返', saved.name, 'PDF 总结')
  eq('描述往返', saved.description, '把 PDF 总结成要点')
  eq('来源往返', saved.source, 'installed')
  eq('分组往返', saved.installedGroup, 'custom')
  eq('版本往返', saved.version, '1.0.0')
  eq('作者往返', saved.author, 'wb')
  eq('license 往返', saved.license, 'MIT')
  eq('installed 位', saved.installed, true)
  eq('enabled 位', saved.enabled, true)
  eq('pinned 位', saved.pinned, false)
  eq('builtin 位', saved.builtin, false)
  eq('needsApiKey 位', saved.needsApiKey, false)
  eq('sync 往返', saved.sync, 'localOnly')
  eq('cloudAvailable 位', saved.cloudAvailable, false)
  eq('paidKind 往返', saved.paidKind, 'free')
  eq('refundCount 往返', saved.refundCount, 0)
  eq('riskLevel 往返', saved.riskLevel, 'safe')
  eq('metrics.downloadCount 往返', saved.metrics.downloadCount, 100)
  eq('metrics.starCount 往返', saved.metrics.starCount, 10)
  eq('metrics.useCount 往返', saved.metrics.useCount, 5)
  eq('metrics.installCount 往返', saved.metrics.installCount, 3)
  eq('tags 往返', saved.tags.join(','), 'pdf,summary')
  eq('createdAt 保留', saved.createdAt, base)
  eq('读取一致', store.getSkill('s1').name, 'PDF 总结')
  eq('列表长度为 1', store.listSkills().length, 1)

  // ---------- 3. 索引存在 ----------
  console.log('\n-- 索引 --')
  const DatabaseSync = require('node:sqlite').DatabaseSync
  const dbFile = path.join(tmp, 'db', 'workbuddy.db')
  const raw = new DatabaseSync(dbFile)
  const idx = raw.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='skills'").all().map((r) => r.name)
  ok('存在 idx_skills_source', idx.includes('idx_skills_source'), idx)
  ok('存在 idx_skills_pinned', idx.includes('idx_skills_pinned'), idx)
  const cols = raw.prepare('PRAGMA table_info(skills)').all().map((r) => r.name)
  ok('有 sync_state 列', cols.includes('sync_state'))
  ok('有 paid_kind 列', cols.includes('paid_kind'))
  ok('有 refund_count 列', cols.includes('refund_count'))
  ok('有 risk_level 列', cols.includes('risk_level'))
  ok('有 metrics 列', cols.includes('metrics'))
  ok('有 tags 列', cols.includes('tags'))
  raw.close()

  // ---------- 4. 安装 / 卸载 ----------
  console.log('\n-- 安装 / 卸载 --')
  store.saveSkill(sk({ id: 's-not', source: 'recommend', installed: false, enabled: false, installedGroup: undefined }))
  const inst = store.setSkillInstalled('s-not', true)
  eq('安装后 installed=true', inst.installed, true)
  eq('安装后补默认分组 market', inst.installedGroup, 'market')
  const un = store.setSkillInstalled('s-not', false)
  eq('卸载后 installed=false', un.installed, false)
  eq('卸载后 enabled 归 false', un.enabled, false)
  eq('卸载不删记录', store.getSkill('s-not') !== null, true)
  eq('安装不存在的返回 null', store.setSkillInstalled('ghost', true), null)
  eq('卸载不存在的返回 null', store.setSkillInstalled('ghost', false), null)

  // ---------- 5. 启用 / 停用（自动触发） ----------
  console.log('\n-- 启用 / 停用 --')
  const on = store.setSkillEnabled('s1', true)
  eq('启用生效', on.enabled, true)
  eq('启用后计数 1', store.countEnabledSkills(), 1)
  const off = store.setSkillEnabled('s1', false)
  eq('停用生效', off.enabled, false)
  eq('停用后计数 0', store.countEnabledSkills(), 0)
  store.setSkillEnabled('s1', true)
  // 未安装的技能即便 enabled=1 也不计入（countEnabledSkills 要求 installed=1）
  store.saveSkill(sk({ id: 's-ghost', installed: false, enabled: true }))
  eq('未安装不计入启用数', store.countEnabledSkills(), 1)
  eq('启停不存在的返回 null', store.setSkillEnabled('ghost', true), null)

  // ---------- 6. 置顶排序（含同毫秒平局） ----------
  console.log('\n-- 置顶排序 --')
  store.saveSkill(sk({ id: 'p1', name: 'P1' }))
  store.saveSkill(sk({ id: 'p2', name: 'P2' }))
  store.saveSkill(sk({ id: 'p3', name: 'P3' }))
  eq('默认无置顶时按更新时间倒序（后写在前）', store.listSkills().filter((s) => s.id.startsWith('p'))[0].id, 'p3')
  store.setSkillPinned('p1', true)
  eq('置顶后排最前', store.listSkills()[0].id, 'p1')
  // 连续置顶→取消置顶：时间戳必须严格递增，否则 ORDER BY 平局导致顺序不确定
  store.setSkillPinned('p2', true)
  store.setSkillPinned('p2', false)
  const afterToggle = store.listSkills()
  eq('连续置顶切换后 p2 应排在 p3 之前（时间戳严格递增）', afterToggle.findIndex((s) => s.id === 'p2') < afterToggle.findIndex((s) => s.id === 'p3'), true)
  eq('取消置顶不影响 p1 置顶位', afterToggle[0].id, 'p1')
  store.setSkillPinned('p1', false)
  // 此时无置顶，按 updated_at 倒序：p1 最后一次写入（取消置顶）在 p2 之后 → p1 最前
  eq('全部取消置顶后按更新时间倒序（p1 最后写入故最前）', store.listSkills()[0].id, 'p1')
  eq('置顶不存在的返回 null', store.setSkillPinned('ghost', true), null)

  // ---------- 7. 云端同步 ----------
  console.log('\n-- 云端同步 --')
  const up = store.setSkillSync('s1', 'synced')
  eq('上传后 sync=synced', up.sync, 'synced')
  eq('上传后 cloudAvailable=true', up.cloudAvailable, true)
  const co = store.setSkillSync('s1', 'cloudOnly')
  eq('cloudOnly 往返', co.sync, 'cloudOnly')
  const back = store.setSkillSync('s1', 'localOnly')
  eq('回本地 sync=localOnly', back.sync, 'localOnly')
  eq('回本地后 cloudAvailable=false', back.cloudAvailable, false)
  const la = store.setSkillSync('s1', 'localAhead')
  eq('localAhead 往返', la.sync, 'localAhead')
  const ca = store.setSkillSync('s1', 'cloudAhead')
  eq('cloudAhead 往返', ca.sync, 'cloudAhead')
  eq('同步不存在的返回 null', store.setSkillSync('ghost', 'synced'), null)

  // ---------- 8. 付费 / 退款 ----------
  console.log('\n-- 付费 / 退款 --')
  store.saveSkill(sk({ id: 'pay1', paidKind: 'monthly', price: 19 }))
  const buyM = store.purchaseSkill('pay1', 'monthly', 19)
  eq('按月购买 paidKind', buyM.paidKind, 'monthly')
  eq('按月购买价格', buyM.price, 19)
  ok('按月购买有有效期', typeof buyM.purchasedUntil === 'number' && buyM.purchasedUntil > buyM.purchasedAt)
  const buyP = store.purchaseSkill('pay1', 'permanent', 99)
  eq('永久购买 paidKind', buyP.paidKind, 'permanent')
  eq('永久购买无有效期', buyP.purchasedUntil, undefined)
  const rf = store.refundSkill('pay1')
  eq('退款累计次数 1', rf.refundCount, 1)
  eq('退款后清空购买时间', rf.purchasedAt, undefined)
  eq('退款后清空有效期', rf.purchasedUntil, undefined)
  eq('退款同时卸载', rf.installed, false)
  eq('退款后 enabled 归 false', rf.enabled, false)
  const rf2 = store.refundSkill('pay1')
  eq('二次退款累计 2', rf2.refundCount, 2)
  eq('退款不存在的返回 null', store.refundSkill('ghost'), null)
  eq('购买不存在的返回 null', store.purchaseSkill('ghost', 'monthly'), null)
  // 退款次数持久化
  eq('退款次数持久化', store.getSkill('pay1').refundCount, 2)

  // ---------- 9. 批量操作 ----------
  console.log('\n-- 批量操作 --')
  store.saveSkill(sk({ id: 'b1', name: 'B1' }))
  store.saveSkill(sk({ id: 'b2', name: 'B2' }))
  store.saveSkill(sk({ id: 'b3', name: 'B3' }))
  const ben = store.batchSetSkillEnabled(['b1', 'b2', 'ghost'], true)
  eq('批量启用成功 2 项', ben.ok.length, 2)
  eq('批量启用失败 1 项', ben.failed.join(','), 'ghost')
  eq('b1 已启用', store.getSkill('b1').enabled, true)
  const bdis = store.batchSetSkillEnabled(['b1', 'b2'], false)
  eq('批量停用成功 2 项', bdis.ok.length, 2)
  eq('b1 已停用', store.getSkill('b1').enabled, false)
  const bun = store.batchUninstallSkills(['b1', 'b2', 'ghost'])
  eq('批量卸载成功 2 项', bun.ok.length, 2)
  eq('批量卸载失败 1 项', bun.failed.join(','), 'ghost')
  eq('b1 已卸载', store.getSkill('b1').installed, false)
  eq('批量卸载不删记录', store.getSkill('b1') !== null, true)
  eq('批量空数组安全', store.batchUninstallSkills([]).ok.length, 0)

  // ---------- 10. 删除 ----------
  console.log('\n-- 删除 --')
  eq('删除存在返回 true', store.deleteSkill('b3'), true)
  eq('删除后读不到', store.getSkill('b3'), null)
  eq('删除后列表少一项', store.listSkills().some((s) => s.id === 'b3'), false)

  // ---------- 11. 更新为覆盖 ----------
  console.log('\n-- 更新语义 --')
  const upd = store.saveSkill({ ...store.getSkill('s1'), name: 'PDF 总结 v2', version: '2.0.0' })
  eq('更新后名称', upd.name, 'PDF 总结 v2')
  eq('更新后版本', upd.version, '2.0.0')
  eq('更新前版本', store.listSkills().filter((s) => s.id === 's1')[0].version, '2.0.0')
  eq('更新不新增行', store.listSkills().filter((s) => s.id === 's1').length, 1)
  // createdAt 用未来时间（2026-12-15）而 updatedAt 由真实 Date.now() 产生，
  // 二者不可比；改验「再次保存时间戳严格推进」（单调递增时间戳语义）
  const t1 = store.saveSkill({ ...store.getSkill('s1'), name: 'PDF 总结 v3' }).updatedAt
  const t2 = store.saveSkill({ ...store.getSkill('s1'), name: 'PDF 总结 v4' }).updatedAt
  ok('连续保存 updatedAt 严格递增', t2 > t1, { t1, t2 })

  // ---------- 12. null 字段处理 ----------
  console.log('\n-- 空值处理 --')
  const bare = store.saveSkill({
    id: 'bare',
    name: 'Bare',
    source: 'knot',
    installed: false,
    enabled: false,
    pinned: false,
    builtin: false,
    needsApiKey: false,
    sync: 'localOnly',
    cloudAvailable: false,
    paidKind: 'free',
    metrics: { downloadCount: 0, starCount: 0, useCount: 0, installCount: 0 },
    tags: [],
    createdAt: base,
    updatedAt: base
  })
  eq('缺 description 为 undefined', bare.description, undefined)
  eq('缺 installedGroup 为 undefined', bare.installedGroup, undefined)
  eq('缺 riskLevel 为 undefined', bare.riskLevel, undefined)
  eq('缺 price 为 undefined', bare.price, undefined)
  eq('空 tags 为数组', Array.isArray(bare.tags), true)
  eq('空 tags 长度 0', bare.tags.length, 0)
  eq('metrics 全零', bare.metrics.downloadCount + bare.metrics.starCount + bare.metrics.useCount + bare.metrics.installCount, 0)

  // ---------- 13. 旧库兼容 ----------
  console.log('\n-- 旧库兼容 --')
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r14-legacy-'))
  app.setPath('userData', legacyDir)
  fs.mkdirSync(path.join(legacyDir, 'db'), { recursive: true })
  const legacy = new DatabaseSync(path.join(legacyDir, 'db', 'workbuddy.db'))
  legacy.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);')
  legacy.exec("INSERT INTO kv (key, value) VALUES ('settings', '{}')")
  legacy.close()
  const legacyStore = new Store()
  eq('旧库可打开（自动建 skills）', Array.isArray(legacyStore.listSkills()), true)
  eq('旧库技能列表为空', legacyStore.listSkills().length, 0)
  const ls = legacyStore.saveSkill(sk({ id: 'legacy-s1', name: '旧库技能' }))
  eq('旧库可写入技能表', ls.id, 'legacy-s1')
  eq('旧库写入后可读', legacyStore.getSkill('legacy-s1').name, '旧库技能')
  eq('旧库索引可用', legacyStore.listSkills().length, 1)
  legacyStore.setSkillPinned('legacy-s1', true)
  eq('旧库可置顶', new Store().getSkill('legacy-s1').pinned, true)

  console.log(`\n结果：${pass}/${pass + fail} 通过`)
  app.exit(fail === 0 ? 0 : 1)
})
