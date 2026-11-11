import { create } from 'zustand'
import type { Skill } from '../../../shared/types'

/**
 * 技能市场 / 技能管理数据 store —— 对齐原版 `skills.*` 的多视图共享数据源。
 *
 * 与 `useColleagues` 同款 zustand 单例：推荐 / SkillHub / 套件 / Knot / 企业 /
 * 已安装六个 Tab 与详情页、批量管理、选择器都从同一份列表派生；
 * 主进程每次写入都会广播 `wb:skill:changed`，订阅方重新拉取保证一致。
 */

interface SkillsState {
  skills: Skill[]
  loading: boolean
  loadError: boolean
  /** 已启用的技能数（用于 `enabledWarning`） */
  enabledCount: number

  load: () => Promise<void>
  loadEnabledCount: () => Promise<number>
  get: (id: string) => Skill | undefined
}

export const useSkills = create<SkillsState>()((set, get) => ({
  skills: [],
  loading: false,
  loadError: false,
  enabledCount: 0,

  load: async () => {
    set({ loading: true, loadError: false })
    try {
      const skills = await window.workbuddy.skillList()
      set({ skills, loading: false, loadError: false })
    } catch {
      // 对齐 `skills.market.loadError`
      set({ loading: false, loadError: true })
    }
  },

  loadEnabledCount: async () => {
    const n = await window.workbuddy.skillEnabledCount()
    set({ enabledCount: n })
    return n
  },

  get: (id) => get().skills.find((s) => s.id === id)
}))
