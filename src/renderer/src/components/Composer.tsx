import { useState } from 'react'

interface Props {
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
}

export default function Composer({ streaming, onSend, onStop }: Props) {
  const [text, setText] = useState('')

  const submit = () => {
    const t = text.trim()
    if (!t || streaming) return
    onSend(t)
    setText('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer">
      <textarea
        className="composer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        rows={3}
      />
      <div className="composer-actions">
        {streaming ? (
          <button className="btn stop" onClick={onStop}>
            停止
          </button>
        ) : (
          <button className="btn send" onClick={submit} disabled={!text.trim()}>
            发送
          </button>
        )}
      </div>
    </div>
  )
}
