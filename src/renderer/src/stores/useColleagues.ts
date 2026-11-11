import { create } from 'zustand'
import type {
  Colleague,
  ChannelBinding,
  ChannelKind,
  ColleagueMemory,
  ColleagueQuota,
  ColleagueTask
} from '../../../shared/types'

/**
 * 数字员工 / 助理数据 store —— 对齐原版 `colleagues.*` 的多视图共享数据源。
 *
 * 与 `useApp` / `useScheduleEvents` 同款 zustand 单例：列表页、详情页、配置页、
 * 聊天浮窗都从这里读；主进程每次写入都会广播 `wb:colleague:changed`，
 * 由订阅方重新拉取，保证多面板一致。
 */

interface ColleaguesState {
  colleagues: Colleague[]
  loading: boolean
  loadError: boolean
  /** 渠道绑定（按主体缓存） */
  bindings: Record<string, ChannelBinding[]>
  /** 内存记忆（按主体缓存） */
  memories: Record<string, ColleagueMemory>
  /** 配额 */
  quota: ColleagueQuota | null
  /** 任务（按助理缓存） */
  tasks: Record<string, ColleagueTask[]>

  load: () => Promise<void>
  loadBindings: (subject: string) => Promise<ChannelBinding[]>
  loadMemory: (subject: string) => Promise<ColleagueMemory>
  loadQuota: (plan?: string) => Promise<ColleagueQuota>
  loadTasks: (colleagueId: string) => Promise<ColleagueTask[]>
  get: (id: string) => Colleague | undefined
}

export const useColleagues = create<ColleaguesState>()((set, get) => ({
  colleagues: [],
  loading: false,
  loadError: false,
  bindings: {},
  memories: {},
  quota: null,
  tasks: {},

  load: async () => {
    set({ loading: true, loadError: false })
    try {
      const colleagues = await window.workbuddy.colleagueList()
      set({ colleagues, loading: false, loadError: false })
    } catch {
      // 对齐 `colleagues.loadError`
      set({ loading: false, loadError: true })
    }
  },

  loadBindings: async (subject) => {
    const list = await window.workbuddy.colleagueBindings(subject)
    set({ bindings: { ...get().bindings, [subject]: list } })
    return list
  },

  loadMemory: async (subject) => {
    const m = await window.workbuddy.colleagueMemory(subject)
    set({ memories: { ...get().memories, [subject]: m } })
    return m
  },

  loadQuota: async (plan) => {
    const q = await window.workbuddy.colleagueQuota(plan)
    set({ quota: q })
    return q
  },

  loadTasks: async (colleagueId) => {
    const list = await window.workbuddy.colleagueTasks(colleagueId)
    set({ tasks: { ...get().tasks, [colleagueId]: list } })
    return list
  },

  get: (id) => get().colleagues.find((c) => c.id === id)
}))

/** 云助理保留主体 —— 对齐 `imConfig.tab.assistant` */
export const CLOUD_SUBJECT = 'cloud'

/** 便捷类型再导出，避免组件层层 import */
export type { Colleague, ChannelBinding, ChannelKind, ColleagueMemory, ColleagueQuota, ColleagueTask }
