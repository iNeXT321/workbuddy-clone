import type { DocumentSelection, SessionSeparator } from '../../../shared/types'
import { useTranslation } from '../i18n'

/**
 * 文档选区 chip —— 对齐原版 `chat.documentSelection.*`：
 * - kind → `documentLabel`（文档选区）/ `spreadsheetLabel`（表格选区）/ `presentationLabel`（幻灯片选区）
 * - source → `localDocument`（本地文档）/ `onlineDocument`（腾讯文档）
 * - `dismiss`=忽略此选区
 */
export function SelectionChip({ sel, onDismiss }: { sel: DocumentSelection; onDismiss: () => void }) {
  const { t } = useTranslation()
  const kindKey =
    sel.kind === 'spreadsheet'
      ? 'documentSelection.spreadsheetLabel'
      : sel.kind === 'presentation'
        ? 'documentSelection.presentationLabel'
        : 'documentSelection.documentLabel'
  const sourceKey = sel.source === 'online' ? 'documentSelection.onlineDocument' : 'documentSelection.localDocument'
  const icon = sel.kind === 'spreadsheet' ? '📊' : sel.kind === 'presentation' ? '📽' : '📄'

  return (
    <span className="selection-chip" title={sel.locator ? `${sel.name} · ${sel.locator}` : sel.name}>
      <span className="selection-icon">{icon}</span>
      <span className="selection-meta">
        <span className="selection-kind">{t(kindKey)}</span>
        <span className="selection-name">{sel.name}</span>
      </span>
      <span className="selection-source">{t(sourceKey)}</span>
      <button className="selection-dismiss" onClick={onDismiss} title={t('documentSelection.dismiss')}>
        ×
      </button>
    </span>
  )
}

/**
 * 上下文档位分隔 —— 对齐原版 `chat.sessionSeparator.*`：
 * `settingsTooltip`=点击可跳转至{name}设置页、`settingsLink`=⚙ 设置
 */
export function SeparatorRow({
  sep,
  onOpenSettings
}: {
  sep: SessionSeparator
  onOpenSettings: () => void
}) {
  const { t } = useTranslation()
  const tooltip = t('sessionSeparator.settingsTooltip').replace('{name}', t('settings.title'))
  return (
    <div className="session-separator">
      <span className="separator-line" />
      <span className="separator-label" title={`${sep.model} · ${sep.mode} · ${sep.permission}`}>
        {t('sessionSeparator.label')}
      </span>
      <button className="separator-settings" onClick={onOpenSettings} title={tooltip}>
        {t('sessionSeparator.settingsLink')}
      </button>
      <span className="separator-line" />
    </div>
  )
}
