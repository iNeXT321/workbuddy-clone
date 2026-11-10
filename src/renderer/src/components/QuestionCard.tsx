import { useState } from 'react'
import type { UserQuestion } from '../../../shared/types'

interface Props {
  question: UserQuestion
  disabled?: boolean
  onAnswer: (answers: string[]) => void
  onSkip: () => void
}

/**
 * 向用户提问卡片 —— 对齐原版 `tool.askUserQuestion.*`：
 * title=向用户提问、waiting=等待您的回答...、skipped=您跳过了此问题。
 * 有选项时渲染可选项（支持多选），无选项时给自由输入。
 */
export default function QuestionCard({ question, disabled, onAnswer, onSkip }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [freeText, setFreeText] = useState('')
  const [answered, setAnswered] = useState(false)

  const toggle = (label: string) => {
    if (question.multiSelect) {
      setSelected((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]))
    } else {
      setSelected([label])
    }
  }

  const submit = () => {
    const answers = question.options?.length ? selected : freeText.trim() ? [freeText.trim()] : []
    if (!answers.length) return
    setAnswered(true)
    onAnswer(answers)
  }

  return (
    <div className={`question-card ${answered ? 'answered' : ''}`}>
      <div className="question-head">
        <span className="question-title">向用户提问</span>
        {question.header && <span className="question-header">{question.header}</span>}
      </div>
      <div className="question-body">{question.question}</div>

      {answered ? (
        <div className="question-result">
          已回答：{question.options?.length ? selected.join('、') : freeText}
        </div>
      ) : (
        <>
          {question.options && question.options.length > 0 ? (
            <div className="question-options">
              {question.options.map((o) => (
                <button
                  key={o.label}
                  className={`question-option ${selected.includes(o.label) ? 'selected' : ''}`}
                  disabled={disabled}
                  onClick={() => toggle(o.label)}
                >
                  <span className="question-option-label">{o.label}</span>
                  {o.description && <span className="question-option-desc">{o.description}</span>}
                </button>
              ))}
            </div>
          ) : (
            <input
              className="question-input"
              value={freeText}
              placeholder="等待您的回答..."
              disabled={disabled}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
          )}
          <div className="question-actions">
            <button className="msg-action primary" disabled={disabled} onClick={submit}>
              提交回答
            </button>
            <button className="msg-action" disabled={disabled} onClick={onSkip}>
              跳过
            </button>
          </div>
        </>
      )}
    </div>
  )
}
