/**
 * 第十二轮 运行时冒烟 —— 真实 Electron 窗口内驱动 UI + 真实落库，验证日程 / 日历域：
 * 1) 顶栏日历入口（title=我的日历）与面板打开
 * 2) 日历侧栏：月标题、上/下月、收起/展开、42 格月历网格、分组筛选、叠加开关、搜索
 * 3) 主区：当日日程列表、卡片状态类
 * 4) 新建表单：默认值取自日历设置、校验拦截、重复切换、真实保存落库
 * 5) 详情卡：摘要行（kindLine / whenLabel 逐字）、投递状态、RSVP 真实回执、复制
 * 6) 原文桩文案渲染（hint.notImplemented / noContract / onlineMeetingUnavailable / meetingRoom）
 * 7) 日历设置：默认时长 / 提醒档位 / 每周首日，真实保存
 * 8) 删除二次确认 → 真实删除
 * 9) Esc 逐层关闭
 *
 * 运行：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron \
 *        --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage smoke-r12.cjs
 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

let pass = 0
let fail = 0
const consoleErrors = []
function ok(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  ✓ ' + name)
  } else {
    fail++
    console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pad2 = (n) => String(n).padStart(2, '0')
/** 与 shared/scheduleEvent.ts 的 toLocalInput 同语义 */
const toLocalInput = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r12-run-'))
  app.setPath('userData', tmp)

  // 注册真实主进程 handler（非 mock）
  const mainMod = require(path.join(__dirname, '.smoke-main.cjs'))
  mainMod.registerIpcHandlers()
  mainMod.registerTerminalHandlers()

  const store = mainMod.getStore()
  store.saveSettings({ ...store.getSettings(), locale: 'zh-CN' })

  // ---------- 预置数据 ----------
  const DAY = 86400000
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const T0 = today.getTime()
  const at = (dayOffset, h, m = 0) => new Date(T0 + dayOffset * DAY).setHours(h, m, 0, 0)
  const now = Date.now()

  // 今日：一场待开始（10:00-11:00）+ 一场进行中（跨今天的全天）
  store.saveEvent({
    id: 'ev-today',
    title: '方案评审会',
    startAt: at(0, 23),
    endAt: at(0, 23) + 3600000,
    allDay: false,
    reminder: '15',
    location: 'A 栋 3 楼会议室',
    description: '评审 Q4 方案',
    organizer: '李昊',
    participants: [
      { name: '李昊', rsvp: 'needsAction', organizer: true },
      { name: '王芳', rsvp: 'accept' }
    ],
    attachments: ['评审稿.pdf'],
    source: 'managed',
    kind: 'personal',
    cancelled: false,
    repeat: { kind: 'weekly', weekdays: [today.getDay()] },
    createdAt: now,
    updatedAt: now
  })
  // 今日全天日程（验证 allDay 分型与排序靠前）
  store.saveEvent({
    id: 'ev-allday',
    title: '团队建设日',
    startAt: T0,
    endAt: T0 + DAY,
    allDay: true,
    reminder: '1440',
    source: 'managed',
    kind: 'personal',
    participants: [],
    cancelled: false,
    createdAt: now,
    updatedAt: now
  })
  // 频道日程（验证分组筛选）
  store.saveEvent({
    id: 'ev-channel',
    title: '频道周会',
    startAt: T0,
    endAt: T0 + 3600000,
    allDay: false,
    reminder: 'none',
    source: 'channels',
    kind: 'channel',
    participants: [{ name: '张伟', rsvp: 'tentative' }],
    cancelled: false,
    createdAt: now,
    updatedAt: now
  })
  // 已订阅日程（验证第三分组）
  store.saveEvent({
    id: 'ev-sub',
    title: '公司宣讲会',
    startAt: T0 + 5 * DAY,
    endAt: T0 + 5 * DAY + 3600000,
    allDay: false,
    reminder: '60',
    source: 'subscribed',
    kind: 'personal',
    participants: [],
    cancelled: false,
    createdAt: now,
    updatedAt: now
  })

  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.webContents.on('console-message', (...a) => {
    const e = a[0]
    const level = typeof a[1] === 'number' ? a[1] : e && e.level
    const message = typeof a[2] === 'string' ? a[2] : e && e.message
    if (typeof level === 'number' ? level >= 2 : level === 'error') consoleErrors.push(String(message))
  })
  win.webContents.on('render-process-gone', (_e, d) => consoleErrors.push('render-process-gone ' + JSON.stringify(d)))
  win.webContents.on('did-fail-load', (_e, code, desc) => consoleErrors.push(`did-fail-load ${code} ${desc}`))

  await win.loadFile(path.join(__dirname, 'out/renderer/index.html'))
  await sleep(2500)

  const ev = (code) => win.webContents.executeJavaScript(`(${code})`, true)
  const run = (code) => win.webContents.executeJavaScript(`(() => { ${code} })()`, true)
  const setInput = async (selector, value, idx = 0) => {
    await run(`
      const els = document.querySelectorAll(${JSON.stringify(selector)});
      const el = els[${idx}];
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true
    `)
    await sleep(200)
  }
  const clickText = async (selector, text) => {
    const r = await run(`
      const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e => e.textContent.trim() === ${JSON.stringify(text)});
      if (el) { el.click(); return true }
      return false
    `)
    await sleep(350)
    return r
  }

  console.log('\n[第十二轮 运行时冒烟 · 日程 / 日历域]')

  // ---------- 1. 基础挂载 ----------
  ok('应用已挂载', (await ev(`!!document.querySelector('.app')`)) === true)

  // ---------- 2. 顶栏入口 ----------
  const opened = await run(`
    const btn = Array.from(document.querySelectorAll('.topbar-actions .icon-btn'))
      .find(b => (b.getAttribute('title') || '') === '我的日历');
    if (btn) { btn.click(); return true; }
    return false
  `)
  await sleep(700)
  ok('顶栏日历入口存在并打开面板', opened === true && (await ev(`!!document.querySelector('.sched-panel')`)) === true)
  ok('面板标题为「我的日历」', (await ev(`document.querySelector('.sched-title')?.textContent || ''`)) === '我的日历')

  // ---------- 3. 侧栏：月标题与月历网格 ----------
  const monthTitle = await ev(`document.querySelector('.sched-month-title')?.textContent || ''`)
  const nowD = new Date()
  ok(
    '月标题为「YYYY年M月」',
    monthTitle === `${nowD.getFullYear()}年${nowD.getMonth() + 1}月`,
    monthTitle
  )
  ok('月历网格 42 格', (await ev(`document.querySelectorAll('.sched-mini-cell').length`)) === 42)
  ok('星期表头 7 格', (await ev(`document.querySelectorAll('.sched-mini-wday').length`)) === 7)
  ok(
    '星期表头首格为「周日」（默认 weekStart=0）',
    (await ev(`document.querySelector('.sched-mini-wday')?.textContent || ''`)) === '周日'
  )
  ok('存在「今天」高亮格', (await ev(`!!document.querySelector('.sched-mini-cell.today')`)) === true)
  ok('有日程的日格渲染圆点', (await ev(`document.querySelectorAll('.sched-mini-dot').length`)) >= 1)
  ok('存在选中格', (await ev(`!!document.querySelector('.sched-mini-cell.sel')`)) === true)

  // ---------- 4. 上/下月切换 ----------
  await run(`
    const b = Array.from(document.querySelectorAll('.sched-month-nav .icon-btn')).find(x => x.getAttribute('title') === '下个月');
    if (b) b.click(); return true
  `)
  await sleep(500)
  const nextM = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 1)
  ok(
    '点「下个月」后月标题前进一月',
    (await ev(`document.querySelector('.sched-month-title')?.textContent || ''`)) === `${nextM.getFullYear()}年${nextM.getMonth() + 1}月`,
    await ev(`document.querySelector('.sched-month-title')?.textContent`)
  )
  await run(`
    const b = Array.from(document.querySelectorAll('.sched-month-nav .icon-btn')).find(x => x.getAttribute('title') === '上个月');
    if (b) b.click(); return true
  `)
  await sleep(500)
  ok(
    '点「上个月」后回到当月',
    (await ev(`document.querySelector('.sched-month-title')?.textContent || ''`)) === `${nowD.getFullYear()}年${nowD.getMonth() + 1}月`
  )

  // ---------- 5. 收起 / 展开 ----------
  await run(`
    const b = Array.from(document.querySelectorAll('.sched-month-nav .icon-btn')).find(x => x.getAttribute('title') === '收起日历');
    if (b) b.click(); return true
  `)
  await sleep(400)
  ok('收起后侧栏进入 collapsed', (await ev(`!!document.querySelector('.sched-side.collapsed')`)) === true)
  ok('收起后月历网格隐藏', (await ev(`!document.querySelector('.sched-mini-grid')`)) === true)
  await run(`
    const b = Array.from(document.querySelectorAll('.sched-month-nav .icon-btn')).find(x => x.getAttribute('title') === '展开日历');
    if (b) b.click(); return true
  `)
  await sleep(400)
  ok('展开后月历网格恢复', (await ev(`!!document.querySelector('.sched-mini-grid')`)) === true)

  // ---------- 6. 主区列表 ----------
  const cards = await ev(`Array.from(document.querySelectorAll('.sched-card')).map(e => e.querySelector('.sched-card-title')?.textContent)`)
  ok('主区渲染今日日程', cards.includes('方案评审会'), cards)
  ok('全天日程排在定时之前', cards[0] === '团队建设日', cards)
  ok('全天卡片显示「全天」', (await ev(`document.querySelector('.sched-card .sched-card-time')?.textContent || ''`)) === '全天')
  const stClasses = await ev(`Array.from(document.querySelectorAll('.sched-card')).map(e => e.className)`)
  ok('卡片带状态类', stClasses.every((c) => /st-(upcoming|ongoing|ended|cancelled)/.test(c)), stClasses)
  ok(
    '状态标签渲染（待开始/进行中/已结束/已取消）',
    /待开始|进行中|已结束|已取消/.test(await ev(`document.querySelector('.sched-card-status')?.textContent || ''`))
  )

  // ---------- 7. 分组筛选 ----------
  ok('分组含「我的日程」', (await ev(`Array.from(document.querySelectorAll('.sched-group')).map(e=>e.textContent).includes('我的日程')`)) === true)
  ok('分组含「我管理的」', (await ev(`Array.from(document.querySelectorAll('.sched-group')).map(e=>e.textContent).includes('我管理的')`)) === true)
  ok('分组含「所在频道」', (await ev(`Array.from(document.querySelectorAll('.sched-group')).map(e=>e.textContent).includes('所在频道')`)) === true)
  ok('分组含「我订阅的」', (await ev(`Array.from(document.querySelectorAll('.sched-group')).map(e=>e.textContent).includes('我订阅的')`)) === true)

  await clickText('.sched-group', '所在频道')
  const chCards = await ev(`Array.from(document.querySelectorAll('.sched-card')).map(e => e.querySelector('.sched-card-title')?.textContent)`)
  ok('筛选「所在频道」后只显示频道日程', chCards.includes('频道周会') && !chCards.includes('方案评审会'), chCards)
  await clickText('.sched-group', '我的日程')
  const allCards = await ev(`Array.from(document.querySelectorAll('.sched-card')).map(e => e.querySelector('.sched-card-title')?.textContent)`)
  ok('切回「我的日程」恢复全部', allCards.includes('方案评审会') && allCards.includes('团队建设日'), allCards)

  // ---------- 8. 搜索 ----------
  await setInput('.sched-search .filter-input', '不存在的日程标题xyz')
  await sleep(400)
  ok('搜索无匹配显示空态', (await ev(`!!document.querySelector('.sched-empty')`)) === true)
  await setInput('.sched-search .filter-input', '方案评审')
  await sleep(400)
  const searchCards = await ev(`Array.from(document.querySelectorAll('.sched-card')).map(e => e.querySelector('.sched-card-title')?.textContent)`)
  ok('搜索命中目标日程', searchCards.includes('方案评审会') && searchCards.length === 1, searchCards)
  const clearClicked = await clickText('.sched-search .btn', '清除搜索')
  ok('存在「清除搜索」按钮并生效', clearClicked === true && (await ev(`!!document.querySelector('.sched-search .filter-input')`)) === true)

  // ---------- 9. 叠加开关 ----------
  ok('叠加开关含「叠加我的日程」', (await ev(`Array.from(document.querySelectorAll('.sched-overlay')).map(e=>e.textContent.trim()).some(t=>t.includes('叠加我的日程'))`)) === true)
  ok('叠加开关含「叠加我的待办」', (await ev(`Array.from(document.querySelectorAll('.sched-overlay')).map(e=>e.textContent.trim()).some(t=>t.includes('叠加我的待办'))`)) === true)
  await run(`
    const boxes = Array.from(document.querySelectorAll('.sched-overlays input[type=checkbox]'));
    boxes[1].click(); return true
  `)
  await sleep(400)
  ok('勾选「叠加我的待办」渲染暂未实现桩', (await ev(`document.body.innerText.includes('暂未实现')`)) === true)
  await run(`
    const boxes = Array.from(document.querySelectorAll('.sched-overlays input[type=checkbox]'));
    boxes[1].click(); return true
  `)
  await sleep(300)

  // ---------- 10. 原文桩文案 ----------
  ok(
    '主区渲染「团队日历 · 当前版本暂无接口」桩',
    (await ev(`document.body.innerText.includes('当前版本暂无接口，仅展示效果')`)) === true
  )

  // ---------- 11. 新建表单 ----------
  await clickText('.sched-head-right .btn', '新建日程')
  ok('打开创建表单', (await ev(`!!document.querySelector('.sched-dialog')`)) === true)
  ok('表单标题为「创建日程」', (await ev(`document.querySelector('.sched-dialog .dialog-title')?.textContent || ''`)) === '创建日程')
  ok('表单提示为「表单与自然语言使用同一份日程字段。」', (await ev(`document.querySelector('.sched-form-hint')?.textContent || ''`)) === '表单与自然语言使用同一份日程字段。')
  const chips = await ev(`Array.from(document.querySelectorAll('.sched-dialog .kind-chip')).map(e => e.textContent.trim())`)
  ok('提醒档位含「无提醒」', chips.includes('无提醒'), chips)
  ok('提醒档位含「15 分钟前」', chips.includes('15 分钟前'), chips)
  ok('提醒档位含「1 天前」', chips.includes('1 天前'), chips)
  ok('重复档位含「不重复」', chips.includes('不重复'), chips)
  ok('重复档位含「每周」', chips.includes('每周'), chips)
  ok('默认提醒为「15 分钟前」（对齐 settings.timedReminder=min15）', chips.includes('15 分钟前') && (await ev(`Array.from(document.querySelectorAll('.sched-dialog .kind-chip')).filter(c=>c.className.includes('active')).map(c=>c.textContent.trim()).includes('15 分钟前')`)) === true)
  ok('默认时长为「1 小时」（对齐 settings.duration.60）', (await ev(`document.body.innerText.includes('时长: 1 小时')`)) === true)
  ok('表单渲染会议纪要桩', (await ev(`document.body.innerText.includes('当前环境未开放会后纪要')`)) === true)
  ok('标题占位为「添加主题」', (await ev(`document.querySelector('.sched-dialog .auto-input')?.getAttribute('placeholder') || ''`)) === '添加主题')
  ok(
    '地点/参与人/描述占位对齐 create.placeholder.*',
    (
      await ev(`Array.from(document.querySelectorAll('.sched-dialog .auto-input')).map(e => e.getAttribute('placeholder'))`)
    ).includes('添加地点') &&
      (await ev(`document.querySelector('.sched-dialog .auto-textarea')?.getAttribute('placeholder') || ''`)) === '添加描述'
  )

  // 空标题校验
  await clickText('.sched-dialog .dialog-actions .btn', '创建日程')
  await sleep(500)
  ok('空标题保存被拦截（请填写标题）', (await ev(`document.body.innerText.includes('请填写标题')`)) === true)
  ok('校验失败表单未关闭', (await ev(`!!document.querySelector('.sched-dialog')`)) === true)

  // 填写并保存
  await setInput('.sched-dialog .auto-input', '冒烟日程', 0)
  await clickText('.sched-dialog .kind-chip', '开始时')
  await setInput('.sched-dialog .auto-input', 'B 栋 2 楼', 3)
  await setInput('.sched-dialog .auto-textarea', '冒烟用描述')
  await setInput('.sched-dialog .auto-input', '赵敏, 钱进', 4)
  await sleep(300)
  // 把日程明确放到「明天 10:00–11:00」：既保证状态一定是「待开始」，
  // 也避免用 now+Nh 在午夜附近跨天导致日视图看不到（不确定的测试不是好测试）
  const tomorrow10 = new Date(T0 + DAY)
  tomorrow10.setHours(10, 0, 0, 0)
  const durLabelOf = () => ev(`document.querySelector('.sched-form-row .inline-label')?.textContent.trim() || ''`)
  const durBefore = await durLabelOf()
  await setInput('.sched-dialog .auto-input', toLocalInput(tomorrow10.getTime()), 1)
  await sleep(300)
  const durAfter = await durLabelOf()
  ok('改开始时间后时长保持（1 小时）', durBefore === '时长: 1 小时' && durAfter === durBefore, { durBefore, durAfter })
  await setInput('.sched-dialog .auto-input', toLocalInput(tomorrow10.getTime() + 3600000), 2)
  await sleep(300)
  await clickText('.sched-dialog .dialog-actions .btn', '创建日程')
  await sleep(1200)
  const created = store.listEvents({ includeCancelled: true }).find((e) => e.title === '冒烟日程')
  ok('新日程真实落库', !!created, created && created.id)
  ok('新日程提醒为 atStart', created && created.reminder === 'atStart', created && created.reminder)
  ok('新日程地点落库', created && created.location === 'B 栋 2 楼', created && created.location)
  ok('新日程参与人解析为 2 人', created && created.participants.length === 2, created && created.participants)
  ok('新日程参与人初始 RSVP=needsAction', created && created.participants.every((p) => p.rsvp === 'needsAction'))

  // 切到「明天」日视图后再打开详情（日程落在明天 10:00）
  ok('选中明天（含新建日程的日格）', (await run(`
    const cells = Array.from(document.querySelectorAll('.sched-mini-cell'));
    const cell = cells.find(c => Number(c.querySelector('.sched-mini-day')?.textContent) === ${tomorrow10.getDate()} && !c.className.includes('out'));
    if (cell) { cell.click(); return true } return false
  `)) === true)
  await sleep(500)

  // ---------- 12. 详情卡（保存后自动打开） ----------
  await sleep(500)
  ok('保存后自动打开详情卡', (await ev(`!!document.querySelector('.sched-dialog')`)) === true)
  const detailLines = await ev(`Array.from(document.querySelectorAll('.sched-detail-line')).map(e => e.textContent.trim())`)
  ok('详情首行「日程 待开始」', detailLines[0] === '日程 待开始', detailLines)
  const whenLine = detailLines.find((l) => l.includes('年') && l.includes('月'))
  ok('时间行逐字对齐 summary.when（含 em dash 与「 年 」空格）', !!whenLine && /^\d{4} 年 \d{1,2} 月 \d{1,2} 日 · \d{2}:\d{2}—\d{2}:\d{2}$/.test(whenLine), whenLine)
  ok('提醒行渲染「提醒: 开始时」', detailLines.some((l) => l === '提醒: 开始时'), detailLines)
  ok('参与人行对齐 summary.participantCount', detailLines.some((l) => l.startsWith('已邀请 2 位参与人：')), detailLines)
  ok('投递状态渲染「待同步至 2 人」', detailLines.some((l) => l === '待同步至 2 人'), detailLines)
  ok('填写的描述渲染为说明', (await ev(`document.querySelector('.sched-detail-notes')?.textContent || ''`)) === '冒烟用描述')
  ok('详情渲染「无在线会议 · 当前环境未接入在线会议」桩', (await ev(`document.body.innerText.includes('当前环境未接入在线会议')`)) === true)
  ok('详情渲染会议室「暂未实现」桩', (await ev(`document.body.innerText.includes('暂未实现')`)) === true)
  ok('RSVP 区块标题为「我的参与状态」', (await ev(`Array.from(document.querySelectorAll('.sched-rsvp .field-label')).map(e=>e.textContent)[0]`)) === '我的参与状态')
  const rsvpChips = await ev(`Array.from(document.querySelectorAll('.sched-rsvp-row')).map(r => Array.from(r.querySelectorAll('.kind-chip')).map(c=>c.textContent.trim()).join(','))`)
  ok('每人三档回执（接受/待定/拒绝）', rsvpChips.length === 2 && rsvpChips[0] === '接受,待定,拒绝', rsvpChips)

  // ---------- 13. RSVP 真实回执 ----------
  await run(`
    const row = Array.from(document.querySelectorAll('.sched-rsvp-row')).find(r => r.querySelector('.sched-rsvp-name')?.textContent === '赵敏');
    const btn = Array.from(row.querySelectorAll('.kind-chip')).find(c => c.textContent.trim() === '接受');
    btn.click(); return true
  `)
  await sleep(1000)
  const afterRsvp = store.getEvent(created.id)
  ok('RSVP 回执真实落库', afterRsvp.participants.find((p) => p.name === '赵敏').rsvp === 'accept', afterRsvp.participants)
  ok('另一人回执未被连带修改', afterRsvp.participants.find((p) => p.name === '钱进').rsvp === 'needsAction')
  ok(
    '回执后 chip 高亮切换',
    (await ev(`(() => {
      const row = Array.from(document.querySelectorAll('.sched-rsvp-row')).find(r => r.querySelector('.sched-rsvp-name')?.textContent === '赵敏');
      return row.querySelector('.kind-chip.active')?.textContent.trim()
    })()`)) === '接受'
  )
  ok(
    '回执后投递状态变为「待同步至 1 人」',
    (await ev(`Array.from(document.querySelectorAll('.sched-detail-line')).map(e=>e.textContent.trim()).some(l => l === '待同步至 1 人')`)) === true
  )

  // ---------- 14. 编辑既有日程保留 RSVP ----------
  await clickText('.sched-dialog .dialog-actions .btn', '编辑日程')
  await sleep(400)
  ok('打开编辑表单（标题为「编辑日程」）', (await ev(`document.querySelector('.sched-dialog .dialog-title')?.textContent || ''`)) === '编辑日程')
  ok('编辑表单回填标题', (await ev(`document.querySelector('.sched-dialog .auto-input')?.value`)) === '冒烟日程')
  ok('编辑表单回填参与人', (await ev(`document.querySelectorAll('.sched-dialog .auto-input')[4]?.value || ''`)) === '赵敏, 钱进')
  await clickText('.sched-dialog .dialog-actions .btn', '保存日程')
  await sleep(1200)
  const afterEdit = store.getEvent(created.id)
  ok('仅改标题不丢 RSVP 回执', afterEdit.participants.find((p) => p.name === '赵敏').rsvp === 'accept', afterEdit.participants)

  // ---------- 15. 关闭详情回到列表 ----------
  await clickText('.sched-dialog .dialog-actions .btn', '关闭')
  await sleep(400)
  const repCard = await ev(`Array.from(document.querySelectorAll('.sched-card')).map(e => e.querySelector('.sched-card-title')?.textContent)`)
  ok('关闭详情后回到列表', repCard.includes('方案评审会'), repCard)

  // ---------- 16. 日历设置 ----------
  await clickText('.sched-head-right .btn', '日历设置')
  ok('打开日历设置', (await ev(`document.body.innerText.includes('仅设置新建日程的默认行为。')`)) === true)
  ok('设置含「日程默认时长」', (await ev(`document.body.innerText.includes('日程默认时长')`)) === true)
  ok('设置含 6 档时长', (await ev(`Array.from(document.querySelectorAll('.sched-dialog .kind-chip')).map(e=>e.textContent.trim()).filter(t=>t.endsWith('分钟')).length`)) === 6)
  ok('设置含「非全天日程默认提醒」', (await ev(`document.body.innerText.includes('非全天日程默认提醒')`)) === true)
  ok('设置含「全天日程默认提醒」', (await ev(`document.body.innerText.includes('全天日程默认提醒')`)) === true)
  ok('设置含「每周第一天」', (await ev(`document.body.innerText.includes('每周第一天')`)) === true)
  ok('设置含「是否显示农历」', (await ev(`document.body.innerText.includes('是否显示农历')`)) === true)
  ok('设置渲染同步「暂未实现」桩', (await ev(`document.body.innerText.includes('同步至其他日历') && document.body.innerText.includes('暂未实现')`)) === true)

  // 改为 90 分钟 + 每周第一天=周一
  await clickText('.sched-dialog .kind-chip', '90 分钟')
  await run(`
    const boxes = Array.from(document.querySelectorAll('.sched-dialog input[type=checkbox]'));
    boxes[0].click(); return true
  `)
  await sleep(300)
  await clickText('.sched-dialog .dialog-actions .btn', '保存')
  await sleep(1200)
  const d1 = store.getCalendarDefaults()
  ok('设置真实落库（默认时长 90）', d1.defaultDurationMinutes === 90, d1)
  ok('设置真实落库（每周第一天=周一）', d1.weekStart === 1, d1)
  ok('设置未改动项保留（全天提醒仍为当天 09:00）', d1.allDayReminder === 'sameDay0900', d1)

  // 周首日改变后星期表头应变为周一开头
  await sleep(600)
  ok(
    '每周首日=周一后星期表头首格为「周一」',
    (await ev(`document.querySelector('.sched-mini-wday')?.textContent || ''`)) === '周一',
    await ev(`document.querySelector('.sched-mini-wday')?.textContent`)
  )

  // ---------- 17. 详情卡：说明与副本 ----------
  const cardTitles = await ev(`Array.from(document.querySelectorAll('.sched-card')).map(c => c.querySelector('.sched-card-title')?.textContent)`)
  const clicked = await run(`
    const card = Array.from(document.querySelectorAll('.sched-card')).find(c => c.querySelector('.sched-card-title')?.textContent === '冒烟日程');
    if (card) { card.click(); return true } return false
  `)
  await sleep(600)
  const openTitles = await ev(`Array.from(document.querySelectorAll('.sched-dialog .dialog-title')).map(e => e.textContent)`)
  ok('重新打开详情卡', clicked === true && openTitles.includes('冒烟日程'), { clicked, cardTitles, openTitles })
  await clickText('.sched-dialog .dialog-actions .btn', '编辑日程')
  await sleep(500)
  const descValue = await ev(`document.querySelector('.sched-dialog .auto-textarea')?.value || ''`)
  ok('编辑表单回填描述', descValue === '冒烟用描述', { descValue })
  await run(`
    const btn = Array.from(document.querySelectorAll('.sched-dialog .dialog-actions .btn')).find(b => b.textContent === '取消');
    if (btn) btn.click(); return true
  `)
  await sleep(500)

  // ---------- 18. 删除二次确认 ----------
  await clickText('.sched-dialog .dialog-actions .btn', '删除日程')
  ok('打开删除确认弹窗', (await ev(`document.body.innerText.includes('删除后参与人会收到取消通知，这条日程从日历里消失。')`)) === true)
  ok('删除确认标题为「删除日程」', (await ev(`document.querySelector('.sched-dialog .dialog-title')?.textContent || ''`)) === '删除日程')
  ok('删除确认层取代详情层（只留一层对话框）', (await ev(`document.querySelectorAll('.sched-dialog').length`)) === 1)
  const beforeDel = store.listEvents({ includeCancelled: true }).length
  await clickText('.sched-dialog .dialog-actions .btn', '删除日程')
  await sleep(1400)
  ok('删除后真实消失', !store.listEvents({ includeCancelled: true }).some((e) => e.id === created.id))
  ok('删除后少 1 条', store.listEvents({ includeCancelled: true }).length === beforeDel - 1)

  // ---------- 19. Esc 逐层关闭 ----------
  await run(`
    const card = Array.from(document.querySelectorAll('.sched-card')).find(c => c.querySelector('.sched-card-title')?.textContent === '方案评审会');
    if (card) card.click(); return true
  `)
  await sleep(500)
  ok('打开详情卡', (await ev(`!!document.querySelector('.sched-dialog')`)) === true)
  // 先验证「删除确认 → Esc」回退到详情而不是整层退出
  await clickText('.sched-dialog .dialog-actions .btn', '删除日程')
  ok('删除确认已打开', (await ev(`document.querySelector('.sched-dialog .dialog-title')?.textContent || ''`)) === '删除日程')
  await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true`)
  await sleep(400)
  ok('删除确认上按 Esc 退回列表（不整层退出）', (await ev(`!document.querySelector('.sched-dialog')`)) === true && (await ev(`!!document.querySelector('.sched-panel')`)) === true)
  // 再打开详情，验证普通详情 Esc 只关内层
  await run(`
    const card = Array.from(document.querySelectorAll('.sched-card')).find(c => c.querySelector('.sched-card-title')?.textContent === '方案评审会');
    if (card) card.click(); return true
  `)
  await sleep(500)
  await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true`)
  await sleep(400)
  ok('Esc 关闭详情卡但保留面板', (await ev(`!document.querySelector('.sched-dialog')`)) === true && (await ev(`!!document.querySelector('.sched-panel')`)) === true)
  await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true`)
  await sleep(500)
  ok('再按 Esc 关闭日程面板', (await ev(`!document.querySelector('.sched-panel')`)) === true)

  // ---------- 20. 数据一致性复核 ----------
  const finalEvents = store.listEvents({ includeCancelled: true })
  ok('全程数据未被意外清空', finalEvents.length === beforeDel - 1, finalEvents.length)
  ok(
    '预置的 4 条日程仍在（仅删掉冒烟日程）',
    ['ev-today', 'ev-allday', 'ev-channel', 'ev-sub'].every((id) => finalEvents.some((e) => e.id === id)),
    finalEvents.map((e) => e.id)
  )

  console.log(`\n结果：${pass}/${pass + fail} 通过`)
  console.log(`渲染层控制台报错：${consoleErrors.length}`)
  consoleErrors.slice(0, 8).forEach((e) => console.log('  ERR: ' + e))

  fs.rmSync(tmp, { recursive: true, force: true })
  app.exit(fail === 0 && consoleErrors.length === 0 ? 0 : 1)
}).catch((e) => {
  console.error('冒烟异常：', e)
  app.exit(2)
})

setTimeout(() => {
  console.log('TIMEOUT')
  app.exit(4)
}, 180000)
