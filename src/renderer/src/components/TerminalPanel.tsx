import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useTranslation } from '../i18n'

/**
 * 内置终端 —— 对齐 WorkBuddy 本体的 node-pty 终端：
 * 用 xterm.js 渲染，经 preload 桥接与主进程 PTY 会话通信。
 */

interface Props {
  conversationId: string
  onClose: () => void
}

export default function TerminalPanel({ conversationId, onClose }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    const wb = window.workbuddy
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term

    // 打开 PTY 会话
    wb.termOpen(conversationId).then((r) => {
      setStatus(r.ok ? `shell: ${r.shell ?? 'unknown'}` : t('terminal.failed'))
    })

    // 终端数据 → 渲染
    const offData = wb.onTermData(({ conversationId: cid, data }) => {
      if (cid === conversationId) term.write(data)
    })

    // 退出事件
    const offExit = wb.onTermExit(({ conversationId: cid, exitCode }) => {
      if (cid === conversationId) {
        term.write(`\r\n[${t('terminal.exit')} ${exitCode}]\r\n`)
      }
    })

    // 输入 → PTY
    const onData = term.onData((data) => {
      wb.termWrite(conversationId, data)
    })

    // 尺寸自适应
    const onResize = () => {
      fit.fit()
      wb.termResize(conversationId, term.cols, term.rows)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      onData.dispose()
      offData()
      offExit()
      wb.termClose(conversationId)
      term.dispose()
      termRef.current = null
    }
  }, [conversationId])

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span>{t('terminal.title')}</span>
        <span className="terminal-status">{status}</span>
        <button className="icon-btn" onClick={onClose} title={t('chat.cancel')}>
          ×
        </button>
      </div>
      <div className="terminal-body" ref={containerRef} />
    </div>
  )
}
