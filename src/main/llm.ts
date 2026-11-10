import type { AppSettings, StreamChunk, StreamRequest } from '../shared/types'

/**
 * OpenAI 兼容的流式客户端 —— 对齐 WorkBuddy 主进程发 LLM 请求的模式：
 * 请求在主进程发起（不经过渲染层，key 不暴露给渲染层），SSE 增量经 IPC 推送给渲染层。
 */

interface OpenAIMessage {
  role: string
  content: string
}

export async function streamChat(
  req: StreamRequest,
  onChunk: (chunk: StreamChunk) => void,
  signal: AbortSignal
): Promise<void> {
  const { baseUrl, model, temperature, apiKey } = req.settings
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions'

  const body = {
    model,
    temperature,
    stream: true,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content }) as OpenAIMessage)
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
