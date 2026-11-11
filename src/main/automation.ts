import { BrowserWindow } from 'electron'
import { IPC } from '../shared/types'
import type { Automation, AutomationRun, AutomationRunStatus, StreamChunk } from '../shared/types'
import { getStore } from './store'
import { streamChat, classifyError } from './llm'
import type { InteractiveHooks } from './llm'

/**
 * 定时任务调度器 —— 对齐原版 `automation.*` 的**本地调度**语义：
 * - 主进程内定时轮询（默认 30s 一次），命中 `next_run_at <= now` 且 enabled 的任务即触发；
 * - 触发时**真实新建会话并执行提示词**（与原版「定时任务产生一条会话」一致，对齐
 *   `automation.detail.retryConversation`=查看关联会话 / `records.column.name`=任务名称）；
 * - 运行结果落 `automation_runs`（status / reason / summary / evidence），并在列表刷新时推给渲染层；
 * - once 任务执行后自动停用（对齐 `row.onceOnly`=单次执行）；
 * - 无人在场，审批一律拒绝、提问一律跳过（安全默认），完全访问档位则内部放行。
 */

const TICK_MS = 30_000
/** 单次任务运行超时（对齐 detail.reason.runTimeout「任务运行超时已停止」） */
const RUN_TIMEOUT_MS = 10 * 60_000

let timer: NodeJS.Timeout | null = null
const runningIds = new Set<string>()

/** 把错误分类映射为原版 `automation.detail.reason.*` 分因码 */
export function reasonForError(err: unknown): string {
  const classified = classifyError(err)
  switch (classified.kind) {
    case 'network':
      return 'network'
    case 'timeout':
      return 'runTimeout'
    case 'auth':
      return 'auth'
    case 'rateLimit':
      return 'rateLimited'
    case 'server':
    case 'modelOverload':
      return 'modelConfigFailed'
    default:
      return 'failed'
  }
}

function notifyChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.automationChanged)
  }
}

/**
 * 无交互运行环境下的 hooks：
 * - 审批：默认权限下**拒绝**（无人确认，安全默认）；完全访问时调用方不会走到这儿；
 * - 提问：一律「跳过」，让模型按合理假设继续（对齐 skill 无人值守语义）。
 */
function headlessHooks(): InteractiveHooks {
  return {
    requestApproval: async () => 'reject',
    requestQuestion: async (question, id) => ({ id, answers: [], skipped: true })
  }
}

/** 执行一次定时任务：建会话 → 跑提示词 → 落运行记录 → 推进 nextRunAt */
export async function runAutomation(automation: Automation, opts: { test?: boolean } = {}): Promise<AutomationRun> {
  const store = getStore()
  const startedAt = Date.now()
  const runId = crypto.randomUUID()
  const run: AutomationRun = {
    id: runId,
    automationId: automation.id,
    taskName: automation.name,
    status: 'running',
    startedAt,
    test: !!opts.test
  }
  store.addAutomationRun(run)
  notifyChanged()

  // 任务正文：定时任务标识前置（对齐 form.autoTag=定时任务）
  const title = automation.name || '定时任务'
  const origin = 'workbuddyApp'
  const conv = store.createConversation(title, origin)
  run.conversationId = conv.id
  store.setConversationStatus(conv.id, 'working')
  if (automation.workspaces?.length) store.setConversationWorkspace(conv.id, automation.workspaces[0])

  const settings = { ...store.getSettings(), apiKey: store.getApiKey() || store.getSettings().apiKey }

  const abort = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    abort.abort()
  }, RUN_TIMEOUT_MS)

  let content = ''
  let errorChunk: { error: string; errorCode?: string; errorKind?: string } | null = null
  const toolNames: string[] = []

  const onChunk = (chunk: StreamChunk): void => {
    if (chunk.type === 'delta') content += chunk.content ?? ''
    else if (chunk.type === 'error') {
      errorChunk = { error: chunk.error ?? 'failed', errorCode: chunk.errorCode, errorKind: chunk.errorKind }
    } else if (chunk.type === 'tool-result' && chunk.toolResult) toolNames.push(chunk.toolResult.name)
  }

  store.appendMessage(conv.id, {
    id: crypto.randomUUID(),
    role: 'user',
    content: automation.prompt,
    createdAt: startedAt
  })

  let status: AutomationRunStatus = 'succeeded'
  let reason: string | undefined

  try {
    await streamChat(
      {
        conversationId: conv.id,
        messages: [{ role: 'user', content: automation.prompt }],
        settings,
        fullAccess: automation.permission === 'fullAccess',
        mode: 'default'
      },
      onChunk,
      abort.signal,
      headlessHooks()
    )
    if (content) {
      store.appendMessage(conv.id, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        createdAt: Date.now()
      })
    }
    if (timedOut) {
      status = 'failed'
      reason = 'runTimeout'
    } else if (errorChunk) {
      status = 'failed'
      reason = (errorChunk as { errorCode?: string }).errorCode === '3002' ? 'network' : 'failed'
      if (toolNames.length) {
        status = 'interrupted'
        reason = 'partialDelivered'
      }
    } else if (!content.trim()) {
      // 对齐 detail.reason.emptyResult「任务已结束，但未生成可展示的内容」
      status = 'failed'
      reason = 'emptyResult'
    }
  } catch (err) {
    if (timedOut) {
      status = 'failed'
      reason = 'runTimeout'
    } else {
      status = 'failed'
      reason = reasonForError(err)
    }
  } finally {
    clearTimeout(timeout)
  }

  const finishedAt = Date.now()
  const evidence = {
    assistantOutput: !!content.trim(),
    artifact: false,
    externalAction: toolNames.length > 0,
    localFileMutation: toolNames.some((n) => /write|edit|create|delete|move|rename/i.test(n))
  }

  const finalRun: AutomationRun = {
    ...run,
    status,
    reason,
    finishedAt,
    summary: content.trim() ? content.trim().slice(0, 400) : undefined,
    evidence,
    error: errorChunk ? (errorChunk as { error: string }).error : undefined
  }
  store.addAutomationRun(finalRun)
  store.setConversationStatus(conv.id, status === 'succeeded' ? undefined : 'failed')
  if (!opts.test) store.markAutomationRun(automation.id, startedAt)
  notifyChanged()
  return finalRun
}

/** 轮询一次：执行所有到点任务（去重防重入） */
export async function tick(now: number = Date.now()): Promise<AutomationRun[]> {
  const store = getStore()
  const due = store.dueAutomations(now)
  const results: AutomationRun[] = []
  for (const a of due) {
    if (runningIds.has(a.id)) continue
    runningIds.add(a.id)
    try {
      results.push(await runAutomation(a))
    } catch {
      // 单任务失败不阻断其余任务
      store.setAutomationEnabled(a.id, false)
    } finally {
      runningIds.delete(a.id)
    }
  }
  return results
}

/** 启动调度器 —— 应用就绪后调用一次 */
export function startScheduler(): void {
  if (timer) return
  timer = setInterval(() => {
    void tick()
  }, TICK_MS)
  // 不阻止进程退出
  timer.unref?.()
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  runningIds.clear()
}

export function isSchedulerRunning(): boolean {
  return timer !== null
}

export function runningAutomationIds(): string[] {
  return [...runningIds]
}
