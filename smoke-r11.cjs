/**
 * 第十一轮 运行时冒烟 —— 真实 Electron 窗口内驱动 UI + 真实调度器执行，验证：
 * 1) 定时任务面板入口与打开
 * 2) 双 Tab（定时任务 / 运行记录）
 * 3) 分组（已安排 / 已完成 / 已归档）+ 状态筛选 + 来源筛选
 * 4) 卡片操作：暂停 / 恢复 / 归档
 * 5) 新建表单：七类频率切换、摘要文案、权限、校验、真实保存落库
 * 6) 立即运行：调用真实 LLM（假服务器）→ 建会话 → 落运行记录
 * 7) 运行记录页：分组、状态、失败分因、搜索过滤
 * 8) 删除任务（二次确认）
 *
 * 运行：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron \
 *        --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage smoke-r11.cjs
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

// 假 LLM 服务器（OpenAI 兼容 SSE）—— 对定时任务返回固定文本
function startFakeServer() {
  const http = require('node:http')
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
      send({ choices: [{ delta: { content: 'AUTO-' } }] })
      send({ choices: [{ delta: { content: 'DONE' } }] })
      send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r11-run-'))
  app.setPath('userData', tmp)

  const server = await startFakeServer()
  const port = server.address().port

  // 注册真实主进程 handler（非 mock）
  const mainMod = require(path.join(__dirname, '.smoke-main.cjs'))
  mainMod.registerIpcHandlers()
  mainMod.registerTerminalHandlers()

  const store = mainMod.getStore()
  store.saveSettings({
    ...store.getSettings(),
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: 'smoke-key',
    model: 'claude-sonnet-4',
    locale: 'zh-CN'
  })

  // 预置：一个已启用任务（每天 09:00）、一个已归档任务、一条成功记录、一条失败记录
  const now = Date.now()
  store.saveAutomation({
    id: 'a-daily',
    name: '每日简报',
    prompt: '汇总昨日动态',
    schedule: { kind: 'daily', time: '09:00' },
    permission: 'default',
    enabled: true,
    archived: false,
    env: 'local',
    createdAt: now,
    updatedAt: now
  })
  store.saveAutomation({
    id: 'a-once',
    name: '一次性任务',
    prompt: '跑一次',
    schedule: { kind: 'once', at: now - 1000 },
    permission: 'default',
    enabled: false,
    archived: false,
    env: 'local',
    createdAt: now,
    updatedAt: now
  })
  store.saveAutomation({
    id: 'a-arch',
    name: '已归档任务',
    prompt: '归档',
    schedule: { kind: 'daily', time: '10:00' },
    permission: 'default',
    enabled: false,
    archived: true,
    env: 'local',
    createdAt: now,
    updatedAt: now
  })
  store.addAutomationRun({ id: 'r-ok', automationId: 'a-daily', taskName: '每日简报', status: 'succeeded', startedAt: now - 60000, finishedAt: now - 55000, summary: '完成', evidence: { assistantOutput: true } })
  store.addAutomationRun({ id: 'r-bad', automationId: 'a-daily', taskName: '每日简报', status: 'failed', reason: 'network', startedAt: now - 120000, finishedAt: now - 118000, error: 'fetch failed' })

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
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
  const setInput = async (selector, value) => {
    await run(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true
    `)
    await sleep(200)
  }

  console.log('\n[第十一轮 运行时冒烟]')

  // ---------- 1. 基础挂载 ----------
  ok('应用已挂载', (await ev(`!!document.querySelector('.app')`)) === true)

  // ---------- 2. 打开定时任务面板 ----------
  const opened = await run(`
    const btn = Array.from(document.querySelectorAll('.topbar-actions .icon-btn'))
      .find(b => (b.getAttribute('title') || '') === '定时任务');
    if (btn) { btn.click(); return true; }
    return false
  `)
  await sleep(600)
  ok('顶栏定时任务入口存在并打开面板', opened === true && (await ev(`!!document.querySelector('.automation-panel')`)) === true)
  ok('面板标题为「定时任务」', (await ev(`document.querySelector('.auto-title')?.textContent || ''`)) === '定时任务')
  ok('面板含双 Tab', (await ev(`document.querySelectorAll('.auto-tab').length`)) === 2)

  // ---------- 3. 分组渲染 ----------
  const groupNames = await ev(`Array.from(document.querySelectorAll('.auto-group-name')).map(e => e.textContent)`)
  ok('分组含「已安排」', groupNames.includes('已安排'), groupNames)
  ok('分组含「已完成」', groupNames.includes('已完成'), groupNames)
  ok('分组含「已归档」', groupNames.includes('已归档'), groupNames)
  const cardNames = await ev(`Array.from(document.querySelectorAll('.auto-card-title')).map(e => e.textContent.replace('云端','').trim())`)
  ok('卡片渲染出预置任务', cardNames.includes('每日简报'), cardNames)
  ok('过期 once 任务不显示下次执行', (await ev(`document.body.innerText.includes('已过期')`)) === true)

  // ---------- 4. 状态筛选 ----------
  await run(`
    const sel = document.querySelector('.auto-toolbar .filter-select');
    sel.value = 'statusActive';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true
  `)
  await sleep(350)
  const afterActive = await ev(`Array.from(document.querySelectorAll('.auto-card-title')).map(e => e.textContent.replace('云端','').trim())`)
  ok('筛选「已启用」后仅剩启用任务', afterActive.includes('每日简报') && !afterActive.includes('一次性任务'), afterActive)
  await run(`
    const sel = document.querySelector('.auto-toolbar .filter-select');
    sel.value = 'statusPaused';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true
  `)
  await sleep(350)
  const afterPaused = await ev(`Array.from(document.querySelectorAll('.auto-card-title')).map(e => e.textContent.replace('云端','').trim())`)
  ok('筛选「已暂停」后含一次性任务', afterPaused.includes('一次性任务'), afterPaused)
  await run(`
    const sel = document.querySelector('.auto-toolbar .filter-select');
    sel.value = 'all';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true
  `)
  await sleep(300)

  // ---------- 5. 卡片操作：暂停 / 恢复「每日简报」 ----------
  await run(`
    const card = Array.from(document.querySelectorAll('.auto-card')).find(c => c.querySelector('.auto-card-title')?.textContent.includes('每日简报'));
    const btn = Array.from(card.querySelectorAll('.auto-card-actions .btn')).find(b => b.textContent === '暂停任务');
    if (btn) btn.click();
    return true
  `)
  await sleep(800)
  ok('暂停后 DB enabled=false', store.getAutomation('a-daily').enabled === false)
  await run(`
    const card = Array.from(document.querySelectorAll('.auto-card')).find(c => c.querySelector('.auto-card-title')?.textContent.includes('每日简报'));
    const btn = Array.from(card.querySelectorAll('.auto-card-actions .btn')).find(b => b.textContent === '开启任务');
    if (btn) btn.click();
    return true
  `)
  await sleep(800)
  ok('恢复后 DB enabled=true', store.getAutomation('a-daily').enabled === true)

  // ---------- 6. 新建表单：频率切换 + 摘要 + 校验 ----------
  await run(`
    const btn = Array.from(document.querySelectorAll('.auto-head-right .btn'))[0];
    btn.click();
    return true
  `)
  await sleep(500)
  ok('打开新建表单', (await ev(`!!document.querySelector('.auto-modal')`)) === true)
  ok('表单标题为「新建定时任务」', (await ev(`document.querySelector('.auto-modal .dialog-title')?.textContent || ''`)) === '新建定时任务')
  const kindChips = await ev(`Array.from(document.querySelectorAll('.auto-modal .kind-chip')).map(e => e.textContent.trim())`)
  ok('频率选项含「每天」', kindChips.includes('每天'), kindChips.slice(0, 10))
  ok('频率选项含「单次任务」', kindChips.includes('单次任务'), kindChips.slice(0, 10))
  ok('频率选项含「按间隔」', kindChips.includes('按间隔'), kindChips.slice(0, 10))
  // 表单权限 chip 用 automation.modal.permissionMode.*（需逐次确认 / 免确认执行）；
  // automation.permission.default「默认权限」是任务卡片上的标签，不在此处渲染
  ok('权限选项含「需逐次确认」', kindChips.includes('需逐次确认'), kindChips.slice(-4))
  ok('权限选项含「完全访问权限（推荐）」', kindChips.includes('完全访问权限（推荐）'), kindChips.slice(-4))
  // 默认 daily → 摘要「每天 09:00」
  ok('默认摘要为「每天 09:00」', (await ev(`document.querySelector('.schedule-preview')?.textContent || ''`)).includes('每天 09:00'))

  // 空名保存 → 校验提示
  await run(`
    const btn = Array.from(document.querySelectorAll('.auto-modal .dialog-actions .btn')).find(b => b.textContent === '创建');
    btn.click();
    return true
  `)
  await sleep(400)
  ok('空名保存被拦截（提示填写名称）', (await ev(`document.body.innerText.includes('请填写定时任务名称')`)) === true)
  ok('表单未关闭（校验失败）', (await ev(`!!document.querySelector('.auto-modal')`)) === true)

  // 填名称 + 提示词 + 切到「每周」+ 选周一
  await setInput('.auto-modal .ws-create-input', '冒烟定时任务')
  await setInput('.auto-modal .auto-textarea', '把昨天的日报汇总一下')
  await run(`
    const chips = Array.from(document.querySelectorAll('.auto-modal .kind-chip'));
    const weekly = chips.find(c => c.textContent.trim() === '每周');
    weekly.click();
    return true
  `)
  await sleep(300)
  ok('切到每周后出现星期选择', (await ev(`document.querySelectorAll('.auto-modal .kind-chip').length > 8`)) === true)
  ok('每周摘要初始为「每周 每天 09:00」或含每周', (await ev(`document.querySelector('.schedule-preview')?.textContent || ''`)).includes('每周'))
  await run(`
    const chips = Array.from(document.querySelectorAll('.auto-modal .kind-chip'));
    const mo = chips.find(c => c.textContent.trim() === '周一');
    mo.click();
    return true
  `)
  await sleep(300)
  ok('选周一后摘要含「周一」', (await ev(`document.querySelector('.schedule-preview')?.textContent || ''`)).includes('周一'))

  // 保存（真实落库）
  await run(`
    const btn = Array.from(document.querySelectorAll('.auto-modal .dialog-actions .btn')).find(b => b.textContent === '创建');
    btn.click();
    return true
  `)
  await sleep(1000)
  ok('保存后表单关闭', (await ev(`!document.querySelector('.auto-modal')`)) === true)
  const created = store.listAutomations(true).find((a) => a.name === '冒烟定时任务')
  ok('新任务已落库', !!created, created && created.id)
  ok('新任务 schedule.kind=weekly', created && created.schedule.kind === 'weekly', created && created.schedule)
  ok('新任务 weekdays 含 MO', created && created.schedule.weekdays && created.schedule.weekdays.includes('MO'), created && created.schedule.weekdays)
  ok('新任务 enabled=true', created && created.enabled === true)
  ok('新任务已计算 nextRunAt', created && typeof created.nextRunAt === 'number' && created.nextRunAt > Date.now())

  // ---------- 7. 立即运行（真实调度器 + 真实 LLM） ----------
  const convBefore = store.listConversations(true).length
  const runResult = await mainMod.runAutomation(store.getAutomation('a-daily'))
  ok('runAutomation 返回记录 status=succeeded', runResult.status === 'succeeded', runResult.status)
  ok('runAutomation 关联会话 id', typeof runResult.conversationId === 'string' && runResult.conversationId.length > 0, runResult.conversationId)
  ok('runAutomation 产出摘要', typeof runResult.summary === 'string' && runResult.summary.includes('AUTO-DONE'), runResult.summary)
  ok('运行后新建了会话', store.listConversations(true).length === convBefore + 1)
  const conv = store.getConversation(runResult.conversationId)
  ok('新会话含用户提示词消息', !!conv && conv.messages.some((m) => m.content === '汇总昨日动态'))
  ok('新会话含助手回复', !!conv && conv.messages.some((m) => m.role === 'assistant' && m.content.includes('AUTO-DONE')))
  ok('证据含「已产出回复」', runResult.evidence && runResult.evidence.assistantOutput === true, runResult.evidence)
  const dueAfter = store.listAutomationRuns('a-daily').length
  ok('运行记录已落库', dueAfter >= 3, dueAfter)

  // ---------- 8. 运行记录页 ----------
  await run(`
    const tabs = Array.from(document.querySelectorAll('.auto-tab'));
    tabs.find(t => t.textContent === '运行记录').click();
    return true
  `)
  await sleep(500)
  ok('切换到运行记录页', (await ev(`!!document.querySelector('.run-head')`)) === true)
  const runRows = await ev(`document.querySelectorAll('.run-row').length`)
  ok('运行记录行已渲染', runRows >= 3, runRows)
  ok('含失败记录（分因渲染）', (await ev(`document.body.innerText.includes('网络连接异常')`)) === true)
  ok('含成功记录状态', (await ev(`document.body.innerText.includes('成功')`)) === true)
  const dayHeads = await ev(`Array.from(document.querySelectorAll('.run-group-head')).map(e => e.textContent)`)
  ok('记录按日期分组', dayHeads.length >= 1, dayHeads)

  // 搜索过滤
  await setInput('.auto-toolbar .filter-input', '不存在的任务名')
  await sleep(350)
  ok('搜索无匹配显示空态', (await ev(`document.body.innerText.includes('没有匹配的记录')`)) === true)
  await setInput('.auto-toolbar .filter-input', '每日简报')
  await sleep(350)
  ok('搜索「每日简报」后有结果', (await ev(`document.querySelectorAll('.run-row').length >= 1`)) === true)

  // ---------- 9. 删除任务（二次确认） ----------
  await run(`
    const tabs = Array.from(document.querySelectorAll('.auto-tab'));
    tabs.find(t => t.textContent === '定时任务').click();
    return true
  `)
  await sleep(400)
  await run(`
    const card = Array.from(document.querySelectorAll('.auto-card')).find(c => c.querySelector('.auto-card-title')?.textContent.includes('冒烟定时任务'));
    const btn = Array.from(card.querySelectorAll('.auto-card-actions .btn')).find(b => b.textContent === '删除');
    if (btn) btn.click();
    return true
  `)
  await sleep(400)
  ok('打开删除确认弹窗', (await ev(`document.body.innerText.includes('确认删除定时任务？')`)) === true)
  await run(`
    const btn = Array.from(document.querySelectorAll('.modal .dialog-actions .btn')).find(b => b.textContent === '删除');
    if (btn) btn.click();
    return true
  `)
  await sleep(900)
  ok('删除后 DB 中消失', !store.listAutomations(true).some((a) => a.name === '冒烟定时任务'))

  // ---------- 10. 关闭面板（Esc） ----------
  await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true`)
  await sleep(400)
  ok('Esc 关闭定时任务面板', (await ev(`!document.querySelector('.automation-panel')`)) === true)

  console.log(`\n结果：${pass}/${pass + fail} 通过`)
  console.log(`渲染层控制台报错：${consoleErrors.length}`)
  consoleErrors.slice(0, 8).forEach((e) => console.log('  ERR: ' + e))

  server.close()
  fs.rmSync(tmp, { recursive: true, force: true })
  app.exit(fail === 0 && consoleErrors.length === 0 ? 0 : 1)
}).catch((e) => {
  console.error('冒烟异常：', e)
  app.exit(2)
})

setTimeout(() => {
  console.log('TIMEOUT')
  app.exit(4)
}, 120000)
