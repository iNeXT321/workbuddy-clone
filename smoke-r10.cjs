/**
 * 第十轮 运行时冒烟 —— 真实 Electron 窗口内驱动 UI，验证：
 * 1) 侧栏状态角标 / 工作空间分组 / 分组工具栏 / 折叠展开
 * 2) 任务搜索覆盖层（⌘K 触发、最近任务、输入过滤、键盘导航、Esc 关闭）
 * 3) 来源徽标
 * 4) 新建工作空间弹窗（真实落盘）
 * 5) 运行中任务查询 IPC（关窗确认依据）
 * 6) 真实对话以验证 working 角标流转与 runningTasks 清空
 *
 * 运行：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron \
 *        --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage smoke-r10.cjs
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

// 假 LLM 服务器（OpenAI 兼容 SSE）
function startFakeServer() {
  const http = require('node:http')
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
      send({ choices: [{ delta: { content: 'R10-' } }] })
      send({ choices: [{ delta: { content: 'OK' } }] })
      send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r10-run-'))
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
  // 预置两个会话
  const c1 = store.createConversation('跑批任务')
  store.setConversationStatus(c1.id, 'working')
  store.setConversationWorkspace(c1.id, 'ws-alpha')
  const c2 = store.createConversation('小程序需求')
  store.setConversationStatus(c2.id, 'unread')
  store.setConversationWorkspace(c2.id, 'ws-beta')
  store.setConversationOrigin(c2.id, 'workbuddyMp')

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

  // ev：表达式求值；run：语句块（IIFE 包裹，避免全局 const 重复声明）
  const ev = (code) => win.webContents.executeJavaScript(`(${code})`, true)
  const run = (code) => win.webContents.executeJavaScript(`(() => { ${code} })()`, true)

  console.log('\n[第十轮 运行时冒烟]')

  // ---------- 1. 基础挂载 ----------
  ok('应用已挂载（app + sidebar）', (await ev(`!!document.querySelector('.app') && !!document.querySelector('.sidebar')`)) === true)

  // ---------- 2. 状态角标 ----------
  const flags = await ev(`Array.from(document.querySelectorAll('.status-flag')).map(e => e.className)`)
  ok('渲染出状态角标', Array.isArray(flags) && flags.length >= 2, flags)
  ok('含 working 角标', flags.some((c) => c.includes('flag-working')), flags)
  ok('含 unread 角标', flags.some((c) => c.includes('flag-unread')), flags)

  // ---------- 3. 工作空间分组 ----------
  const groups = await ev(`Array.from(document.querySelectorAll('.ws-group-name')).map(e => e.textContent)`)
  ok('渲染出工作空间分组', Array.isArray(groups) && groups.length >= 2, groups)
  ok('含 ws-alpha 分组', groups.includes('ws-alpha'), groups)
  ok('含 ws-beta 分组', groups.includes('ws-beta'), groups)
  const counts = await ev(`Array.from(document.querySelectorAll('.ws-group-count')).map(e => e.textContent)`)
  ok('分组带数量徽标（均为纯数字）', counts.length >= 2 && counts.every((c) => /^\d+$/.test(c)), counts)

  // ---------- 4. 分组工具栏 ----------
  ok('分组工具栏含筛选下拉', (await ev(`!!document.querySelector('.section-toolbar .filter-select')`)) === true)
  const filterOpts = await ev(`Array.from(document.querySelectorAll('.filter-select option')).map(o => o.value)`)
  ok('筛选项覆盖 all + 四状态', ['all', 'working', 'pending', 'failed', 'unread'].every((v) => filterOpts.includes(v)), filterOpts)
  ok('分组工具栏含折叠/展开按钮', (await ev(`document.querySelectorAll('.section-toolbar .link-btn').length >= 2`)) === true)

  // 筛选 working：只剩 1 项
  await run(`
    const sel = document.querySelector('.filter-select');
    sel.value = 'working';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true
  `)
  await sleep(300)
  ok('按 working 筛选后仅剩 1 项', (await ev(`document.querySelectorAll('.conversation-item').length`)) === 1)

  // 筛选 failed：空态
  await run(`
    const sel = document.querySelector('.filter-select');
    sel.value = 'failed';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true
  `)
  await sleep(300)
  ok('筛选无结果显示 noFilterResult 文案', (await ev(`document.body.innerText.includes('没有匹配的任务')`)) === true)

  // 复位
  await run(`
    const sel = document.querySelector('.filter-select');
    sel.value = 'all';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true
  `)
  await sleep(300)

  // ---------- 5. 折叠 / 展开 ----------
  const beforeCollapse = await ev(`document.querySelectorAll('.conversation-item').length`)
  await run(`
    const btn = Array.from(document.querySelectorAll('.section-toolbar .link-btn'))
      .find(b => (b.getAttribute('title') || '').includes('折叠'));
    if (btn) btn.click();
    return true
  `)
  await sleep(300)
  const afterCollapse = await ev(`document.querySelectorAll('.conversation-item').length`)
  ok('折叠所有后列表项减少', afterCollapse < beforeCollapse, { beforeCollapse, afterCollapse })
  await run(`
    const btn = Array.from(document.querySelectorAll('.section-toolbar .link-btn'))
      .find(b => (b.getAttribute('title') || '').includes('展开'));
    if (btn) btn.click();
    return true
  `)
  await sleep(300)
  const afterExpand = await ev(`document.querySelectorAll('.conversation-item').length`)
  ok('展开所有后列表项恢复', afterExpand === beforeCollapse, { afterExpand, beforeCollapse })

  // ---------- 6. 来源徽标 ----------
  const origins = await ev(`Array.from(document.querySelectorAll('.origin-badge')).map(e => e.getAttribute('title'))`)
  ok('渲染出来源徽标（小程序）', origins.includes('小程序'), origins)

  // ---------- 7. 任务搜索覆盖层 ----------
  await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })); return true`)
  await sleep(450)
  ok('⌘K 打开任务搜索覆盖层', (await ev(`!!document.querySelector('.overlay-mask .task-search')`)) === true)
  ok('无查询时标题为「最近任务」', (await ev(`document.querySelector('.task-search-count')?.textContent || ''`)) === '最近任务')
  const items = await ev(`Array.from(document.querySelectorAll('.task-search-item .task-search-title')).map(e => e.textContent)`)
  ok('最近任务列出预置会话', items.includes('跑批任务') && items.includes('小程序需求'), items)
  ok('覆盖层显示来源徽标', (await ev(`document.querySelector('.task-search-origin')?.textContent || ''`)) === '小程序')

  // 输入过滤
  await run(`
    const inp = document.querySelector('.task-search-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '跑批');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true
  `)
  await sleep(350)
  const filtered = await ev(`Array.from(document.querySelectorAll('.task-search-item .task-search-title')).map(e => e.textContent)`)
  ok('输入「跑批」后仅剩匹配项', filtered.length === 1 && filtered[0] === '跑批任务', filtered)
  ok('结果数为「搜索到 1 个任务」', (await ev(`document.querySelector('.task-search-count')?.textContent || ''`)) === '搜索到 1 个任务')

  // Esc 关闭
  await run(`document.querySelector('.task-search-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true`)
  await sleep(300)
  ok('Esc 关闭覆盖层', (await ev(`!document.querySelector('.overlay-mask')`)) === true)

  // ---------- 8. 键盘导航 + Enter ----------
  await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })); return true`)
  await sleep(400)
  await run(`document.querySelector('.task-search-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); return true`)
  await sleep(250)
  const activeIdx = await ev(`Array.from(document.querySelectorAll('.task-search-item')).findIndex(e => e.classList.contains('active'))`)
  ok('↓ 键移动高亮到第 2 项', activeIdx === 1, activeIdx)
  await run(`document.querySelector('.task-search-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true`)
  await sleep(600)
  ok('Enter 选中并关闭覆盖层', (await ev(`!document.querySelector('.overlay-mask')`)) === true)

  // ---------- 9. 新建工作空间弹窗（真实落盘） ----------
  const root = store.getSettings().workspacePath
  const wsName = 'smoke-r10-ws'
  const wsPath = path.join(root, wsName)
  try { fs.rmSync(wsPath, { recursive: true, force: true }) } catch { /* ignore */ }
  await run(`
    const btns = Array.from(document.querySelectorAll('.section-toolbar .link-btn'));
    const add = btns.find(b => b.textContent.includes('新建工作空间'));
    if (add) add.click();
    return true
  `)
  await sleep(400)
  ok('打开新建工作空间弹窗', (await ev(`!!document.querySelector('.ws-create-input')`)) === true)
  await run(`
    const inp = document.querySelector('.ws-create-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '${wsName}');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true
  `)
  await sleep(250)
  await run(`
    const btns = Array.from(document.querySelectorAll('.modal.dialog .dialog-actions .btn'));
    const confirm = btns.find(b => b.textContent.includes('确认'));
    if (confirm) confirm.click();
    return true
  `)
  await sleep(700)
  ok('弹窗已关闭', (await ev(`!document.querySelector('.ws-create-input')`)) === true)
  ok('磁盘上真实创建工作空间目录', fs.existsSync(wsPath) && fs.statSync(wsPath).isDirectory(), wsPath)

  // ---------- 10. 运行中任务查询 IPC ----------
  const running = await ev(`window.workbuddy.runningTasks()`)
  ok('runningTasks() 返回数组', Array.isArray(running), running)
  ok('空闲时无运行中任务', running.length === 0, running)

  // ---------- 11. 真实对话：working 角标流转 ----------
  await run(`
    const sel = document.querySelector('.filter-select');
    if (sel) { sel.value = 'all'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    return true
  `)
  await sleep(250)
  await run(`document.querySelector('.conversation-item')?.click(); return true`)
  await sleep(700)
  const sent = await win.webContents.executeJavaScript(`(() => {
    const ta = document.querySelector('.composer textarea') || document.querySelector('.composer input');
    if (!ta) return false;
    const proto = ta.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(ta, '冒烟测试消息');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = document.querySelector('.composer .send-btn') || document.querySelector('.composer button[type=submit]');
    if (btn) { btn.click(); return true; }
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()`, true)
  ok('输入区可用并发起发送', sent === true)
  await sleep(3000)
  ok('收到模型流式回复 R10-OK', (await ev(`document.body.innerText.includes('R10-OK')`)) === true)
  const running2 = await ev(`window.workbuddy.runningTasks()`)
  ok('对话结束后无运行中任务', Array.isArray(running2) && running2.length === 0, running2)

  console.log(`\n结果：${pass}/${pass + fail} 通过`)
  console.log(`渲染层控制台报错：${consoleErrors.length}`)
  consoleErrors.slice(0, 8).forEach((e) => console.log('  ERR: ' + e))

  try { fs.rmSync(wsPath, { recursive: true, force: true }) } catch { /* ignore */ }
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
}, 90000)
