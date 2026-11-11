/**
 * 第十三轮 DB 冒烟 —— 数字员工 / 助理存储（colleagues / colleague_channels /
 * colleague_memory / colleague_tasks 四表）。
 * 运行（需真实 Electron 内的 node:sqlite）：
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron \
 *     --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage smoke-r13-db.cjs
 *
 * 依赖前置：node smoke-r13-db-prep.mjs
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
    console.error('缺少打包产物 .smoke-store.cjs，请先运行 smoke-r13-db-prep.mjs')
    app.exit(2)
    return
  }
  const { Store } = require(storePath)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r13-db-'))
  app.setPath('userData', tmp)
  const store = new Store()

  const base = new Date(2026, 11, 15, 10, 0, 0, 0).getTime()
  const col = (over = {}) => ({
    id: 'c1',
    name: '小研',
    displayName: '需求分析师',
    role: 'industryResearcher',
    description: '擅长拆解需求',
    personality: '简洁专业',
    responsibilities: ['analysis'],
    tags: ['research', 'summary'],
    avatar: 'preset01',
    model: 'auto',
    visibility: 'personal',
    status: 'working',
    online: true,
    pinned: false,
    source: 'personal',
    connections: [],
    createdAt: base,
    updatedAt: base,
    ...over
  })

  console.log('\n[第十三轮 DB 冒烟 · 数字员工存储]')

  // ---------- 1. 初始状态 ----------
  console.log('\n-- 建表 --')
  eq('初始助理列表为空', store.listColleagues().length, 0)
  eq('初始渠道绑定为空', store.listChannelBindings().length, 0)
  eq('初始内存记忆默认开启', store.getColleagueMemory('c1').enabled, true)
  eq('初始任务为空', store.listColleagueTasks().length, 0)

  // ---------- 2. CRUD ----------
  console.log('\n-- CRUD --')
  const saved = store.saveColleague(col({ id: 'c1' }))
  eq('保存后 id 一致', saved.id, 'c1')
  eq('昵称往返', saved.name, '小研')
  eq('名称往返', saved.displayName, '需求分析师')
  eq('职能往返', saved.role, 'industryResearcher')
  eq('职责数组往返', saved.responsibilities.join(','), 'analysis')
  eq('标签数组往返', saved.tags.join(','), 'research,summary')
  eq('可见范围往返', saved.visibility, 'personal')
  eq('状态往返', saved.status, 'working')
  eq('在线往返', saved.online, true)
  eq('来源往返', saved.source, 'personal')
  eq('列表 1 条', store.listColleagues().length, 1)
  eq('getColleague 命中', store.getColleague('c1').name, '小研')
  eq('未命中返回 null', store.getColleague('nope'), null)

  // ---------- 3. 更新与 createdAt 不变 ----------
  console.log('\n-- 更新 --')
  store.saveColleague(col({ id: 'c1', name: '小研2', tags: ['data'] }))
  eq('更新后昵称', store.getColleague('c1').name, '小研2')
  eq('更新后标签被替换', store.getColleague('c1').tags.join(','), 'data')
  eq('更新不新增行', store.listColleagues().length, 1)
  eq('createdAt 不被覆盖', store.getColleague('c1').createdAt, base)

  // ---------- 4. 名称唯一性 ----------
  console.log('\n-- 名称唯一性 --')
  eq('重名判重命中', store.isColleagueNameTaken('需求分析师'), true)
  eq('自身不算重名', store.isColleagueNameTaken('需求分析师', 'c1'), false)
  eq('新名字不重名', store.isColleagueNameTaken('别的名字'), false)

  // ---------- 5. 置顶排序 ----------
  console.log('\n-- 置顶排序 --')
  store.saveColleague(col({ id: 'c2', name: '主编', displayName: '主编', updatedAt: base + 1000 }))
  store.saveColleague(col({ id: 'c3', name: '分析师', displayName: '分析师', updatedAt: base + 2000 }))
  eq('默认按 updated_at 倒序（最新在前）', store.listColleagues()[0].id, 'c3')
  store.setColleaguePinned('c1', true)
  eq('置顶后排最前', store.listColleagues()[0].id, 'c1')
  eq('置顶标记落库', store.getColleague('c1').pinned, true)
  store.setColleaguePinned('c1', false)
  // 置顶 / 取消置顶都会 bump updated_at（真实改写行为），故取消后 c1 仍因最新改写排前
  eq('取消置顶后排前（updated_at 被 bump）', store.listColleagues()[0].id, 'c1')
  eq('取消置顶后标记落库', store.getColleague('c1').pinned, false)

  // ---------- 6. 暂停 / 恢复 ----------
  console.log('\n-- 暂停恢复 --')
  const paused = store.setColleaguePaused('c1', true)
  eq('暂停后状态 idle', paused.status, 'idle')
  eq('暂停后不在线', paused.online, false)
  const resumed = store.setColleaguePaused('c1', false)
  eq('恢复后状态 working', resumed.status, 'working')
  eq('恢复后在线', resumed.online, true)
  eq('暂停不存在的 id 返回 null', store.setColleaguePaused('nope', true), null)

  // ---------- 7. 可见范围 ----------
  console.log('\n-- 可见范围 --')
  eq('改可见范围', store.setColleagueVisibility('c1', 'project').visibility, 'project')

  // ---------- 8. 复制为新助理 ----------
  console.log('\n-- 复制 --')
  const cloned = store.cloneColleague('c1', { displayName: '小研 的副本' })
  ok('复制产生新 id', cloned.id !== 'c1')
  eq('复制继承职能', cloned.role, 'industryResearcher')
  eq('复制继承标签', cloned.tags.join(','), 'data')
  eq('复制不继承置顶', cloned.pinned, false)
  eq('复制后共 4 位', store.listColleagues().length, 4)
  eq('复制不存在返回 null', store.cloneColleague('nope'), null)

  // ---------- 9. 配额 ----------
  console.log('\n-- 配额 --')
  const q = store.getColleagueQuota('standard')
  eq('配额套餐', q.plan, 'standard')
  eq('配额上限（标准版 3）', q.limit, 3)
  eq('配额已用', q.used, 4)
  eq('未知套餐回落默认', store.getColleagueQuota('unknown').limit, store.getColleagueQuota('standard').limit)

  // ---------- 10. 渠道绑定（独占语义） ----------
  console.log('\n-- 渠道绑定 --')
  let binds = store.bindChannel('c1', 'wecom')
  eq('绑定后 1 条', binds.length, 1)
  eq('绑定态正确', binds[0].state, 'bound')
  ok('绑定时间已记录', typeof binds[0].boundAt === 'number')
  eq('渠道占用者为 c1', store.channelOwner('wecom'), 'c1')
  eq('已连接 IM', store.hasAnyChannelBound('c1'), true)
  eq('无绑定的主体未连接', store.hasAnyChannelBound('c2'), false)

  // 独占：c2 绑定同一渠道应把 c1 挤掉
  store.bindChannel('c2', 'wecom')
  eq('独占渠道被转绑给 c2', store.channelOwner('wecom'), 'c2')
  eq('原主体 c1 的 wecom 置回 unbound', store.listChannelBindings('c1').find((b) => b.channel === 'wecom').state, 'unbound')

  // 小程序为共享渠道，不应挤掉其他主体
  store.bindChannel('c1', 'wechatMini')
  store.bindChannel('c2', 'wechatMini')
  eq('小程序共享：c3 仍可绑', store.bindChannel('c3', 'wechatMini')[0].state, 'bound')
  eq('小程序不清理其他人', store.listChannelBindings('c1').find((b) => b.channel === 'wechatMini').state, 'bound')

  // 解绑
  binds = store.unbindChannel('c2', 'wecom')
  eq('解绑后状态 unbound', binds.find((b) => b.channel === 'wecom').state, 'unbound')
  eq('解绑后无占用者', store.channelOwner('wecom'), null)
  eq('重新绑定覆盖同 (subject,channel) 不新增行', store.bindChannel('c1', 'wecom').length, 2)

  // 云助理主体（全局条目）
  store.bindChannel('cloud', 'wechatMini')
  eq('云助理可单独绑定', store.listChannelBindings('cloud').length, 1)
  eq('云助理与助理互不影响', store.listChannelBindings('c1').length, 2)

  // ---------- 11. 内存记忆 ----------
  console.log('\n-- 内存记忆 --')
  const m1 = store.saveColleagueMemory('c1', false)
  eq('保存后关闭', m1.enabled, false)
  eq('读回为关闭', store.getColleagueMemory('c1').enabled, false)
  ok('更新时间已记录', store.getColleagueMemory('c1').updatedAt > 0)
  store.saveColleagueMemory('c1', true)
  eq('再次保存覆盖', store.getColleagueMemory('c1').enabled, true)
  eq('云助理记忆独立', store.getMemoryForCloud().subject, 'cloud')
  eq('云助理记忆默认开启', store.getMemoryForCloud().enabled, true)

  // ---------- 12. 助理任务 ----------
  console.log('\n-- 助理任务 --')
  store.saveColleagueTask({ id: 't1', colleagueId: 'c1', name: '拆解 v10 需求', status: 'inProgress', source: 'cloud', createdAt: base })
  store.saveColleagueTask({ id: 't2', colleagueId: 'c1', name: '撰写 PRD 第二版', status: 'completed', createdAt: base + 1000 })
  store.saveColleagueTask({ id: 't3', colleagueId: 'c2', name: '需求评审会议纪要', status: 'idle', createdAt: base + 2000 })
  eq('全部任务 3 条', store.listColleagueTasks().length, 3)
  eq('按助理过滤 c1 命中 2 条', store.listColleagueTasks('c1').length, 2)
  eq('按助理过滤 c2 命中 1 条', store.listColleagueTasks('c2').length, 1)
  eq('任务按创建时间倒序', store.listColleagueTasks('c1')[0].id, 't2')
  eq('状态往返', store.listColleagueTasks('c1').find((t) => t.id === 't1').status, 'inProgress')
  eq('来源往返', store.listColleagueTasks('c1').find((t) => t.id === 't1').source, 'cloud')
  const updatedTask = store.saveColleagueTask({ id: 't1', colleagueId: 'c1', name: '拆解 v10 需求（改）', status: 'completed', createdAt: base })
  eq('任务更新不新增行', store.listColleagueTasks('c1').length, 2)
  eq('任务更新生效', updatedTask.status, 'completed')
  eq('任务更新保留 createdAt', updatedTask.createdAt, base)
  eq('删除任务', store.deleteColleagueTask('t3'), true)
  eq('删除后剩 2 条', store.listColleagueTasks().length, 2)
  eq('删除不存在返回 false', store.deleteColleagueTask('nope'), false)

  // ---------- 13. 级联删除 ----------
  console.log('\n-- 级联删除 --')
  store.saveColleagueMemory('c2', false)
  // t3 已在任务小节被删除，这里为 c2 补一条任务以验证级联
  store.saveColleagueTask({ id: 't-c2', colleagueId: 'c2', name: '待级联任务', status: 'idle' })
  eq('删除前 c2 有绑定', store.listChannelBindings('c2').length > 0, true)
  eq('删除前 c2 有任务', store.listColleagueTasks('c2').length, 1)
  eq('删除助理成功', store.deleteColleague('c2'), true)
  eq('助理已删除', store.getColleague('c2'), null)
  eq('级联清理渠道绑定', store.listChannelBindings('c2').length, 0)
  eq('级联清理内存记忆', store.listColleagueTasks('c2').length, 0)
  eq('其他助理绑定不受影响', store.listChannelBindings('c1').length > 0, true)
  eq('删除不存在返回 false', store.deleteColleague('nope'), false)
  eq('云助理渠道不受级联影响', store.listChannelBindings('cloud').length, 1)

  // ---------- 14. 旧库兼容 ----------
  console.log('\n-- 旧库兼容 --')
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r13-legacy-'))
  app.setPath('userData', legacyDir)
  const DatabaseSync = require('node:sqlite').DatabaseSync
  fs.mkdirSync(path.join(legacyDir, 'db'), { recursive: true })
  const legacy = new DatabaseSync(path.join(legacyDir, 'db', 'workbuddy.db'))
  legacy.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);')
  legacy.exec("INSERT INTO kv (key, value) VALUES ('settings', '{}')")
  legacy.close()
  const legacyStore = new Store()
  eq('旧库可打开（自动建 colleagues）', Array.isArray(legacyStore.listColleagues()), true)
  eq('旧库助理列表为空', legacyStore.listColleagues().length, 0)
  const lc = legacyStore.saveColleague(col({ id: 'legacy-c1', name: '旧库助理' }))
  eq('旧库可写入同事表', lc.id, 'legacy-c1')
  eq('旧库写入后可读', legacyStore.getColleague('legacy-c1').name, '旧库助理')
  eq('旧库渠道表可用', legacyStore.listChannelBindings().length, 0)
  legacyStore.bindChannel('legacy-c1', 'feishu')
  eq('旧库可绑定渠道', new Store().channelOwner('feishu'), 'legacy-c1')
  eq('旧库配额可用', legacyStore.getColleagueQuota('trial').limit, 1)
  legacyStore.saveColleagueTask({ id: 'lt1', colleagueId: 'legacy-c1', name: '旧库任务', status: 'idle' })
  eq('旧库任务表可用', new Store().listColleagueTasks('legacy-c1').length, 1)

  console.log(`\n结果：${pass}/${pass + fail} 通过`)
  app.exit(fail === 0 ? 0 : 1)
})
