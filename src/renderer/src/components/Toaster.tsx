import { useToastStore } from '../stores/useToast'

/** Toast 容器 —— 挂在 App 根部，渲染全局轻提示。 */
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => useToastStore.getState().dismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
