import type {
  AppSettings,
  StreamChunk,
  StreamRequest,
  WorkMode,
  ErrorKind,
  StopReason,
  ChatMessage,
  ToolCall,
  UserQuestion,
  QuestionAnswer,
  ApprovalDecision
} from '../shared/types'
import { errorCodeForKind } from '../shared/errorCodes'
import {
  TOOL_DEFS,
  TOOL_CANONICAL,
  toolNeedsApproval,
  isAskUserQuestion,
  parseQuestion,
  executeTool
} from './tools'

/**
 * OpenAI 兼容的流式客户端 —— 对齐 WorkBuddy 主进程发 LLM 请求的模式：
 * 请求在主进程发起（不经过渲染层，key 不暴露给渲染层），SSE 增量经 IPC 推送给渲染层。
 */

// 错误分类 —— 对齐原版 error.* / errorBanner.* 的分类维度
export interface ClassifiedError {
  kind: ErrorKind
  message: string
  hint: string
  // 结构化错误码（对齐原版 errorCode.*）
  code: string
}

// 按错误特征归类（HTTP 状态码 + 网络异常 + 关键词）
export function classifyError(err: unknown): ClassifiedError {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()

  // 网络层异常（fetch 失败 / DNS / 连接拒绝）
  if (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('network') ||
    lower.includes('socket hang up')
  ) {
    return { kind: 'network', message: raw, hint: 'network', code: '3002' }
  }
  // 超时
  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('aborted')) {
    return { kind: 'timeout', message: raw, hint: 'timeout', code: '3003' }
  }

  // 解析 HTTP 状态码（形如「请求失败 (401): ...」）
  const m = raw.match(/\((\d{3})\)/)
  const status = m ? Number(m[1]) : 0
  if (status === 401 || status === 403) return { kind: 'auth', message: raw, hint: 'auth', code: '401' }
  if (status === 429) return { kind: 'rateLimit', message: raw, hint: 'rateLimit', code: '429' }
  if (status === 503 || lower.includes('overload') || lower.includes('capacity')) {
    return { kind: 'modelOverload', message: raw, hint: 'modelOverload', code: '14003' }
  }
  if (status >= 500) return { kind: 'server', message: raw, hint: 'server', code: '502' }
  if (status === 404) return { kind: 'unknown', message: raw, hint: 'unknown', code: '404' }
  if (status === 400) return { kind: 'unknown', message: raw, hint: 'unknown', code: '400' }
  if (status >= 400) return { kind: 'unknown', message: raw, hint: 'unknown', code: '3005' }
  return { kind: 'unknown', message: raw, hint: 'unknown', code: 'generic' }
}

// 工作模式对应的系统提示 —— 文案对齐原版 input.wbAdd.mode.description.*
const MODE_SYSTEM_PROMPT: Record<WorkMode, string> = {
  default: '',
  plan: '当前为计划模式。请先规划任务步骤并输出计划，等待用户确认后再执行。不要直接开始执行任何操作。',
  ask: '当前为问答模式。只回答问题、提供思路，不要执行任何操作或调用工具。'
}

// 按模式拼装系统消息（默认模式不加约束）
function modeSystemMessage(mode: WorkMode | undefined): { role: 'system'; content: string } | null {
  const prompt = mode ? MODE_SYSTEM_PROMPT[mode] : ''
  return prompt ? { role: 'system', content: prompt } : null
}

/**
 * 把 OpenAI 的 finish_reason 映射为原版 error.stopReason.* 的停止原因。
 * 对齐关系：length → maxTokens（响应被截断）、content_filter → refusal（内容策略）、
 * stop → 正常（不报 stopReason）；异常枚举归入 generic/unknown。
 */
export function mapStopReason(finishReason: string | undefined | null): StopReason | undefined {
  if (!finishReason) return undefined
  switch (finishReason) {
    case 'length':
      return 'maxTokens'
    case 'content_filter':
      return 'refusal'
    case 'stop':
    case 'tool_calls':
    case 'function_call':
      return undefined
    default:
      return 'unknown'
  }
}

