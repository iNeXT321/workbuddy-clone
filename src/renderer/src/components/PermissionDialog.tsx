import { useEffect, useState } from 'react'
import type { PermissionLevel } from '../../../shared/types'
import { useTranslation } from '../i18n'

interface Props {
  open: boolean
  current: PermissionLevel
  onClose: () => void
  onConfirm: () => void
  onRevoke: () => void
}

/**
 * 完全访问确认弹窗 —— 对齐原版 input.wbAdd.permission.confirm.*：
 * 标题 / 说明 / 三项能力（文件、互联网、终端）/ 免责勾选 / 确认与取消。
 * 勾选复选框是确认的前置条件（对齐原版 confirm.checkbox 语义）。
 */
export default function PermissionDialog({ open, current, onClose, onConfirm, onRevoke }: Props) {
  const { t } = useTranslation()
  const [ack, setAck] = useState(false)

  useEffect(() => {
    if (open) setAck(false)
  }, [open])

  if (!open) return null

  const alreadyFull = current === 'fullAccess'

  const CAPS: Array<{ key: string; icon: string }> = [
    { key: 'files', icon: '📁' },
    { key: 'internet', icon: '🌐' },
    { key: 'terminal', icon: '⌨️' }
  ]

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal permission-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{alreadyFull ? t('permission.fullAccess') : t('permission.confirm.title')}</h3>
          <button className="icon-btn" onClick={onClose} title={t('permission.confirm.cancel')}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="permission-desc">
            {alreadyFull ? t('permission.description.fullAccess') : t('permission.confirm.desc')}
          </p>

          <div className="permission-caps">
            {CAPS.map((c) => (
              <div key={c.key} className="permission-cap">
                <span className="permission-cap-icon">{c.icon}</span>
                <div className="permission-cap-text">
                  <div className="permission-cap-title">{t(`permission.confirm.capability.${c.key}`)}</div>
                  <div className="permission-cap-desc">{t(`permission.confirm.capability.${c.key}.desc`)}</div>
                </div>
              </div>
            ))}
          </div>

          {!alreadyFull && (
            <label className="permission-ack">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>{t('permission.confirm.checkbox')}</span>
            </label>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn ghost" onClick={onClose}>
            {t('permission.confirm.cancel')}
          </button>
          {alreadyFull ? (
            <button className="btn danger" onClick={onRevoke}>
              {t('permission.switchOff')}
            </button>
          ) : (
            <button className="btn primary" disabled={!ack} onClick={onConfirm}>
              {t('permission.confirm.ok')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
