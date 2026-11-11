import { create } from 'zustand'
import type { ScheduleEvent } from '../../../shared/types'

/**
 * 日程数据 store —— 对齐原版 `home.schedule.*` 的多视图共享数据源。
 *
 * 与 `useApp` 同款 zustand 单例：面板与后续任意入口（今日概览、搜索）都从这里读，
 * 主进程每次写入都会广播 `wb:event:changed`，由面板订阅后重新拉取区间。
 */

interface ScheduleEventsState {
  events: ScheduleEvent[]
  loading: boolean
  /** 已加载的区间（用于判断能否复用缓存） */
  range: { from: number; to: number } | null
  load: (opts?: { from?: number; to?: number; source?: string; includeCancelled?: boolean }) => Promise<void>
  get: (id: string) => ScheduleEvent | undefined
}

export const useScheduleEvents = create<ScheduleEventsState>()((set, get) => ({
  events: [],
  loading: false,
  range: null,
  load: async (opts = {}) => {
    set({ loading: true })
    try {
      const events = await window.workbuddy.eventList(opts)
      set({
        events,
        loading: false,
        range: opts.from !== undefined && opts.to !== undefined ? { from: opts.from, to: opts.to } : null
      })
    } catch {
      set({ loading: false })
    }
  },
  get: (id) => get().events.find((e) => e.id === id)
}))