// 斜杠指令（对齐原版「/ 调用技能与指令」）：把 /cmd 前缀从正文中剥离，只留指令名
export function parseSlashCommand(text: string): { command?: string; rest: string } {
  const m = text.match(/^\/([a-zA-Z0-9_-]+)\s*([\s\S]*)$/)
  if (!m) return { rest: text }
  return { command: m[1], rest: m[2] ?? '' }
}

interface OpenAIMessage {
  role: string
  content:
    | string
    | null
    | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
  // assistant 发起的工具调用
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  // 工具结果消息
  tool_call_id?: string
}

// 把带附件的消息转为 OpenAI 多模态 content 数组（对齐原版图片输入能力）
function toOpenAIMessage(m: StreamRequest['messages'][number]): OpenAIMessage {
  if (!m.attachments || m.attachments.length === 0) {
    return { role: m.role, content: m.content }
  }
  const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []
  if (m.content) parts.push({ type: 'text', text: m.content })
  for (const a of m.attachments) {
    parts.push({ type: 'image_url', image_url: { url: a.dataUrl } })
  }
  return { role: m.role, content: parts }
}

/**
 * 交互回调 —— 由 ipc 层注入，用于把「审批 / 向用户提问」挂起请求抛给渲染层，
 * 并 await 用户回执。完全访问（fullAccess）下审批回调不会被调用。
 */
export interface InteractiveHooks {
  requestApproval: (
    toolName: string,
    id: string
  ) => Promise<ApprovalDecision>
  requestQuestion: (
    question: Omit<UserQuestion, 'id'>,
    id: string
  ) => Promise<QuestionAnswer>
}

/** 单次模型请求返回：文本增量 + 工具调用累积 + 是否异常结束 */
interface TurnResult {
  toolCalls: ToolCall[]
  stopReason: StopReason | undefined
  aborted: boolean
}

/**
 * 发起一轮模型请求（流式），把文本增量经 onChunk 抛出，返回本轮的 finish_reason 与工具调用。
 * 工具调用按 index 累积（OpenAI 兼容实现的 delta.tool_calls 是分片下发的）。
 */
