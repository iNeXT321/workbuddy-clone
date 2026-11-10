import { useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { useTranslation, LOCALES } from '../i18n'

/**
 * 设置面板 —— 对齐 WorkBuddy 本体的多面板结构：
 * 通过左侧分类标签拆分出「账户与连接」「模型」两个语义面板，
 * 替代原单一扁平设置表单。
 */

interface Props {
  settings: AppSettings
  onSave: (s: AppSettings) => void
  onClose: () => void
}

type TabKey = 'account' | 'model'

export default function SettingsPanel({ settings, onSave, onClose }: Props) {
  const { t } = useTranslation()
  const [form, setForm] = useState<AppSettings>(settings)
  const [tab, setTab] = useState<TabKey>('account')

  const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'account', label: t('settings.tab.account') },
    { key: 'model', label: t('settings.tab.model') }
  ]

  const save = () => {
    onSave(form)
    onClose()
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>{t('settings.title')}</span>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-layout">
          <div className="settings-tabs">
            {TABS.map((tabItem) => (
              <button
                key={tabItem.key}
                className={`settings-tab ${tab === tabItem.key ? 'active' : ''}`}
                onClick={() => setTab(tabItem.key)}
              >
                {tabItem.label}
              </button>
            ))}
          </div>
          <div className="settings-body">
            {tab === 'account' && (
              <>
                <label className="field">
                  <span>{t('settings.baseUrl')}</span>
                  <input
                    value={form.baseUrl}
                    onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label className="field">
                  <span>{t('settings.apiKey')}</span>
                  <input
                    type="password"
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                </label>
                <label className="field">
                  <span>{t('settings.theme')}</span>
                  <select
                    value={form.theme}
                    onChange={(e) =>
                      setForm({ ...form, theme: e.target.value as AppSettings['theme'] })
                    }
                  >
                    <option value="system">{t('settings.theme.system')}</option>
                    <option value="dark">{t('settings.theme.dark')}</option>
                    <option value="light">{t('settings.theme.light')}</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t('settings.locale')}</span>
                  <select
                    value={form.locale}
                    onChange={(e) =>
                      setForm({ ...form, locale: e.target.value as AppSettings['locale'] })
                    }
                  >
                    {LOCALES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {tab === 'model' && (
              <>
                <label className="field">
                  <span>{t('settings.model')}</span>
                  <input
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="gpt-4o-mini"
                  />
                </label>
                <label className="field">
                  <span>
                    {t('settings.temperature')}：{form.temperature.toFixed(1)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={form.temperature}
                    onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>{t('chat.mode.title')}</span>
                  <select
                    value={form.mode ?? 'default'}
                    onChange={(e) => setForm({ ...form, mode: e.target.value as AppSettings['mode'] })}
                  >
                    {(['default', 'plan', 'ask'] as const).map((m) => (
                      <option key={m} value={m}>
                        {t(`chat.mode.label.${m}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        </div>
        <div className="settings-footer">
          <button className="btn" onClick={onClose}>
            {t('settings.cancel')}
          </button>
          <button className="btn send" onClick={save}>
            {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
