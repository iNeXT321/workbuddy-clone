import type { AppSettings, StreamChunk, StreamRequest, WorkMode, ErrorKind } from '../shared/types'

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

  // 按工作模式注入 system 提示（计划 / 仅问答），默认模式不注入
  const sysMsg = modeSystemMessage(req.mode ?? req.settings.mode)
  const messages: OpenAIMessage[] = sysMsg
    ? [sysMsg, ...req.messages.map(toOpenAIMessage)]
    : req.messages.map(toOpenAIMessage)

  const body = {
    model,
    temperature,
    stream: true,
    messages
  }

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
          onChunk({ type: 'done' })
          return
        }
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) {
            onChunk({ type: 'delta', content: delta })
          }
        } catch {
          // 忽略无法解析的分片
        }
      }
    }

    onChunk({ type: 'done' })
  } finally {
    reader.releaseLock()
  }
}
