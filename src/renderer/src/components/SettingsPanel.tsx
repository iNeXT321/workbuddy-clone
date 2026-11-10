import { useState } from 'react'
import type { AppSettings } from '../../../shared/types'

interface Props {
  settings: AppSettings
  onSave: (s: AppSettings) => void
  onClose: () => void
}

export default function SettingsPanel({ settings, onSave, onClose }: Props) {
  const [form, setForm] = useState<AppSettings>(settings)

  const save = () => {
    onSave(form)
    onClose()
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>设置</span>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-body">
          <label className="field">
            <span>Base URL</span>
            <input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="field">
            <span>API Key</span>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </label>
          <label className="field">
            <span>模型</span>
            <input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </label>
          <label className="field">
            <span>Temperature：{form.temperature.toFixed(1)}</span>
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
            <span>主题</span>
            <select
              value={form.theme}
              onChange={(e) => setForm({ ...form, theme: e.target.value as 'light' | 'dark' })}
            >
              <option value="dark">深色</option>
              <option value="light">浅色</option>
            </select>
          </label>
        </div>
        <div className="settings-footer">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn send" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
