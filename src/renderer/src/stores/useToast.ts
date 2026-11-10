import { create } from 'zustand'

/**
 * 轻量 toast 通知 —— 对齐 WorkBuddy 本体的 toast chunk：
 * 全局单例 store，任意组件可 push 一条提示，由 <Toaster> 统一渲染。
 */

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastItem {
  id: string
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, kind?: ToastKind) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = crypto.randomUUID()
    set({ toasts: [...get().toasts, { id, kind, message }] })
    setTimeout(() => get().dismiss(id), 2600)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

// 便捷函数（非 hook 场景也能调用）
export const toast = {
  info: (m: string) => useToastStore.getState().push(m, 'info'),
  success: (m: string) => useToastStore.getState().push(m, 'success'),
  error: (m: string) => useToastStore.getState().push(m, 'error')
}
