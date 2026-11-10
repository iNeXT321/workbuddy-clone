import { useState } from 'react'
import type { ApprovalRequest, ApprovalDecision } from '../../../shared/types'

interface Props {
  req: ApprovalRequest
  disabled?: boolean
  onDecide: (decision: ApprovalDecision) => void
}

/**
 * 工具审批卡片 —— 对齐原版 `tool.approval.*`：
 * 标题（confirmTitle.{tool}）、风险标签（riskTag，如「积分消耗较高」）、
 * 消耗提示（creditHint）、四个动作（允许 / 本次会话始终允许 / 本次启动内始终允许 / 拒绝）。
 */
export default function ApprovalCard({ req, disabled, onDecide }: Props) {
  const [decided, setDecided] = useState<ApprovalDecision | null>(null)

  const decide = (d: ApprovalDecision) => {
    setDecided(d)
    onDecide(d)
  }

  const DECISION_LABEL: Record<ApprovalDecision, string> = {
    allow: '已确认',
    alwaysAllowSession: '已确认（本次会话始终允许）',
    alwaysAllowLaunch: '已确认（本次启动内始终允许）',
    reject: '已拒绝'
  }

  return (
    <div className={`approval-card ${decided ? 'decided' : ''}`}>
      <div className="approval-head">
        <span className="approval-title">{req.title}</span>
        {req.riskTag && <span className="approval-risk">{req.riskTag}</span>}
      </div>
      {req.creditHint && <div className="approval-hint">{req.creditHint}</div>}
      <div className="approval-tool">
        <span className="approval-tool-name">{req.toolName}</span>
      </div>
      {decided ? (
        <div className={`approval-decision ${decided === 'reject' ? 'rejected' : 'approved'}`}>
          {DECISION_LABEL[decided]}
        </div>
      ) : (
        <div className="approval-actions">
          <button className="msg-action primary" disabled={disabled} onClick={() => decide('allow')}>
            允许
          </button>
          <button className="msg-action" disabled={disabled} onClick={() => decide('alwaysAllowSession')}>
            本次会话始终允许
          </button>
          <button className="msg-action" disabled={disabled} onClick={() => decide('alwaysAllowLaunch')}>
            本次启动内始终允许
          </button>
          <button className="msg-action" disabled={disabled} onClick={() => decide('reject')}>
            拒绝
          </button>
        </div>
      )}
    </div>
  )
}
