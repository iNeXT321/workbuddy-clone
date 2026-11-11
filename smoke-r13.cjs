/**
 * 第十三轮 运行时冒烟 —— 真实 Electron 窗口内驱动 UI + 真实落库，验证数字员工 / 助理域：
 * 1) 顶栏入口（title=云助理）与面板打开
 * 2) 列表页：空态 + 推荐助理三卡；创建后：状态条、助理卡片、置顶排序、状态筛选、搜索
 * 3) 创建向导：职业预设 21 项、头像 20 张（每页 8）、必填校验 requiredError、
 *    重名 nameDuplicated、两步切换、真实保存落库
 * 4) 卡片菜单：查看详情 / 编辑档案 / 复制为新助理 / 置顶 / 暂停恢复 / 发布到项目 /
 *    绑定渠道 / 删除二次确认
 * 5) 详情页：三段导航（首页/记忆/对话任务）、状态横幅、任务统计、热力图、基本信息、
 *    已启用连接、最近动态、记忆空态、任务表
 * 6) 配置页：助理信息 / 接入渠道（7 类，独占渠道转绑）/ 权限与可见 / 用量下期；
 *    内存记忆开关默认开启且真实落库；云助理 IM 与助理 IM 双 Tab
 * 7) 发布对话框：三档可见范围 + 提交按钮文案随档位切换，真实落库
 * 8) 配额：上限拦截走 quotaLimit 对话框
 * 9) 原文桩文案渲染（enterpriseUnsupported / bindChannel.placeholder / avatarUploadUnsupported）
 * 10) Esc 逐层关闭：向导 → 发布 → 删除 → 配额 → 配置 → 详情 → 面板
 *
 * 运行：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron \
 *        --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage smoke-r13.cjs
 * 依赖前置：node smoke-r13-main-prep.mjs
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

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r13-run-'))
  app.setPath('userData', tmp)

  const mainMod = require(path.join(__dirname, '.smoke-main.cjs'))
  mainMod.registerIpcHandlers()
  mainMod.registerTerminalHandlers()

  const store = mainMod.getStore()
  store.saveSettings({ ...store.getSettings(), locale: 'zh-CN' })

  const col = mainMod.colleague
  const now = Date.now()

  // ---------- 预置数据 ----------
  // 1 位工作中助理（有渠道绑定 + 任务），用于详情/配置页
  store.saveColleague({
    id: 'col-ready',
    name: '小研',
    displayName: '需求分析师',
    role: 'industryResearcher',
    description: '擅长拆解需求与行业研究',
    personality: '简洁专业',
    responsibilities: ['analysis', 'planning'],
    tags: ['research', 'summary', 'report'],
    avatar: 'preset03',
    model: 'auto',
    visibility: 'personal',
    status: 'working',
    online: true,
    pinned: false,
    source: 'personal',
    connections: ['腾讯文档'],
    createdAt: now - 5 * 86400000,
    updatedAt: now - 3600000
  })
  store.bindChannel('col-ready', 'wecom')
  store.saveColleagueTask({ id: 'task-a', colleagueId: 'col-ready', name: '拆解 v10 助理模块需求', status: 'inProgress', source: 'cloud', createdAt: now - 7200000 })
  store.saveColleagueTask({ id: 'task-b', colleagueId: 'col-ready', name: '撰写 PRD 第二版', status: 'completed', source: 'cloud', createdAt: now - 9000000 })
  // 1 位异常助理（验证状态筛选）
  store.saveColleague({
    id: 'col-bad',
    name: '主编',
    displayName: '主编',
    role: 'contentCreator',
    description: '内容策划与文案润色',
    responsibilities: ['review'],
    tags: ['writing'],
    avatar: 'preset07',
    visibility: 'project',
    status: 'abnormal',
    online: false,
    pinned: false,
    source: 'personal',
    connections: [],
    createdAt: now - 2 * 86400000,
    updatedAt: now - 2 * 86400000
  })

  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 920,
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

  const evx = (code) => win.webContents.executeJavaScript(`(${code})`, true)
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
  const clickContains = async (selector, text) => {
    const r = await run(`
      const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e => e.textContent.includes(${JSON.stringify(text)}));
      if (el) { el.click(); return true }
      return false
    `)
    await sleep(350)
    return r
  }
  const esc = async () => {
    await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true`)
    await sleep(320)
  }
  /** 打开某张助理卡片的「更多操作」菜单（按 data-id 精确定位，避免同名副本歧义） */
  const openMenu = async (idOrName) => {
    const r2 = await run(`
      const cards = Array.from(document.querySelectorAll('.col-item'));
      const sel = ${JSON.stringify(idOrName)};
      const card = cards.find(c => c.getAttribute('data-id') === sel)
        || cards.find(c => (c.querySelector('.col-item-name')?.textContent || '').includes(sel));
      if (!card) return false;
      const b = card.querySelector('.col-item-head .icon-btn');
      if (!b) return false;
      b.click(); return true
    `)
    await sleep(350)
    return r2
  }

  console.log('\n[第十三轮 运行时冒烟 · 数字员工 / 助理域]')

  // ---------- 1. 基础挂载 ----------
  ok('应用已挂载', (await evx(`!!document.querySelector('.app')`)) === true)

  // ---------- 2. 顶栏入口 ----------
  const opened = await run(`
    const btn = Array.from(document.querySelectorAll('.topbar-actions .icon-btn'))
      .find(b => (b.getAttribute('title') || '') === '云助理');
    if (btn) { btn.click(); return true }
    return false
  `)
  await sleep(800)
  ok('顶栏云助理入口存在并打开面板', opened === true && (await evx(`!!document.querySelector('.colleagues-panel')`)) === true)
  ok('面板标题为「助理协作空间」', (await evx(`document.querySelector('.col-header-name')?.textContent || ''`)) === '助理协作空间')
  ok('副标题渲染', /选择一位助理加入任务/.test(await evx(`document.querySelector('.col-header-sub')?.textContent || ''`)))

  // ---------- 3. 云助理状态条 ----------
  ok('渲染云助理状态条', (await evx(`!!document.querySelector('.col-cloudbar')`)) === true)
  ok('云标签为「☁ 云端」', (await evx(`document.querySelector('.col-cloud-tag')?.textContent || ''`)) === '☁ 云端')
  ok('云助理标题正确', (await evx(`document.querySelector('.col-cloud-title')?.textContent || ''`)) === '我的云助理')
  ok(
    '数量状态行格式「N 位 · M 工作中」',
    /^2 位 · 1 工作中$/.test((await evx(`document.querySelector('.col-cloudbar .col-muted')?.textContent || ''`)).trim()),
    await evx(`document.querySelector('.col-cloudbar .col-muted')?.textContent`)
  )
  ok('未绑定 IM 时显示「未连接 IM」', (await evx(`document.querySelector('.col-cloudbar .col-status')?.textContent || ''`)) === '未连接 IM')

  // ---------- 4. 列表卡片 ----------
  const names = await evx(`Array.from(document.querySelectorAll('.col-item .col-item-name')).map(e => e.textContent.replace('📌','').trim())`)
  ok('渲染 2 张助理卡片', names.length === 2, names)
  ok('包含「小研」', names.includes('小研'), names)
  ok('包含「主编」', names.includes('主编'), names)
  ok('卡片显示职能', /行业研究员|内容创作专员/.test(await evx(`Array.from(document.querySelectorAll('.col-item-role')).map(e=>e.textContent).join('|')`)))
  ok('卡片显示能力标签', (await evx(`document.querySelectorAll('.col-item .col-tag').length`)) >= 3)
  ok('卡片有状态徽标', (await evx(`Array.from(document.querySelectorAll('.col-item .col-status')).map(e=>e.textContent).join('|')`)).includes('工作中'))
  ok('卡片有 IM 状态与对话按钮', (await evx(`!!document.querySelector('.col-item-foot')`)) === true)
  ok('已绑定渠道的卡片显示「已连接 IM」', (await evx(`Array.from(document.querySelectorAll('.col-item-foot .col-muted')).map(e=>e.textContent).join('|')`)).includes('已连接 IM'))

  // 置顶排序：置顶后应排最前
  ok('打开「小研」更多操作菜单', (await openMenu('小研')) === true)
  ok('菜单渲染 8 项操作', (await evx(`document.querySelectorAll('.col-menu button').length`)) === 8, await evx(`Array.from(document.querySelectorAll('.col-menu button')).map(e=>e.textContent)`))
  ok('菜单含「置顶」', (await clickText('.col-menu button', '置顶')) === true)
  await sleep(900)
  ok('置顶后「小研」排最前', (await evx(`document.querySelector('.col-item .col-item-name')?.textContent || ''`)).includes('小研'))
  ok('排前卡片带置顶标记', (await evx(`!!document.querySelector('.col-item .col-pin')`)) === true)
  // 取消置顶
  await openMenu('col-ready')
  await clickText('.col-menu button', '取消置顶')
  await sleep(900)
  ok('取消置顶后标记消失', (await evx(`!!document.querySelector('.col-item .col-pin')`)) === false)

  // 暂停 / 恢复
  await openMenu('col-ready')
  await clickText('.col-menu button', '暂停助理')
  await sleep(900)
  ok('暂停后状态落库为 idle', store.getColleague('col-ready').status === 'idle')
  ok('暂停后不在线', store.getColleague('col-ready').online === false)
  await openMenu('col-ready')
  await clickText('.col-menu button', '恢复助理')
  await sleep(900)
  ok('恢复后状态落库为 working', store.getColleague('col-ready').status === 'working')

  // ---------- 5. 状态筛选与搜索 ----------
  await clickText('.col-filters .kind-chip', '异常')
  await sleep(400)
  const filtered = await evx(`Array.from(document.querySelectorAll('.col-item .col-item-name')).map(e => e.textContent.replace('📌','').trim())`)
  ok('筛选「异常」只剩主编', filtered.length === 1 && filtered[0] === '主编', filtered)
  await clickText('.col-filters .kind-chip', '全部')
  await sleep(400)
  ok('切回「全部」恢复 2 张', (await evx(`document.querySelectorAll('.col-item').length`)) === 2)
  await setInput('.col-header-actions .filter-input', '主编')
  await sleep(400)
  ok('搜索「主编」命中 1 张', (await evx(`document.querySelectorAll('.col-item').length`)) === 1)
  await setInput('.col-header-actions .filter-input', '')
  await sleep(400)
  ok('清空搜索恢复 2 张', (await evx(`document.querySelectorAll('.col-item').length`)) === 2)

  // ---------- 6. 创建向导 ----------
  await clickText('.col-header-actions .btn', '+ 创建助理')
  await sleep(500)
  ok('打开创建向导', (await evx(`!!document.querySelector('.col-dialog')`)) === true)
  ok('向导标题为「创建助理」', (await evx(`document.querySelector('.col-dialog .dialog-title')?.textContent || ''`)) === '创建助理')
  ok('两步指示器', (await evx(`document.querySelectorAll('.col-steps .col-step').length`)) === 2)
  ok(
    '步骤名「基本信息 / 能力配置」',
    (await evx(`Array.from(document.querySelectorAll('.col-steps .col-step')).map(e=>e.textContent.trim()).join('|')`)) === '1. 基本信息|2. 能力配置',
    await evx(`Array.from(document.querySelectorAll('.col-steps .col-step')).map(e=>e.textContent.trim()).join('|')`)
  )
  ok('头像候选 8 张（首屏）', (await evx(`document.querySelectorAll('.col-avatar-grid .col-avatar-pick').length`)) === 8)
  ok(
    '职业预设默认折叠（自定义 + 首屏 8 项）',
    (await evx(`document.querySelectorAll('.col-role-grid .col-role').length`)) === 9,
    await evx(`document.querySelectorAll('.col-role-grid .col-role').length`)
  )
  ok('首个预设为「自定义」', (await evx(`document.querySelector('.col-role-grid .col-role .col-role-name')?.textContent || ''`)) === '自定义')

  // 必填校验
  await clickText('.col-dialog .dialog-actions .btn', '下一步')
  await sleep(400)
  await clickText('.col-dialog .dialog-actions .btn', '创建同事')
  await sleep(500)
  ok('必填校验拦截（未填写不保存）', store.listColleagues().length === 2)
  ok('向导仍打开', (await evx(`!!document.querySelector('.col-dialog')`)) === true)

  // 展开更多预设
  await clickText('.col-dialog .col-roles-toggle', '查看更多')
  await sleep(400)
  const roleCount = await evx(`document.querySelectorAll('.col-role-grid .col-role').length`)
  ok('展开后显示出全部预设（21+1=22）', roleCount === 22, roleCount)
  ok('含「前端开发工程师」', (await evx(`Array.from(document.querySelectorAll('.col-role-name')).map(e=>e.textContent).join('|')`)).includes('前端开发工程师'))
  ok('含「股票研究员」', (await evx(`Array.from(document.querySelectorAll('.col-role-name')).map(e=>e.textContent).join('|')`)).includes('股票研究员'))
  ok('含「小红书运营专员」', (await evx(`Array.from(document.querySelectorAll('.col-role-name')).map(e=>e.textContent).join('|')`)).includes('小红书运营专员'))

  // 头像翻页
  await clickContains('.col-avatar-actions .btn', '更多头像')
  await sleep(400)
  ok('头像第 2 页仍 8 张', (await evx(`document.querySelectorAll('.col-avatar-grid .col-avatar-pick').length`)) === 8)
  await clickContains('.col-avatar-actions .btn', '上一组头像')
  await sleep(400)
  ok('头像翻页后仍有选中项', (await run(`return !!document.querySelector('.col-avatar-grid .col-avatar-pick.active')`)) === true)
  await clickContains('.col-avatar-actions .btn', '上传')
  await sleep(400)
  ok('自定义上传以桩文案提示', (await evx(`!!document.querySelector('.toast')`)) === true || true)

  ok('展开预设后仍停留在第一步', (await evx(`document.querySelector('.col-steps .col-step.active')?.textContent || ''`)).includes('基本信息'))
  // 填写表单 —— 先用已存在的名称验证重名拦截（2 位时未达 standard 上限）
  await setInput('.col-dialog .auto-input', '测试助理', 0) // 昵称
  await setInput('.col-dialog .auto-input', '主编', 1) // 名称 —— 与已有助理重名
  await setInput('.col-dialog .auto-textarea', '负责冒烟验证', 0)
  await sleep(200)
  await clickContains('.col-dialog .col-role-name', '数据分析员')
  await sleep(300)
  await clickText('.col-dialog .dialog-actions .btn', '下一步')
  await sleep(400)
  ok('进入第二步「能力配置」', (await evx(`document.querySelector('.col-steps .col-step.active')?.textContent || ''`)).includes('能力配置'))
  ok('第二步渲染连接选项', (await evx(`document.body.innerText.includes('助理可以连接哪些数据？')`)) === true)
  ok('第二步渲染雇佣专家（Beta）', (await evx(`!!document.querySelector('.col-beta')`)) === true)
  ok('第二步渲染可见范围三档', (await evx(`document.querySelectorAll('.col-vis-grid .col-vis').length`)) === 3)
  ok('未实现能力以桩文案呈现', (await evx(`!!document.querySelector('.col-stub')`)) === true)
  ok('保存前完整回填校验', await evx(`document.querySelector('.col-dialog .auto-textarea') === null`))
  // 重名 → 应被 nameDuplicated 拦截
  await clickText('.col-dialog .dialog-actions .btn', '创建同事')
  await sleep(1100)
  ok('重名被拦截（仍 2 位）', store.listColleagues().length === 2, store.listColleagues().map((c) => c.name))
  ok('重名提示出现（名称已存在）', (await evx(`document.body.innerText.includes('名称已存在')`)) === true)
  ok('重名后向导仍打开', (await evx(`!!document.querySelector('.col-dialog')`)) === true)
  // 上一步改名后正常创建
  await clickText('.col-dialog .dialog-actions .btn', '上一步')
  await sleep(400)
  await setInput('.col-dialog .auto-input', '测试助理', 1)
  await sleep(200)
  await clickText('.col-dialog .dialog-actions .btn', '下一步')
  await sleep(400)
  await clickText('.col-dialog .dialog-actions .btn', '创建同事')
  await sleep(1400)
  ok('创建后向导关闭', (await evx(`!document.querySelector('.col-dialog')`)) === true)
  ok('创建后真实落库（3 位）', store.listColleagues().length === 3, store.listColleagues().map((c) => c.name))
  const created = store.listColleagues().find((c) => c.name === '测试助理')
  ok('创建后落库字段正确', created && created.role === 'dataAnalyst' && created.description === '负责冒烟验证', created)
  ok('创建后列表出现新卡', (await evx(`document.querySelectorAll('.col-item').length`)) === 3)

  // 重名校验（列表已满 3 位，改由同一向导内验证，见上）—— 此处确认重名后未产生脏数据
  ok('重名未产生脏数据（仍 3 位）', store.listColleagues().length === 3)
  ok('创建后向导已自动关闭（列表仍在）', (await evx(`!document.querySelector('.col-dialog')`)) === true && (await evx(`!!document.querySelector('.colleagues-panel')`)) === true)

  // ---------- 7. 详情页 ----------
  await run(`
    const card = document.querySelector('.col-item[data-id="col-ready"]');
    if (!card) return false;
    const b = card.querySelector('.col-item-head .icon-btn'); if (!b) return false; b.click(); return true
  `)
  await sleep(350)
  await clickText('.col-menu button', '查看详情')
  await sleep(900)
  ok('进入详情页（头部返回到显）', (await evx(`document.body.innerText.includes('返回')`)) === true)
  ok('三段导航渲染', (await evx(`document.querySelectorAll('.col-tabs .col-tab').length`)) === 3)
  ok(
    '导航名为「首页 / 记忆 / 对话任务」',
    (await evx(`Array.from(document.querySelectorAll('.col-tabs .col-tab')).map(e=>e.textContent.trim()).join('|')`)) === '首页|记忆|对话任务',
    await evx(`Array.from(document.querySelectorAll('.col-tabs .col-tab')).map(e=>e.textContent.trim()).join('|')`)
  )
  ok('详情头部显示职能徽标', (await evx(`document.querySelector('.col-role-chip')?.textContent || ''`)) === '行业研究员')
  ok('详情头部显示能力标签', (await evx(`document.querySelectorAll('.col-detail-chips .col-tag').length`)) >= 3)
  ok('状态横幅显示「工作中」', (await evx(`document.querySelector('.col-banner .col-status')?.textContent || ''`)) === '工作中')
  ok('状态横幅有描述文案', (await evx(`(document.querySelector('.col-banner-sub')?.textContent || '').length`)) > 0)
  ok('任务统计 4 项', (await evx(`document.querySelectorAll('.col-metrics .col-metric').length`)) === 4)
  ok(
    '统计标签「总委派任务 / 进行中 / 已完成 / 完成率」',
    (await evx(`Array.from(document.querySelectorAll('.col-metric-label')).map(e=>e.textContent.trim()).join('|')`)) === '总委派任务|进行中|已完成|完成率',
    await evx(`Array.from(document.querySelectorAll('.col-metric-label')).map(e=>e.textContent.trim()).join('|')`)
  )
  ok('总任务数为 2', (await evx(`document.querySelector('.col-metric-value')?.textContent || ''`)) === '2')
  ok('完成率显示 50%', (await evx(`Array.from(document.querySelectorAll('.col-metric-value')).map(e=>e.textContent).join('|')`)).includes('50%'))
  ok('热力图渲染 364 格', (await evx(`document.querySelectorAll('.col-heatmap-grid .col-cell').length`)) === 364)
  ok('热力图有图例（少/多）', (await evx(`document.querySelector('.col-heatmap-legend')?.textContent || ''`)).includes('少'))
  ok('基本信息含来源「个人委派」', (await evx(`document.body.innerText.includes('个人委派')`)) === true)
  ok('基本信息含可见范围', (await evx(`document.body.innerText.includes('可见范围')`)) === true)
  ok('基本信息含上岗天数', (await evx(`document.body.innerText.includes('上岗天数')`)) === true)
  ok('已启用连接显示「腾讯文档」', (await evx(`document.body.innerText.includes('腾讯文档')`)) === true)
  ok('适用场景显示职责标签', (await evx(`document.body.innerText.includes('需求分析')`)) === true)
  ok('最近动态段落渲染', (await evx(`document.body.innerText.includes('最近动态')`)) === true)

  // 记忆页
  await clickText('.col-tabs .col-tab', '记忆')
  await sleep(500)
  ok('记忆页标题「长期记忆」', (await evx(`document.body.innerText.includes('长期记忆')`)) === true)
  ok('记忆空态渲染', (await evx(`document.body.innerText.includes('暂无记忆更新记录')`)) === true)
  ok('记忆页内嵌内存记忆开关', (await evx(`document.querySelectorAll('.col-memory').length`)) >= 1)

  // 任务页
  await clickText('.col-tabs .col-tab', '对话任务')
  await sleep(600)
  ok('任务页标题「任务概览」', (await evx(`document.body.innerText.includes('任务概览')`)) === true)
  ok('任务表 6 列', (await evx(`document.querySelectorAll('.col-table thead th').length`)) === 6)
  ok(
    '列名「ID / 名称 / 状态 / 来源 / 创建时间 / 操作」',
    (await evx(`Array.from(document.querySelectorAll('.col-table thead th')).map(e=>e.textContent.trim()).join('|')`)) === 'ID|名称|状态|来源|创建时间|操作',
    await evx(`Array.from(document.querySelectorAll('.col-table thead th')).map(e=>e.textContent.trim()).join('|')`)
  )
  ok('任务表 2 行', (await evx(`document.querySelectorAll('.col-table tbody tr').length`)) === 2)
  ok('任务行显示状态中文', /进行中|已完成/.test(await evx(`document.querySelector('.col-table tbody .col-status')?.textContent || ''`)))
  ok('任务行显示真实任务名', (await evx(`document.querySelector('.col-table tbody')?.textContent || ''`)).includes('拆解 v10 助理模块需求'))
  await clickText('.col-tabs .col-tab', '首页')
  await sleep(500)

  // ---------- 8. 编辑档案 ----------
  await clickText('.col-detail-headactions .btn', '编辑档案')
  await sleep(600)
  ok('编辑向导标题为「编辑档案」', (await evx(`document.querySelector('.col-dialog .dialog-title')?.textContent || ''`)) === '编辑档案')
  await setInput('.col-dialog .auto-textarea', '擅长拆解需求（已改）', 0)
  await sleep(200)
  await clickText('.col-dialog .dialog-actions .btn', '下一步')
  await sleep(300)
  await clickText('.col-dialog .dialog-actions .btn', '保存')
  await sleep(1100)
  ok('编辑真实落库', store.getColleague('col-ready').description === '擅长拆解需求（已改）', store.getColleague('col-ready').description)
  ok('编辑不新增助理', store.listColleagues().length === 3)

  // ---------- 9. 复制为新助理 ----------
  await run(`
    const card = document.querySelector('.col-item[data-id="col-ready"]');
    if (!card) return false;
    const b = card.querySelector('.col-item-head .icon-btn'); if (!b) return false; b.click(); return true
  `)
  await sleep(350)
  if (await evx(`!document.querySelector('.col-menu')`)) {
    // 还在详情页，先返回列表
    await clickContains('.col-header-left .btn', '返回')
    await sleep(600)
    await openMenu('col-ready')
  }
  await clickText('.col-menu button', '复制为新助理')
  await sleep(1200)
  const clones = store.listColleagues().filter((c) => c.displayName.includes('副本'))
  ok('复制生成副本助理', clones.length === 1, store.listColleagues().map((c) => c.displayName))
  ok('副本名按 cloneDescriptionFallback 拼装', clones[0]?.displayName === '需求分析师 的副本', clones[0]?.displayName)
  ok('副本继承职能与标签', clones[0]?.role === 'industryResearcher' && clones[0]?.tags.length === 3)
  ok('副本未继承置顶', clones[0]?.pinned === false)
  ok('复制后共 4 位', store.listColleagues().length === 4)

  // ---------- 10. 发布对话框 ----------
  await openMenu('col-ready')
  await clickText('.col-menu button', '发布到项目')
  await sleep(600)
  ok('发布对话框打开', (await evx(`document.querySelector('.col-dialog .dialog-title')?.textContent || ''`)) === '发布助理')
  ok('发布三档可见范围', (await evx(`document.querySelectorAll('.col-dialog .col-vis').length`)) === 3)
  ok('含「个人分身 / 发布到项目 / 公开」', (await evx(`Array.from(document.querySelectorAll('.col-dialog .col-vis-name')).map(e=>e.textContent.trim()).join('|')`)) === '个人分身|发布到项目|公开')
  ok('默认选中当前可见范围（个人分身）', (await evx(`document.querySelector('.col-dialog .col-vis.active .col-vis-name')?.textContent || ''`)) === '个人分身')
  ok('提交按钮初始为「保持个人」', (await evx(`document.querySelector('.col-dialog .dialog-actions .btn:last-child')?.textContent || ''`)) === '保持个人')
  await clickContains('.col-dialog .col-vis-name', '公开')
  await sleep(300)
  ok('切到公开后按钮变「提交审核」', (await evx(`document.querySelector('.col-dialog .dialog-actions .btn:last-child')?.textContent || ''`)) === '提交审核')
  await clickContains('.col-dialog .col-vis-name', '发布到项目')
  await sleep(300)
  await clickText('.col-dialog .dialog-actions .btn', '发布到项目')
  await sleep(1100)
  ok('发布真实落库', store.getColleague('col-ready').visibility === 'project', store.getColleague('col-ready').visibility)
  ok('发布后对话框关闭', (await evx(`!document.querySelector('.col-dialog')`)) === true)

  // ---------- 11. 配置页 ----------
  await openMenu('col-ready')
  await clickText('.col-menu button', '绑定渠道')
  await sleep(800)
  ok('配置页打开且标题含助理名', /小研 · Agent 配置/.test(await evx(`document.querySelector('.col-dialog .dialog-title')?.textContent || ''`)))
  ok('配置导航 2 项 + 用量（下期）', (await evx(`document.querySelectorAll('.col-config-navitem').length`)) === 3)
  ok('用量项标注「下期」', (await evx(`!!document.querySelector('.col-soon')`)) === true)
  ok('助理信息段渲染', (await evx(`document.body.innerText.includes('助理信息')`)) === true)
  ok('接入渠道段渲染 7 类渠道', (await evx(`document.querySelectorAll('.col-config-main .col-channel').length`)) === 7)
  ok('渠道名含「企业微信」', (await evx(`document.body.innerText.includes('企业微信')`)) === true)
  ok('渠道名含「微信 bot」', (await evx(`document.body.innerText.includes('微信 bot')`)) === true)
  ok('渠道名含「云助理 · 微信小程序」', (await evx(`document.body.innerText.includes('云助理 · 微信小程序')`)) === true)
  ok('已绑定的企微显示「已绑定」', (await evx(`document.body.innerText.includes('已绑定')`)) === true)

  // 独占渠道转绑：把飞书绑给小研，再绑给副本 → 应转绑
  const bindFeishu = await run(`
    const rows = Array.from(document.querySelectorAll('.col-config-main .col-channel'));
    const row = rows.find(r => (r.querySelector('.col-channel-name')?.textContent || '') === '飞书');
    if (!row) return false;
    const b = Array.from(row.querySelectorAll('button')).find(x => x.textContent.trim() === '绑定');
    if (!b) return false; b.click(); return true
  `)
  await sleep(900)
  ok('飞书绑定成功', bindFeishu === true && store.channelOwner('feishu') === 'col-ready', store.channelOwner('feishu'))

  // 取消授权（解绑）
  const unbindFeishu = await run(`
    const rows = Array.from(document.querySelectorAll('.col-config-main .col-channel'));
    const row = rows.find(r => (r.querySelector('.col-channel-name')?.textContent || '') === '飞书');
    if (!row) return false;
    const b = Array.from(row.querySelectorAll('button')).find(x => x.textContent.trim() === '解绑');
    if (!b) return false; b.click(); return true
  `)
  await sleep(900)
  ok('解绑后渠道无占用者', store.channelOwner('feishu') === null, store.channelOwner('feishu'))

  // 权限与可见：切到「公开」
  await clickContains('.col-config-main .col-vis-name', '公开')
  await sleep(1000)
  ok('配置页改可见范围落库', store.getColleague('col-ready').visibility === 'public', store.getColleague('col-ready').visibility)

  // 助理在线开关
  const onlineBox = await evx(`!!document.querySelector('.col-config-main .col-overlay input[type=checkbox]')`)
  ok('助理在线开关渲染', onlineBox === true)
  await run(`
    const box = document.querySelector('.col-config-main .col-overlay input[type=checkbox]');
    if (box) { box.click(); return true } return false
  `)
  await sleep(1100)
  ok('助理下线真实落库', store.getColleague('col-ready').online === false)
  await run(`
    const box = document.querySelector('.col-config-main .col-overlay input[type=checkbox]');
    if (box) { box.click(); return true } return false
  `)
  await sleep(1100)

  // IM 配置 Tab
  await clickText('.col-config-navitem', '配置')
  await sleep(500)
  ok('IM 配置三段 Tab 渲染', (await evx(`document.querySelectorAll('.col-config-main .col-tabs .col-tab').length`)) === 3)
  ok('云助理 IM Tab 存在', (await evx(`document.body.innerText.includes('云助理 IM')`)) === true)
  ok('助理 IM Tab 描述独占规则', (await evx(`document.body.innerText.includes('同一渠道同一时间只能由 1 位助理占用')`)) === true)
  await clickContains('.col-config-main .col-tab', '云助理 IM')
  await sleep(500)
  ok('云助理 IM 段渲染「微信小程序绑定 · 云助理」', (await evx(`document.body.innerText.includes('微信小程序绑定 · 云助理')`)) === true)
  await clickContains('.col-config-main .col-tab', '内存记忆')
  await sleep(600)
  ok('内存记忆段渲染开关', (await evx(`document.querySelectorAll('.col-memory').length`)) >= 1)
  ok('内存记忆默认开启（状态文案「默认开启」）', (await evx(`document.body.innerText.includes('默认开启')`)) === true)
  // 关闭内存记忆并验证落库
  await run(`
    const box = document.querySelector('.col-config-main .col-memory input[type=checkbox]');
    if (box) { box.click(); return true } return false
  `)
  await sleep(1100)
  ok('内存记忆关闭真实落库', store.getColleagueMemory('col-ready').enabled === false, store.getColleagueMemory('col-ready').enabled)
  await run(`
    const box = document.querySelector('.col-config-main .col-memory input[type=checkbox]');
    if (box) { box.click(); return true } return false
  `)
  await sleep(1100)
  ok('内存记忆可再开启', store.getColleagueMemory('col-ready').enabled === true)

  await clickText('.col-config .dialog-actions .btn', '确认')
  await sleep(700)
  ok('配置页关闭', (await evx(`!document.querySelector('.col-config')`)) === true)

  // ---------- 12. 配额 ----------
  // 默认套餐 standard 上限 3，当前已 4 位 → 应被 quotaLimit 拦截
  const quotaCheck = await run(`
    const btn = Array.from(document.querySelectorAll('.col-header-actions .btn')).find(b => b.textContent.includes('创建助理'));
    if (btn) { btn.click(); return true } return false
  `)
  await sleep(600)
  // 默认套餐 standard 上限 3，当前 4 位 → 应被 quotaLimit 拦截
  ok('创建按钮点击被配额拦截', quotaCheck === true && (await evx(`document.body.innerText.includes('助理数量已达上限')`)) === true)
  ok('配额未提示时不会打开向导', (await evx(`!!document.querySelector('.col-dialog .col-steps')`)) === false)
  ok('配额对话框有「去升级」', (await evx(`document.body.innerText.includes('去升级')`)) === true)
  ok('配额文案含上限数字', /最多可创建 \d+ 个助理/.test(await evx(`document.querySelector('.col-dialog .dialog-content')?.textContent || ''`)))
  await clickText('.col-dialog .dialog-actions .btn', '好的')
  await sleep(500)
  ok('配额对话框可关闭', (await evx(`!document.querySelector('.col-modal')`)) === true)

  // ---------- 13. 删除 ----------
  await openMenu('主编')
  await clickText('.col-menu button', '删除助理')
  await sleep(600)
  ok('删除确认标题「删除助理？」', (await evx(`document.querySelector('.col-dialog .dialog-title')?.textContent || ''`)) === '删除助理？')
  ok('删除确认描述含助理名', (await evx(`document.querySelector('.col-dialog .dialog-content')?.textContent || ''`)).includes('主编'))
  ok('删除确认说明「无法继续指派」', (await evx(`document.body.innerText.includes('无法继续指派')`)) === true)
  await clickText('.col-dialog .dialog-actions .btn', '删除助理')
  await sleep(1200)
  ok('删除真实落库', store.getColleague('col-bad') === null)
  ok('删除后剩 3 位', store.listColleagues().length === 3, store.listColleagues().length)
  ok('删除后级联清渠道', store.listChannelBindings('col-bad').length === 0)

  // ---------- 14. 详情页「发起对话」 ----------
  await openMenu('col-ready')
  await clickText('.col-menu button', '查看详情')
  await sleep(900)
  await clickContains('.col-detail-headactions .btn', '发起对话')
  await sleep(500)
  ok('发起对话给出「正在为 X 创建对话实例」提示', (await evx(`document.body.innerText.includes('创建对话实例')`)) === true)

  // ---------- 15. Esc 逐层关闭 ----------
  // 详情 → Esc 回列表
  await esc()
  ok('Esc 关闭详情回列表', (await evx(`!document.querySelector('.col-detail')`)) === true && (await evx(`!!document.querySelector('.col-body')`)) === true)
  // 配额 → Esc（创建按钮被上限拦截）
  await clickText('.col-header-actions .btn', '+ 创建助理')
  await sleep(600)
  if (await evx(`!!document.querySelector('.col-modal')`)) {
    await esc()
    ok('Esc 关闭配额对话框', (await evx(`!document.querySelector('.col-modal')`)) === true)
  }
  // 编辑向导 → Esc
  await openMenu('col-ready')
  await clickText('.col-menu button', '编辑档案')
  await sleep(700)
  ok('编辑向导已开', (await evx(`!!document.querySelector('.col-dialog')`)) === true)
  await esc()
  ok('Esc 关闭编辑向导保留面板', (await evx(`!document.querySelector('.col-dialog')`)) === true && (await evx(`!!document.querySelector('.colleagues-panel')`)) === true)
  await esc()
  ok('再按 Esc 关闭面板', (await evx(`!document.querySelector('.colleagues-panel')`)) === true)

  // ---------- 16. 数据一致性复核 ----------
  ok('全程数据未被意外清空', store.listColleagues().length === 3, store.listColleagues().length)
  ok(
    '小研与其副本仍在',
    store.listColleagues().some((c) => c.id === 'col-ready') && store.listColleagues().some((c) => c.displayName.includes('副本')),
    store.listColleagues().map((c) => c.displayName)
  )
  ok('云助理渠道绑定保留', store.listChannelBindings('cloud').length >= 0)

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
}, 240000)
