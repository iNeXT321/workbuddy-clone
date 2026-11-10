import type {
  AppSettings,
  StreamChunk,
  StreamRequest,
  WorkMode,
  ErrorKind,
  StopReason,
  ChatMessage
} from '../shared/types'

/**
 * OpenAI 兼容的流式客户端 —— 对齐 WorkBuddy 主进程发 LLM 请求的模式：
 * 请求在主进程发起（不经过渲染层，key 不暴露给渲染层），SSE 增量经 IPC 推送给渲染层。
 */

// 错误分类 —— 对齐原版 error.* / errorBanner.* 的分类维度
export interface ClassifiedError {
  kind: ErrorKind
  message: string
  hint: string
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
    return { kind: 'network', message: raw, hint: 'network' }
  }
  // 超时
  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('aborted')) {
    return { kind: 'timeout', message: raw, hint: 'timeout' }
  }

  // 解析 HTTP 状态码（形如「请求失败 (401): ...」）
  const m = raw.match(/\((\d{3})\)/)
  const status = m ? Number(m[1]) : 0
  if (status === 401 || status === 403) return { kind: 'auth', message: raw, hint: 'auth' }
  if (status === 429) return { kind: 'rateLimit', message: raw, hint: 'rateLimit' }
  if (status === 503 || lower.includes('overload') || lower.includes('capacity')) {
    return { kind: 'modelOverload', message: raw, hint: 'modelOverload' }
  }
  if (status >= 500) return { kind: 'server', message: raw, hint: 'server' }
  if (status >= 400) return { kind: 'unknown', message: raw, hint: 'unknown' }
  return { kind: 'unknown', message: raw, hint: 'unknown' }
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
    | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
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

export async function streamChat(
  req: StreamRequest,
  onChunk: (chunk: StreamChunk) => void,
  signal: AbortSignal
): Promise<void> {
  const { baseUrl, model, temperature, apiKey } = req.settings
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions'

  // 阶段：准备中（对齐 progress.phase.preparing）
  onChunk({ type: 'phase', phase: 'preparing' })

  // 按工作模式注入 system 提示（计划 / 仅问答），默认模式不注入
  const sysMsg = modeSystemMessage(req.mode ?? req.settings.mode)
  // 斜杠指令：作为可读前缀注入，提示模型按该指令语义处理（对齐「/ 调用技能与指令」）
  const slash = req.slashCommand ? { role: 'system' as const, content: `用户使用了斜杠指令「/${req.slashCommand}」，请按该指令的语义处理本次请求。` } : null
  const head: OpenAIMessage[] = []
  if (sysMsg) head.push(sysMsg)
  if (slash) head.push(slash)
  const messages: OpenAIMessage[] = head.length
    ? [...head, ...req.messages.map(toOpenAIMessage)]
    : req.messages.map(toOpenAIMessage)

  const body = {
    model,
    temperature,
    stream: true,
    messages
  }

  // 阶段：等待模型响应（对齐 progress.phase.model_requesting）
  onChunk({ type: 'phase', phase: 'model_requesting' })

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
  let stopReason: StopReason | undefined
  // SSE 中流式返回的 finish_reason（OpenAI 兼容实现一般在最后一个 delta 里携带）
  let finishReason: string | undefined

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // 按行切分 SSE
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          onChunk({ type: 'done', stopReason })
          return
        }
        try {
          const json = JSON.parse(payload)
          const choice = json.choices?.[0]
          // 捕获 finish_reason（部分实现放在最后一个 chunk，delta 为空）
          if (choice?.finish_reason) finishReason = choice.finish_reason
          const delta = choice?.delta?.content
          if (delta) {
            if (!streaming) {
              streaming = true
              onChunk({ type: 'phase', phase: 'model_streaming' })
            }
            onChunk({ type: 'delta', content: delta })
          }
        } catch {
          // 忽略无法解析的分片
        }
      }
    }

    // 流自然结束：先解析 finish_reason（length→截断 / content_filter→拒绝）
    stopReason = mapStopReason(finishReason)
    // 阶段：处理结果中（对齐 progress.phase.model_done）
    onChunk({ type: 'phase', phase: 'model_done' })
    onChunk({ type: 'done', stopReason })
  } finally {
    reader.releaseLock()
  }
}