async function requestOnce(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  onChunk: (chunk: StreamChunk) => void,
  signal: AbortSignal
): Promise<TurnResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`请求失败 (${res.status}): ${text.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // 首片到达前处于「等待模型响应」，首片后切到「生成回复中」（对齐 progress.phase.model_streaming）
  let streaming = false
  let finishReason: string | undefined
  // 工具调用累积：index → { id, name, args }
  const acc = new Map<number, ToolCall>()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          return { toolCalls: [...acc.values()], stopReason: mapStopReason(finishReason), aborted: false }
        }
        try {
          const json = JSON.parse(payload)
          const choice = json.choices?.[0]
          if (choice?.finish_reason) finishReason = choice.finish_reason
          const delta = choice?.delta?.content
          if (delta) {
            if (!streaming) {
              streaming = true
              onChunk({ type: 'phase', phase: 'model_streaming' })
            }
            onChunk({ type: 'delta', content: delta })
          }
          // 工具调用分片：按 index 累积 id / name / arguments
          const tcs = choice?.delta?.tool_calls
          if (Array.isArray(tcs)) {
            for (const tc of tcs) {
              const idx = typeof tc.index === 'number' ? tc.index : 0
              const cur = acc.get(idx) ?? { id: '', name: '', args: '' }
              if (tc.id) cur.id = tc.id
              if (tc.function?.name) cur.name = tc.function.name
              if (tc.function?.arguments) cur.args += tc.function.arguments
              acc.set(idx, cur)
            }
          }
        } catch {
          // 忽略无法解析的分片
        }
      }
    }

    return { toolCalls: [...acc.values()], stopReason: mapStopReason(finishReason), aborted: false }
  } finally {
    reader.releaseLock()
  }
}

const MAX_TURNS = 12

export async function streamChat(
  req: StreamRequest,
  onChunk: (chunk: StreamChunk) => void,
  signal: AbortSignal,
  hooks?: InteractiveHooks
): Promise<void> {
  const { baseUrl, model, temperature, apiKey } = req.settings
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions'

  // 阶段：准备中（对齐 progress.phase.preparing）
  onChunk({ type: 'phase', phase: 'preparing' })

  // 按工作模式注入 system 提示（计划 / 仅问答），默认模式不注入
  const mode = req.mode ?? req.settings.mode
  const sysMsg = modeSystemMessage(mode)
  // 斜杠指令：作为可读前缀注入，提示模型按该指令语义处理（对齐「/ 调用技能与指令」）
  const slash = req.slashCommand
    ? {
        role: 'system' as const,
        content: `用户使用了斜杠指令「/${req.slashCommand}」，请按该指令的语义处理本次请求。`
      }
    : null
  const head: OpenAIMessage[] = []
  if (sysMsg) head.push(sysMsg)
  if (slash) head.push(slash)

  const messages: OpenAIMessage[] = head.length
    ? [...head, ...req.messages.map(toOpenAIMessage)]
    : req.messages.map(toOpenAIMessage)

  // 工具挂载策略：仅问答模式不挂工具；完全访问时审批由 hooks 内部放行
  const useTools = mode !== 'ask' && !!hooks
  const tools = useTools ? TOOL_DEFS : undefined

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal.aborted) return

    // 阶段：等待模型响应（对齐 progress.phase.model_requesting）
    onChunk({ type: 'phase', phase: 'model_requesting' })

    const body: Record<string, unknown> = { model, temperature, stream: true, messages }
    if (tools) {
      body.tools = tools
      body.tool_choice = 'auto'
    }

    const result = await requestOnce(url, apiKey, body, onChunk, signal)

    // 无工具调用 → 本轮即最终回复。
    // 未声明工具时（仅问答模式）即使服务端回了 tool_calls 也不执行，避免越权调用。
    if (!result.toolCalls.length || !tools) {
      onChunk({ type: 'phase', phase: 'model_done' })
      onChunk({ type: 'done', stopReason: result.stopReason })
      return
    }

    // 回灌 assistant 的工具调用消息（保持上下文一致）
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.args }
      }))
    })

    // 逐个处理工具调用：审批 → （提问）→ 执行 → 结果回灌
    for (const tc of result.toolCalls) {
      if (signal.aborted) return
      const canonical = TOOL_CANONICAL[tc.name] ?? tc.name

      // 1) 需审批的工具：默认权限下先挂起等用户决定（对齐 tool.approval.*）
      if (toolNeedsApproval(tc.name) && hooks) {
        if (!req.fullAccess) {
          // 阶段：等待权限（对齐 progress.phase.waiting_for_permission）
          onChunk({ type: 'phase', phase: 'waiting_for_permission', phaseTool: canonical })
          const decision = await hooks.requestApproval(canonical, tc.id)
          if (decision === 'reject') {
            messages.push({
              role: 'tool',
              content: '用户拒绝了该操作，请不要再尝试调用此工具，改为说明情况或采用其他方案。',
              tool_call_id: tc.id
            })
            continue
          }
        }
      }

      // 2) 向用户提问：经交互通道拿到答案（对齐 tool.askUserQuestion.*）
      if (isAskUserQuestion(tc.name) && hooks) {
        // 阶段：等待用户回答（对齐 progress.phase.waiting_for_user）
        onChunk({ type: 'phase', phase: 'waiting_for_user', phaseTool: canonical })
        const answer = await hooks.requestQuestion(parseQuestion(tc.args), tc.id)
        const text = answer.skipped
          ? '用户跳过了此问题，请基于合理假设继续。'
          : `用户回答：${answer.answers.join('；')}`
        messages.push({ role: 'tool', content: text, tool_call_id: tc.id })
        continue
      }

      // 3) 一般工具：执行
      onChunk({ type: 'phase', phase: 'tool_executing', phaseTool: canonical })
      const exec = await executeTool(tc.name, tc.args)
      onChunk({
        type: 'tool-result',
        toolResult: { id: tc.id, name: canonical, ok: exec.ok, output: exec.output }
      })
      messages.push({ role: 'tool', content: exec.output, tool_call_id: tc.id })
    }
  }

  // 触顶最大轮次（对齐 error.stopReason.maxTurnRequests）
  onChunk({ type: 'phase', phase: 'model_done' })
  onChunk({ type: 'done', stopReason: 'maxTurnRequests' })
}
