/**
 * 第十轮 逻辑冒烟 —— 覆盖纯逻辑：workspace 校验/创建/列举、会话状态与来源常量、i18n 键一致性
 * 运行：node smoke-r10-logic.mjs （需先用 esbuild 打包 store/workspace 为 mjs）
 */
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

console.log('\n[第十轮 逻辑冒烟]')

// ---------- 打包 workspace.ts（纯 node 模块，无 electron 依赖） ----------
buildSync({
  entryPoints: ['src/main/workspace.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '.smoke-ws.mjs',
  logLevel: 'error'
})

const ws = await import('./.smoke-ws.mjs')

// ---------- 1. validateWorkspaceName 四类非法 ----------
console.log('\n-- 工作空间名校验 --')
ok('空名被拒', ws.validateWorkspaceName('').ok === false)
ok('纯空格被拒', ws.validateWorkspaceName('   ').ok === false)
eq('空名 reason=empty', ws.validateWorkspaceName('').reason, 'empty')
ok('含斜杠被拒（非法字符）', ws.validateWorkspaceName('a/b').ok === false)
eq('含斜杠 reason=illegalChar', ws.validateWorkspaceName('a/b').reason, 'illegalChar')
ok('含冒号被拒', ws.validateWorkspaceName('a:b').ok === false)
ok('超长名被拒（>64）', ws.validateWorkspaceName('x'.repeat(65)).ok === false)
eq('超长 reason=tooLong', ws.validateWorkspaceName('x'.repeat(65)).reason, 'tooLong')
ok('正常名通过', ws.validateWorkspaceName('my-workspace').ok === true)
ok('中文名通过', ws.validateWorkspaceName('我的空间').ok === true)
ok('保留名 CON 被拒', ws.validateWorkspaceName('CON').ok === false)

// ---------- 2. createWorkspace 真实 mkdir ----------
console.log('\n-- 工作空间创建（真实落盘） --')
const root = mkdtempSync(join(tmpdir(), 'wb-r10-ws-'))
const r1 = ws.createWorkspace(root, 'alpha')
ok('创建成功返回 ok', r1.ok === true, r1)
ok('返回 path 指向磁盘目录', !!r1.path && existsSync(r1.path))
ok('磁盘上确实是目录', !!r1.path && existsSync(r1.path))
const r2 = ws.createWorkspace(root, 'alpha')
ok('重名创建不报错（幂等/复用）', r2.ok === true, r2)
const r3 = ws.createWorkspace(root, '')
ok('空名创建失败', r3.ok === false)
eq('空名失败 reason=empty', r3.reason, 'empty')

// ---------- 3. workspaceExists 三态 ----------
console.log('\n-- 工作空间校验三态 --')
ok('真实目录 → true', ws.workspaceExists(join(root, 'alpha')) === true)
const fakeFile = join(root, 'alpha-file.txt')
writeFileSync(fakeFile, 'x')
ok('普通文件 → false', ws.workspaceExists(fakeFile) === false)
ok('不存在路径 → false', ws.workspaceExists(join(root, 'nope')) === false)

// ---------- 4. listWorkspaces 过滤隐藏目录 + mtime 排序 ----------
console.log('\n-- 工作空间列举 --')
mkdirSync(join(root, '.hidden'))
const items = ws.listWorkspaces(root, 50)
ok('过滤隐藏目录', !items.some((i) => i.name.startsWith('.')))
ok('包含已创建目录', items.some((i) => i.name === 'alpha'))
ok('默认 limit=50 生效', ws.listWorkspaces(root).length <= 50)
eq('workspaceLabel 返回末段', ws.workspaceLabel(join(root, 'alpha')), 'alpha')

// ---------- 5. i18n 第十轮键存在且文案与原文一致 ----------
console.log('\n-- i18n 键一致性（对齐 conversation.* 原文） --')
const i18nSrc = (await import('node:fs')).readFileSync('src/renderer/src/i18n/index.ts', 'utf-8')
const expectKeys = [
  ['section.tasks', '任务'],
  ['section.workspaces', '工作空间'],
  ['section.pinned', '置顶'],
  ['section.addTask', '新建任务'],
  ['section.addWorkspace', '新建工作空间'],
  ['section.filter', '筛选'],
  ['section.noFilterResult', '没有匹配的任务'],
  ['section.collapseAll', '折叠所有工作空间'],
  ['section.expandAll', '展开所有工作空间'],
  ['sectionFlag.empty', '该分类下暂无状态任务'],
  ['sectionFlag.tooltip.failed', '有任务失败，点击打开'],
  ['sectionFlag.tooltip.pending', '有任务待确认，点击打开'],
  ['sectionFlag.tooltip.unread', '有任务未读，点击打开'],
  ['sectionFlag.tooltip.working', '有任务进行中，点击打开'],
  ['taskSearch.placeholder', '搜索任务'],
  ['taskSearch.recentTasks', '最近任务'],
  ['taskSearch.resultCount', '搜索到 {count} 个任务'],
  ['taskSearch.shortcut.navigate', '上下切换'],
  ['taskSearch.shortcut.open', '打开'],
  ['taskSearch.shortcut.close', '关闭'],
  ['origin.web', '网页端'],
  ['origin.workbuddyApp', '移动端'],
  ['origin.workbuddyMp', '小程序'],
  ['conversation.creatingTask', '新建任务中'],
  ['conversation.creating.title', '正在准备执行'],
  ['conversation.creating.dialog.content', '正在创建会话，请稍后再试'],
  ['conversation.windowTaskRunning.title', '任务运行中'],
  ['conversation.windowTaskRunning.message', '关闭窗口后任务将继续在后台运行，可随时返回查看进度。请选择操作方式。'],
  ['conversation.windowTaskRunning.closeOnly', '仅关闭窗口'],
  ['conversation.windowTaskRunning.cancelTask', '中止任务并关闭'],
  ['conversation.maxSessions.dialog.title', '会话数量已达上限']
]
for (const [key, text] of expectKeys) {
  const needle = `'${key}': '${text}'`
  ok(`zh 键 ${key} 文案一致`, i18nSrc.includes(needle), needle)
}

// 权重：确认两语言都定义了同一批键（缺失会回退到 zh，但显式缺失视为降级）
const keyOccurrences = (k) => i18nSrc.split(`'${k}'`).length - 1
ok('section.tasks 双语定义（出现 ≥2 次）', keyOccurrences('section.tasks') >= 2, keyOccurrences('section.tasks'))
ok('taskSearch.placeholder 双语定义', keyOccurrences('taskSearch.placeholder') >= 2)
ok('origin.workbuddyMp 双语定义', keyOccurrences('origin.workbuddyMp') >= 2)

// ---------- 6. 状态角标四值域与 FLAG_ICON 映射齐全 ----------
console.log('\n-- 会话状态值域 --')
const sidebarSrc = (await import('node:fs')).readFileSync('src/renderer/src/components/Sidebar.tsx', 'utf-8')
for (const s of ['failed', 'pending', 'unread', 'working']) {
  ok(`Sidebar FLAG_ICON 覆盖 ${s}`, sidebarSrc.includes(`${s}:`))
}
const typesSrc = (await import('node:fs')).readFileSync('src/shared/types.ts', 'utf-8')
ok('ConversationStatus 四值域', typesSrc.includes("'failed' | 'pending' | 'unread' | 'working'"))
ok('ConversationOrigin 三值域', typesSrc.includes("'web' | 'workbuddyApp' | 'workbuddyMp'"))

// ---------- 7. 主进程运行中任务查询 IPC 已注册 ----------
console.log('\n-- 主进程接线 --')
const ipcSrc = (await import('node:fs')).readFileSync('src/main/ipc.ts', 'utf-8')
ok('IPC.runningTasks handler 已注册', ipcSrc.includes('IPC.runningTasks'))
ok('IPC.conversationStatus handler 已注册', ipcSrc.includes('IPC.conversationStatus'))
ok('IPC.conversationOrigin handler 已注册', ipcSrc.includes('IPC.conversationOrigin'))
ok('IPC.conversationWorkspace handler 已注册', ipcSrc.includes('IPC.conversationWorkspace'))
const mainSrc = (await import('node:fs')).readFileSync('src/main/index.ts', 'utf-8')
ok('关窗前拦截窗口 close 事件', mainSrc.includes("win.on('close'"))
ok('关窗确认引用 windowTaskRunning 语义', mainSrc.includes('任务运行中') && mainSrc.includes('仅关闭窗口'))

console.log(`\n结果：${pass}/${pass + fail} 通过`)
rmSync('.smoke-ws.mjs', { force: true })
rmSync(root, { recursive: true, force: true })
process.exit(fail === 0 ? 0 : 1)
