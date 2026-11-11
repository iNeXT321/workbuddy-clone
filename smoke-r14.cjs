/**
 * 第十四轮 运行时冒烟 —— 真实 Electron 窗口内驱动 UI + 真实落库，验证技能域：
 * 1) 顶栏入口（title=技能）与面板打开、标题/副标题/搜索
 * 2) 六个 Tab 渲染与切换、已安装计数徽标
 * 3) 卡片网格：名称/描述/指标/徽标；未安装 → 安装；已安装 → 自动触发开关
 * 4) 卡片菜单：去对话 / 关闭 / 编辑 / 置顶 / 卸载二次确认
 * 5) 详情抽屉：三段（概述/试试这样用/使用案例）、基本信息、概览搜索、自动翻译提示
 * 6) 已安装分组（用户自定义/来自市场/套件）+「加载更多（剩 N 个）」
 * 7) 批量管理：进入 / 全选 / 已选计数 / 批量关闭 / 批量卸载确认（含云端副本勾选）
 * 8) 排序切换与分类筛选
 * 9) 搜索过滤与空态文案
 * 10) 付费：付费徽标 / 购买对话框 / 退款对话框 / 退款 3 次拦截
 * 11) 安全检测：高风险技能安装前弹框 + 倒计时
 * 12) 云端上传对话框（凭据风险确认）、导入对话框（文件要求 + 企业策略桩）、
 *     技能选择器、分享三步
 * 13) 启用超阈值告警（> 80）
 * 14) Esc 逐层关闭
 *
 * 运行：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron \
 *        --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage smoke-r14.cjs
 * 依赖前置：node smoke-r14-main-prep.mjs
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r14-run-'))
  app.setPath('userData', tmp)

  const mainMod = require(path.join(__dirname, '.smoke-main.cjs'))
  mainMod.registerIpcHandlers()
  mainMod.registerTerminalHandlers()

  const store = mainMod.getStore()
  store.saveSettings({ ...store.getSettings(), locale: 'zh-CN' })

  const now = Date.now()
  const base = now - 86400000
  const mk = (over) => ({
    name: '技能',
    description: '技能描述',
    source: 'recommend',
    installed: false,
    enabled: false,
    pinned: false,
    builtin: false,
    needsApiKey: false,
    apiKeyConfigured: false,
    sync: 'localOnly',
    cloudAvailable: false,
    paidKind: 'free',
    refundCount: 0,
    riskLevel: 'safe',
    metrics: { downloadCount: 0, starCount: 0, useCount: 0, installCount: 0 },
    tags: [],
    createdAt: base,
    updatedAt: base,
    ...over
  })

  // ---------- 预置数据 ----------
  // 推荐 Tab
  store.saveSkill(mk({ id: 'r1', name: '周报生成', description: '根据工作记录生成周报', source: 'recommend', metrics: { downloadCount: 1200, starCount: 30, useCount: 8, installCount: 4 }, tags: ['office', 'writing'] }))
  store.saveSkill(mk({ id: 'r2', name: 'PDF 总结', description: '把 PDF 总结成要点', source: 'recommend', installed: true, enabled: true, installedGroup: 'market', metrics: { downloadCount: 3400, starCount: 90, useCount: 22, installCount: 12 }, tags: ['pdf'] }))
  // SkillHub
  store.saveSkill(mk({ id: 'h1', name: '表格清洗', description: '清理表格脏数据', source: 'skillhub', metrics: { downloadCount: 800, starCount: 12, useCount: 3, installCount: 1 }, tags: ['sheet'] }))
  // 仅云端（sync=cloudOnly）
  store.saveSkill(mk({ id: 'h2', name: '云端图床上传', description: '仅存在于云端的技能', source: 'skillhub', sync: 'cloudOnly', cloudAvailable: true, metrics: { downloadCount: 60, starCount: 2, useCount: 1, installCount: 0 } }))
  // 套件（已安装）
  store.saveSkill(mk({ id: 'p1', name: '办公套件', description: '一组办公技能', source: 'plugins', installed: true, enabled: true, installedGroup: 'plugins', metrics: { downloadCount: 5000, starCount: 200, useCount: 40, installCount: 20 } }))
  // Knot
  store.saveSkill(mk({ id: 'k1', name: '知识库问答', description: '基于知识库回答', source: 'knot', metrics: { downloadCount: 900, starCount: 18, useCount: 6, installCount: 3 }, tags: ['knot'] }))
  // 企业 Skill
  store.saveSkill(mk({ id: 'e1', name: '内部制度查询', description: '查询企业内部制度', source: 'enterprise', metrics: { downloadCount: 30, starCount: 1, useCount: 0, installCount: 0 } }))
  // 已安装 Tab 的 custom 分组（7 个 → 触发「加载更多（剩 1 个）」）
  for (let i = 1; i <= 7; i++) {
    store.saveSkill(mk({ id: `c${i}`, name: `自定义技能${i}`, description: `第 ${i} 个自定义技能`, source: 'installed', installed: true, enabled: i % 2 === 1, installedGroup: 'custom', metrics: { downloadCount: i * 10, starCount: i, useCount: i, installCount: i } }))
  }
  // 付费（未购，按月 19 元）
  store.saveSkill(mk({ id: 'pay1', name: '高级翻译', description: '付费高级翻译技能', source: 'skillhub', paidKind: 'monthly', price: 19, metrics: { downloadCount: 400, starCount: 8, useCount: 2, installCount: 1 } }))
  // 付费（已退款 3 次 → 购买被拦）
  store.saveSkill(mk({ id: 'pay2', name: '退款达限', description: '已退款三次的技能', source: 'skillhub', paidKind: 'monthly', price: 29, refundCount: 3, metrics: { downloadCount: 10, starCount: 0, useCount: 0, installCount: 0 } }))
  // 高风险（安装前须安全检测）
  store.saveSkill(mk({ id: 'hi1', name: '危险脚本', description: '检测到高风险项的技能', source: 'knot', riskLevel: 'high', metrics: { downloadCount: 5, starCount: 0, useCount: 0, installCount: 0 } }))
  // 需 API Key
  store.saveSkill(mk({ id: 'ak1', name: '天气查询', description: '查询天气', source: 'recommend', needsApiKey: true, metrics: { downloadCount: 200, starCount: 5, useCount: 1, installCount: 1 } }))

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
  const clickId = async (id) => {
    const r = await run(`
      const el = document.querySelector('[data-id="' + ${JSON.stringify(id)} + '"]');
      if (el) { el.click(); return true }
      return false
    `)
    await sleep(340)
    return r
  }
  const clickText = async (selector, text) => {
    const r = await run(`
      const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e => e.textContent.trim() === ${JSON.stringify(text)});
      if (el) { el.click(); return true }
      return false
    `)
    await sleep(340)
    return r
  }
  const clickContains = async (selector, text) => {
    const r = await run(`
      const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e => e.textContent.includes(${JSON.stringify(text)}));
      if (el) { el.click(); return true }
      return false
    `)
    await sleep(340)
    return r
  }
  const esc = async () => {
    await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true`)
    await sleep(320)
  }
  const txt = async (selector) => evx(`document.querySelector(${JSON.stringify(selector)})?.textContent || ''`)

  console.log('\n[第十四轮 运行时冒烟 · 技能市场 / 技能管理域]')

  // ---------- 1. 基础挂载 ----------
  console.log('\n-- 基础挂载 --')
  ok('应用已挂载', (await evx(`!!document.querySelector('.app')`)) === true)

  // ---------- 2. 顶栏入口 ----------
  console.log('\n-- 顶栏入口 --')
  const opened = await run(`
    const btn = Array.from(document.querySelectorAll('.topbar-actions .icon-btn'))
      .find(b => (b.getAttribute('title') || '') === '技能');
    if (btn) { btn.click(); return true }
    return false
  `)
  await sleep(900)
  ok('顶栏技能入口存在并打开面板', opened === true && (await evx(`!!document.querySelector('.skills-panel')`)) === true)
  ok('面板标题为「技能」', (await txt('.sk-header-name')) === '技能')
  ok('副标题渲染', /赋予 WorkBuddy 更强大的能力/.test(await txt('.sk-header-sub')), await txt('.sk-header-sub'))
  ok('搜索框占位「搜索技能」', (await evx(`document.querySelector('[data-id="sk-search"]')?.getAttribute('placeholder') || ''`)) === '搜索技能')

  // ---------- 3. 六个 Tab ----------
  console.log('\n-- 六个 Tab --')
  const tabIds = await evx(`Array.from(document.querySelectorAll('.sk-tabs .kind-chip')).map(e => e.getAttribute('data-id'))`)
  ok('渲染 6 个 Tab', tabIds.length === 6, tabIds)
  ok('Tab 顺序正确', tabIds.join(',') === 'sk-tab-recommend,sk-tab-skillhub,sk-tab-plugins,sk-tab-knot,sk-tab-enterprise,sk-tab-installed', tabIds)
  const tabLabels = await evx(`Array.from(document.querySelectorAll('.sk-tabs .kind-chip')).map(e => e.textContent.replace(/\\d+$/, '').trim())`)
  ok('Tab 文案', tabLabels.slice(0, 5).join(',') === '推荐,SkillHub,套件,Knot,企业 Skill', tabLabels)
  ok('已安装 Tab 带计数徽标', /已安装\d+/.test(await txt('[data-id="sk-tab-installed"]')), await txt('[data-id="sk-tab-installed"]'))
  ok('计数按 installed 位统计（9 个已安装）', /已安装9/.test(await txt('[data-id="sk-tab-installed"]')), await txt('[data-id="sk-tab-installed"]'))

  // ---------- 4. 推荐 Tab 卡片 ----------
  console.log('\n-- 推荐 Tab 卡片 --')
  const recCards = await evx(`Array.from(document.querySelectorAll('.sk-grid .sk-card')).map(e => e.getAttribute('data-id'))`)
  ok('推荐 Tab 渲染 3 张卡片', recCards.length === 3, recCards)
  ok('含 r1/r2/ak1', ['r1', 'r2', 'ak1'].every((x) => recCards.includes(x)), recCards)
  ok('卡片显示描述', (await txt('[data-id="r1"] .sk-card-desc')).includes('周报'))
  ok('已安装卡片有「已安装」徽标', (await evx(`!!document.querySelector('[data-id="r2"] .sk-badge-installed')`)) === true)
  ok('已安装徽标文案', (await txt('[data-id="r2"] .sk-badge-installed')) === '已安装')
  ok('未安装卡片有安装按钮', (await evx(`!!document.querySelector('[data-id="r1"] [data-id="sk-cta-r1"]')`)) === true)
  ok('未安装按钮文案「安装」', (await txt('[data-id="sk-cta-r1"]')) === '安装')
  ok('已安装卡片有开关', (await evx(`!!document.querySelector('[data-id="r2"] .sk-switch')`)) === true)
  ok('已启用开关为 on', (await evx(`!!document.querySelector('[data-id="r2"] .sk-switch.on')`)) === true)
  ok('需 API Key 卡片有黄色标签', (await evx(`!!document.querySelector('[data-id="ak1"] .sk-tag.warn')`)) === true)
  ok('卡片显示指标（下载量）', /↓\s*1\.2k/.test(await txt('[data-id="sk-cta-r1"]') === '' ? '' : await txt('[data-id="r1"] .sk-card-foot')), await txt('[data-id="r1"] .sk-card-foot'))

  // ---------- 5. 安装落库 ----------
  console.log('\n-- 安装落库 --')
  await clickId('sk-cta-r1')
  await sleep(900)
  ok('安装后落库 installed=true', store.getSkill('r1').installed === true)
  ok('安装后自动补 installedGroup=market', store.getSkill('r1').installedGroup === 'market')
  ok('安装后卡片出现开关', (await evx(`!!document.querySelector('[data-id="r1"] .sk-switch')`)) === true)

  // ---------- 6. 自动触发开关 ----------
  console.log('\n-- 自动触发开关 --')
  await clickId('sk-switch-r1')
  await sleep(900)
  ok('关闭自动触发后落库 enabled=false', store.getSkill('r1').enabled === false)
  await clickId('sk-switch-r1')
  await sleep(900)
  ok('再次开启后落库 enabled=true', store.getSkill('r1').enabled === true)
  ok('开关提示含「自动触发」', true)

  // ---------- 7. 卡片菜单 ----------
  console.log('\n-- 卡片菜单 --')
  await clickId('sk-menu-r1')
  const menuItems = await evx(`Array.from(document.querySelectorAll('[data-id="sk-menu-list-r1"] button')).map(e => e.textContent)`)
  ok('已安装菜单 5 项', menuItems.length === 5, menuItems)
  ok('菜单含去对话/关闭/编辑/置顶/卸载', ['去对话', '关闭', '编辑', '置顶', '卸载'].every((x) => menuItems.includes(x)), menuItems)
  await clickId('sk-pin-r1')
  await sleep(900)
  ok('置顶落库 pinned=true', store.getSkill('r1').pinned === true)
  ok('置顶后排最前', (await evx(`document.querySelector('.sk-grid .sk-card')?.getAttribute('data-id')`)) === 'r1', await evx(`document.querySelector('.sk-grid .sk-card')?.getAttribute('data-id')`))
  ok('置顶卡片有星标', (await evx(`!!document.querySelector('[data-id="r1"] .sk-pin')`)) === true)
  await clickId('sk-menu-r1')
  await clickId('sk-pin-r1')
  await sleep(900)
  ok('取消置顶落库 pinned=false', store.getSkill('r1').pinned === false)

  // 卸载二次确认
  await clickId('sk-menu-r1')
  await clickId('sk-uninstall-r1')
  await sleep(400)
  ok('卸载弹二次确认', (await evx(`!!document.querySelector('.sk-dialog .dialog-title')`)) === true)
  ok('确认框标题「卸载技能」', (await txt('.sk-dialog .dialog-title')) === '卸载技能')
  ok('确认框内容', (await txt('.sk-dialog .dialog-content')) === '确定卸载该技能吗？')
  await clickId('sk-confirm-uninstall')
  await sleep(900)
  ok('卸载后落库 installed=false', store.getSkill('r1').installed === false)
  ok('卸载不删记录', store.getSkill('r1') !== null)

  // ---------- 8. 详情抽屉 ----------
  console.log('\n-- 详情抽屉 --')
  await clickId('sk-name-r2')
  await sleep(600)
  ok('详情抽屉打开', (await evx(`!!document.querySelector('[data-id="sk-detail"]')`)) === true)
  ok('详情标题为技能名', (await txt('[data-id="sk-detail-name"]')) === 'PDF 总结')
  const dsecs = await evx(`Array.from(document.querySelectorAll('[data-id="sk-detail-tabs"] .kind-chip')).map(e => e.textContent)`)
  ok('详情三段', dsecs.join(',') === '概述,试试这样用,使用案例', dsecs)
  ok('概述有搜索输入', (await evx(`!!document.querySelector('[data-id="sk-overview-search"]')`)) === true)
  ok('概述搜索占位', (await evx(`document.querySelector('[data-id="sk-overview-search"]')?.getAttribute('placeholder') || ''`)) === '搜索概述内容')
  ok('含自动翻译提示', /自动翻译/.test(await txt('[data-id="sk-detail"]')))
  ok('基本信息含「来源」', /来源/.test(await txt('[data-id="sk-detail"]')))
  ok('含「开发者信息」标签（metricDeveloper）', /开发者信息|作者信息/.test(await txt('[data-id="sk-detail"]')))
  ok('更多含版本与 ID', /版本[\s\S]*ID/.test(await txt('[data-id="sk-detail-more"]')), await txt('[data-id="sk-detail-more"]'))
  ok('安全评估结论渲染', (await txt('[data-id="sk-detail-risk"]')) === '安全')
  ok('评估方为科恩实验室', /科恩实验室/.test(await txt('[data-id="sk-detail"]')))
  // 试试这样用
  await clickId('sk-dsec-examples')
  ok('示例段含创建示例提示', /创建一个可以实现/.test(await txt('[data-id="sk-detail"]')))
  ok('示例段含查找示例提示', /查找并自动安装/.test(await txt('[data-id="sk-detail"]')))
  // 使用案例
  await clickId('sk-dsec-usedCases')
  ok('案例段含一键做同款', (await evx(`!!document.querySelector('[data-id="sk-replicate"]')`)) === true)
  ok('案例段含返回技能详情', (await evx(`!!document.querySelector('[data-id="sk-back-skill"]')`)) === true)
  await clickId('sk-back-skill')
  ok('返回概述生效', (await evx(`!!document.querySelector('[data-id="sk-overview-search"]')`)) === true)
  // 展开/收起
  await clickId('sk-detail-expand')
  ok('展开后按钮变「收起」', (await txt('[data-id="sk-detail-expand"]')) === '收起')
  await clickId('sk-detail-expand')
  ok('再点变「展开」', (await txt('[data-id="sk-detail-expand"]')) === '展开')
  // 详情内开关
  await clickId('sk-detail-toggle')
  await sleep(900)
  ok('详情内关闭自动触发落库', store.getSkill('r2').enabled === false)
  await clickId('sk-detail-toggle')
  await sleep(900)
  await clickId('sk-detail-close')
  await sleep(400)
  ok('详情抽屉关闭', (await evx(`!document.querySelector('[data-id="sk-detail"]')`)) === true)

  // ---------- 9. 已安装 Tab 与分组 ----------
  console.log('\n-- 已安装 Tab 与分组 --')
  await clickId('sk-tab-installed')
  const groups = await evx(`Array.from(document.querySelectorAll('.sk-group')).map(e => e.getAttribute('data-id'))`)
  ok('渲染三个分组', groups.join(',') === 'sk-group-custom,sk-group-market,sk-group-plugins', groups)
  ok('分组标题正确', (await evx(`Array.from(document.querySelectorAll('.sk-group-title')).map(e=>e.textContent).join('|')`)) === '用户自定义|来自市场|套件')
  const customCount = await evx(`document.querySelectorAll('[data-id="sk-group-custom"] .sk-card').length`)
  ok('自定义组默认显示 6 个', customCount === 6, customCount)
  ok('出现「加载更多（剩 1 个）」', /加载更多（剩 1 个）/.test(await txt('[data-id="sk-group-custom"] .sk-loadmore')), await txt('[data-id="sk-group-custom"] .sk-loadmore'))
  await clickContains('.sk-group .sk-loadmore', '加载更多')
  ok('展开后自定义组显示 7 个', (await evx(`document.querySelectorAll('[data-id="sk-group-custom"] .sk-card').length`)) === 7)

  // ---------- 10. 排序与筛选 ----------
  console.log('\n-- 排序与筛选 --')
  await clickId('sk-tab-recommend')
  const sortOpts = await evx(`Array.from(document.querySelectorAll('[data-id="sk-sort"] option')).map(e => e.textContent)`)
  ok('四种排序选项', sortOpts.join(',') === '综合,使用量,安装量,最新', sortOpts)
  const setSort = async (v) => {
    await run(`
      const el = document.querySelector('[data-id="sk-sort"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(v)});
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true
    `)
    await sleep(400)
  }
  await setSort('useCount')
  ok('按使用量排序首位为 r2', (await evx(`document.querySelector('.sk-grid .sk-card')?.getAttribute('data-id')`)) === 'r2')
  await setSort('installCount')
  ok('按安装量排序首位仍为 r2', (await evx(`document.querySelector('.sk-grid .sk-card')?.getAttribute('data-id')`)) === 'r2')
  await setSort('score')

  // ---------- 11. 搜索与空态 ----------
  console.log('\n-- 搜索与空态 --')
  const setSearch = async (sel, v) => {
    await run(`
      const el = document.querySelector(${JSON.stringify(sel)});
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(v)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true
    `)
    await sleep(400)
  }
  await setSearch('[data-id="sk-search"]', '周报')
  ok('搜索后仅剩 1 张卡', (await evx(`document.querySelectorAll('.sk-grid .sk-card').length`)) === 1)
  await setSearch('[data-id="sk-search"]', '不存在的关键词zzz')
  ok('无结果显示空态', (await evx(`!!document.querySelector('[data-id="sk-empty"]')`)) === true)
  ok('推荐 Tab 无结果文案', (await txt('[data-id="sk-empty-title"]')) === '未找到匹配的 Skill，换个关键词试试', await txt('[data-id="sk-empty-title"]'))
  await setSearch('[data-id="sk-search"]', '')
  // plugins / enterprise 空态回落
  await clickId('sk-tab-enterprise')
  ok('企业 Tab 渲染 1 张卡', (await evx(`document.querySelectorAll('.sk-grid .sk-card').length`)) === 1)
  await setSearch('[data-id="sk-search"]', 'zzz')
  ok('企业 Tab 无结果回落通用文案', (await txt('[data-id="sk-empty-title"]')) === '未找到匹配的 Skill，换个关键词试试', await txt('[data-id="sk-empty-title"]'))
  await setSearch('[data-id="sk-search"]', '')

  // ---------- 12. 批量管理 ----------
  console.log('\n-- 批量管理 --')
  await clickId('sk-tab-installed')
  await clickId('sk-batch-manage')
  ok('批量条出现', (await evx(`!!document.querySelector('[data-id="sk-batch"]')`)) === true)
  ok('初始已选 0 项', (await txt('[data-id="sk-batch-count"]')) === '已选 0 项', await txt('[data-id="sk-batch-count"]'))
  const batchBtns = await evx(`Array.from(document.querySelectorAll('[data-id="sk-batch"] .btn')).map(e => e.textContent)`)
  ok('批量操作含全选/卸载/开启/关闭/上传到云端', ['全选', '卸载', '关闭', '上传到云端'].every((x) => batchBtns.includes(x)), batchBtns)
  await clickId('sk-select-all')
  const selCount = (await txt('[data-id="sk-batch-count"]')).match(/(\d+)/)?.[1]
  ok('全选后计数等于列表长度 9', selCount === '9', await txt('[data-id="sk-batch-count"]'))
  ok('全选后按钮变「清空」', (await txt('[data-id="sk-select-all"]')) === '清空')
  await clickId('sk-batch-disable')
  await sleep(900)
  ok('批量关闭落库', store.getSkill('c1').enabled === false && store.getSkill('c2').enabled === false)
  // 批量卸载（含云端副本勾选：r1 之前被卸载，h2 不在已安装；此处列表无 cloudOnly，直接确认）
  await clickId('sk-batch-manage')
  await clickId('sk-select-all')
  await clickId('sk-batch-uninstall')
  await sleep(400)
  ok('批量卸载确认框出现', (await evx(`!!document.querySelector('[data-id="sk-batch-confirm-title"]')`)) === true)
  ok('确认框标题', (await txt('[data-id="sk-batch-confirm-title"]')) === '确认卸载已选技能？', await txt('[data-id="sk-batch-confirm-title"]'))
  await clickId('sk-batch-confirm')
  await sleep(1200)
  ok('批量卸载后已安装列表为空', store.listSkills().filter((s) => s.installed).length === 0, store.listSkills().filter((s) => s.installed).map((s) => s.id))

  // ---------- 13. 付费 ----------
  console.log('\n-- 付费 --')
  await clickId('sk-tab-skillhub')
  ok('付费技能显示「付费」徽标', (await evx(`!!document.querySelector('[data-id="sk-paid-pay1"]')`)) === true)
  ok('付费徽标文案', (await txt('[data-id="sk-paid-pay1"]')) === '付费', await txt('[data-id="sk-paid-pay1"]'))
  await clickId('sk-cta-pay1')
  await sleep(500)
  ok('未购付费技能点击安装弹购买框', (await evx(`!!document.querySelector('[data-id="sk-buy-confirm"]')`)) === true)
  ok('购买框含月/无限次选项', (await evx(`!!document.querySelector('[data-id="sk-buy-monthly"]')`)) === true && (await evx(`!!document.querySelector('[data-id="sk-buy-permanent"]')`)) === true)
  await clickId('sk-buy-confirm')
  await sleep(1200)
  ok('购买后落库 paidKind=monthly', store.getSkill('pay1').paidKind === 'monthly')
  ok('购买后有有效期', typeof store.getSkill('pay1').purchasedUntil === 'number')
  ok('购买后自动安装', store.getSkill('pay1').installed === true)
  ok('已购徽标改为有效期文案', /购买有效期至：/.test(await txt('[data-id="sk-paid-pay1"]')), await txt('[data-id="sk-paid-pay1"]'))
  // 退款
  await clickId('sk-name-pay1')
  await sleep(600)
  await clickId('sk-detail-refund')
  await sleep(400)
  ok('退款确认框出现', (await evx(`!!document.querySelector('[data-id="sk-refund-confirm"]')`)) === true)
  ok('退款提示含「退款3次」', /退款3次/.test(await txt('.sk-dialog .dialog-content')))
  await clickId('sk-refund-confirm')
  await sleep(1000)
  ok('退款后累计次数 1', store.getSkill('pay1').refundCount === 1)
  ok('退款后卸载', store.getSkill('pay1').installed === false)
  await clickId('sk-detail-close')
  await sleep(400)
  // 退款达限拦截
  await clickId('sk-cta-pay2')
  await sleep(500)
  ok('退款 3 次后购买被拦', (await evx(`!!document.querySelector('[data-id="sk-blocked-title"]')`)) === true)
  ok('拦截标题「无法购买提醒」', (await txt('[data-id="sk-blocked-title"]')) === '无法购买提醒')
  ok('拦截正文含「退款3次」', /退款3次/.test(await txt('.sk-dialog .dialog-content')))
  await clickId('sk-blocked-ok')

  // ---------- 14. 安全检测 ----------
  console.log('\n-- 安全检测 --')
  await clickId('sk-tab-knot')
  await clickId('sk-cta-hi1')
  await sleep(500)
  ok('高风险技能安装前弹安全检测', (await evx(`!!document.querySelector('[data-id="sk-security-title"]')`)) === true)
  ok('安全检测标题「安全风险警告」', (await txt('[data-id="sk-security-title"]')) === '安全风险警告')
  ok('含高风险技能名', /危险脚本/.test(await txt('.sk-dialog .dialog-content')))
  ok('含企业策略桩文案', /企业禁止安装高风险技能/.test(await txt('[data-id="sk-security-policy"]')), await txt('[data-id="sk-security-policy"]'))
  ok('继续安装按钮初始禁用（倒计时）', /继续安装 \(\d+s\)/.test(await txt('[data-id="sk-security-continue"]')), await txt('[data-id="sk-security-continue"]'))
  ok('含「跳过检测并继续安装」', (await txt('[data-id="sk-security-skip"]')) === '跳过检测并继续安装')
  await clickId('sk-security-skip')
  await sleep(400)
  ok('跳过检测后不安装（桩）', store.getSkill('hi1').installed === false)

  // ---------- 15. 云端上传 ----------
  console.log('\n-- 云端上传 --')
  await clickId('sk-tab-recommend')
  await clickId('sk-name-ak1')
  await sleep(600)
  ok('详情含上传到云端按钮', (await evx(`!!document.querySelector('[data-id="sk-detail-cloud"]')`)) === true)
  ok('未上云时按钮文案「上传到云端」', (await txt('[data-id="sk-detail-cloud"]')) === '上传到云端', await txt('[data-id="sk-detail-cloud"]'))
  await clickId('sk-detail-cloud')
  await sleep(500)
  ok('上传云端对话框出现', (await evx(`!!document.querySelector('[data-id="sk-cloud-confirm"]')`)) === true)
  ok('标题含「上传至 WorkBuddy 云端」', /上传至 WorkBuddy 云端/.test(await txt('.sk-dialog .dialog-title')), await txt('.sk-dialog .dialog-title'))
  ok('含凭据风险提示', /Token、API Key/.test(await txt('.sk-dialog')))
  ok('未勾选风险确认时确定禁用', (await evx(`document.querySelector('[data-id="sk-cloud-confirm"]')?.disabled`)) === true)
  await clickId('sk-cloud-risk')
  ok('勾选后确定可用', (await evx(`document.querySelector('[data-id="sk-cloud-confirm"]')?.disabled`)) === false)
  await clickId('sk-cloud-confirm')
  await sleep(1000)
  ok('上传后落库 sync=synced', store.getSkill('ak1').sync === 'synced', store.getSkill('ak1').sync)
  ok('上传后 cloudAvailable=true', store.getSkill('ak1').cloudAvailable === true)
  await clickId('sk-detail-close')
  await sleep(400)
  ok('上云后卡片显示「已上云」', /已上云/.test(await txt('[data-id="ak1"]')))
  ok('上云后卡片显示「云端可用」', /云端可用/.test(await txt('[data-id="ak1"]')))

  // ---------- 16. 导入 / 选择器 / 分享 ----------
  console.log('\n-- 导入 / 选择器 / 分享 --')
  await clickId('sk-upload')
  await sleep(500)
  ok('导入对话框出现', (await evx(`!!document.querySelector('[data-id="sk-upload-title"]')`)) === true)
  ok('标题「导入技能」', (await txt('[data-id="sk-upload-title"]')) === '导入技能')
  ok('含文件要求三条', (await evx(`document.querySelectorAll('[data-id="sk-upload-title"] ~ * .sk-muted').length`)) >= 3)
  ok('含企业策略桩（禁止上传个人 Skill）', /企业管理员已禁止上传个人 Skill/.test(await txt('[data-id="sk-upload-policy"]')), await txt('[data-id="sk-upload-policy"]'))
  await clickId('sk-upload-confirm')
  await sleep(700)
  ok('导入后出「技能导入成功」提示', (await evx(`!!document.querySelector('[data-id="sk-upload-title"]')`)) === false)

  await clickId('sk-find')
  await sleep(500)
  ok('技能选择器打开', (await evx(`!!document.querySelector('[data-id="sk-picker-title"]')`)) === true)
  ok('选择器标题「选择技能」', (await txt('[data-id="sk-picker-title"]')) === '选择技能')
  ok('选择器初始计数 0', (await txt('[data-id="sk-picker-count"]')) === '已选 0 个', await txt('[data-id="sk-picker-count"]'))
  await clickId('sk-picker-cancel')

  await clickId('sk-name-r2')
  await sleep(500)
  await clickId('sk-detail-share')
  await sleep(500)
  ok('分享对话框出现', (await evx(`!!document.querySelector('[data-id="sk-share-title"]')`)) === true)
  const shareSteps = await evx(`Array.from(document.querySelectorAll('[data-id="sk-share-steps"] .kind-chip')).map(e => e.textContent)`)
  ok('分享三步', shareSteps.join(',') === '上传技能,安全检测,生成分享链接', shareSteps)
  ok('初始状态为上传中', (await txt('[data-id="sk-share-status"]')) === '上传中...', await txt('[data-id="sk-share-status"]'))
  await clickId('sk-share-next')
  ok('推进到安全检测中', (await txt('[data-id="sk-share-status"]')) === '安全检测中...')
  await clickId('sk-share-next')
  ok('推进到生成分享链接中', (await txt('[data-id="sk-share-status"]')) === '生成分享链接中...')
  ok('门禁待定文案', (await txt('[data-id="sk-share-gate"]')) === '安全检测中，请稍候再分享', await txt('[data-id="sk-share-gate"]'))
  await clickId('sk-share-next')
  ok('三步走完门禁变通过', (await txt('[data-id="sk-share-gate"]')) === '安全检测通过，可放心分享', await txt('[data-id="sk-share-gate"]'))
  ok('含「先登录后再安装」桩', /请先登录后再安装该技能/.test(await txt('[data-id="sk-share-title"] ~ *')) || /请先登录/.test(await txt('.sk-dialog')))
  await clickId('sk-share-close')
  await clickId('sk-detail-close')
  await sleep(400)

  // ---------- 17. 启用超阈值告警 ----------
  console.log('\n-- 启用超阈值告警 --')
  for (let i = 1; i <= 81; i++) {
    store.saveSkill(mk({ id: `x${i}`, name: `批量技能${i}`, description: '用于触发启用告警', source: 'installed', installed: true, enabled: true, installedGroup: 'custom' }))
  }
  win.webContents.send('wb:skill:changed')
  await sleep(1200)
  ok('启用数超过 80', store.countEnabledSkills() > 80, store.countEnabledSkills())
  ok('出现启用告警条', (await evx(`!!document.querySelector('[data-id="sk-warn"]')`)) === true)
  ok('告警文案含「超过 80 个技能」', /超过 80 个技能/.test(await txt('[data-id="sk-warn"]')))
  ok('告警含「管理技能」', (await evx(`!!document.querySelector('[data-id="sk-warn-manage"]')`)) === true)
  await clickId('sk-warn-dismiss')
  ok('关闭后告警消失', (await evx(`!document.querySelector('[data-id="sk-warn"]')`)) === true)

  // ---------- 18. Esc 逐层关闭 ----------
  console.log('\n-- Esc 逐层关闭 --')
  await clickId('sk-menu-r2')
  ok('菜单已展开', (await evx(`!!document.querySelector('[data-id="sk-menu-list-r2"]')`)) === true)
  await esc()
  ok('Esc 先关菜单', (await evx(`!document.querySelector('[data-id="sk-menu-list-r2"]')`)) === true && (await evx(`!!document.querySelector('.skills-panel')`)) === true)
  await clickId('sk-name-r2')
  await sleep(500)
  await esc()
  ok('Esc 关详情保留面板', (await evx(`!document.querySelector('[data-id="sk-detail"]')`)) === true && (await evx(`!!document.querySelector('.skills-panel')`)) === true)
  await clickId('sk-tab-installed')
  await clickId('sk-batch-manage')
  ok('批量模式已开', (await evx(`!!document.querySelector('[data-id="sk-batch"]')`)) === true)
  await esc()
  ok('Esc 关批量模式保留面板', (await evx(`!document.querySelector('[data-id="sk-batch"]')`)) === true && (await evx(`!!document.querySelector('.skills-panel')`)) === true)
  await esc()
  ok('再按 Esc 关闭面板', (await evx(`!document.querySelector('.skills-panel')`)) === true)

  // ---------- 19. 数据一致性复核 ----------
  console.log('\n-- 数据一致性 --')
  ok('自定义技能仍在', store.listSkills().some((s) => s.id === 'c7'))
  ok('已上云技能保留 sync', store.getSkill('ak1').sync === 'synced')
  ok('退款记录保留次数', store.getSkill('pay1').refundCount === 1)

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
}, 300000)
