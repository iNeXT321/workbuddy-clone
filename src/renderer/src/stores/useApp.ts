import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, Conversation, StreamChunk, ChatMessage } from '../../../shared/types'

/**
 * 应用级状态 —— 对齐 WorkBuddy 的 conversations / account 模块职责：
 * 会话列表、当前会话、设置、流式对话编排。
 */

export function useApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const currentIdRef = useRef<string | null>(null)

  const wb = window.workbuddy

  // 初始化：加载设置与会话列表
  useEffect(() => {
    wb.getSettings().then((s) => {
      setSettings(s)
      document.documentElement.dataset.theme = s.theme
    })
    wb.listConversations().then((list) => {
      setConversations(list)
      if (list.length > 0) {
        selectConversation(list[0].id)
      } else {
        newConversation()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 订阅流式事件
  useEffect(() => {
    const off = wb.onStream(({ conversationId, chunk }) => {
      if (currentIdRef.current !== conversationId) return
      applyChunk(chunk)
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyChunk(chunk: StreamChunk) {
    if (chunk.type === 'delta') {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant' && last.streaming) {
          next[next.length - 1] = { ...last, content: last.content + (chunk.content ?? '') }
        }
        return next
      })
    } else if (chunk.type === 'done') {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') {
          next[next.length - 1] = { ...last, streaming: false }
        }
        return next
      })
      setStreaming(false)
    } else if (chunk.type === 'error') {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant' && last.streaming) {
          next[next.length - 1] = { ...last, streaming: false, error: chunk.error, content: last.content || chunk.error || '' }
        }
        return next
      })
      setStreaming(false)
    }
  }

  const selectConversation = useCallback(async (id: string) => {
    currentIdRef.current = id
    setCurrentId(id)
    const conv = await wb.getConversation(id)
    if (conv) setMessages(conv.messages)
  }, [])

  const newConversation = useCallback(async () => {
    const conv = await wb.createConversation()
    setConversations((prev) => [conv, ...prev])
    currentIdRef.current = conv.id
    setCurrentId(conv.id)
    setMessages([])
    setStreaming(false)
  }, [])

  const removeConversation = useCallback(async (id: string) => {
    await wb.deleteConversation(id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (currentIdRef.current === id) {
      const rest = await wb.listConversations()
      setConversations(rest)
      if (rest.length > 0) selectConversation(rest[0].id)
      else newConversation()
    }
  }, [])

  const renameConversation = useCallback(async (id: string, title: string) => {
    await wb.renameConversation(id, title)
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!settings || !currentIdRef.current || streaming) return
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        createdAt: Date.now()
      }
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        streaming: true
      }
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setStreaming(true)

      // 更新会话标题（首次对话用首句截断）
      const conv = conversations.find((c) => c.id === currentIdRef.current)
      if (conv && (!conv.title || conv.title === '新对话')) {
        const t = text.slice(0, 20) + (text.length > 20 ? '…' : '')
        renameConversation(conv.id, t)
      }

      const history = useAppHistory(currentIdRef.current!, messages, userMsg)
      await wb.chatStream({
        conversationId: currentIdRef.current!,
        messages: history,
        settings
      })
    },
    [settings, conversations, streaming, messages]
  )

  const stopStreaming = useCallback(async () => {
    if (currentIdRef.current) await wb.chatAbort(currentIdRef.current)
    setStreaming(false)
  }, [])

  const saveSettings = useCallback(async (s: AppSettings) => {
    const saved = await wb.saveSettings(s)
    setSettings(saved)
    document.documentElement.dataset.theme = saved.theme
  }, [])

  return {
    settings,
    conversations,
    currentId,
    messages,
    streaming,
    selectConversation,
    newConversation,
    removeConversation,
    renameConversation,
    sendMessage,
    stopStreaming,
    saveSettings
  }
}

// 组装请求消息（当前会话历史 + 新用户消息，去掉流式标记）
function useAppHistory(
  conversationId: string,
  messages: ChatMessage[],
  userMsg: ChatMessage
): Array<Pick<ChatMessage, 'role' | 'content'>> {
  const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
  return history
}
