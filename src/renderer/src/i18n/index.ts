import { create } from 'zustand'

/**
 * 轻量 i18n —— 对齐 WorkBuddy 本体的 i18n 实现方式：
 * 原版不依赖第三方 i18n 库（无 i18next），而是自研按命名空间拆分的语言 chunk，
 * 本实现同样自研，提供 zh-CN / en 两语言，语言取值落在 AppSettings.locale。
 */

export type Locale = 'zh-CN' | 'en'

export const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' }
]

type Dict = Record<string, string>

const zhCN: Dict = {
  'app.name': 'WorkBuddy',
  'sidebar.new': '新建对话',
  'sidebar.search': '搜索会话…',
  'sidebar.empty': '暂无会话',
  'sidebar.emptySearch': '无匹配会话',
  'sidebar.delete': '删除',
  'sidebar.deleteConfirm': '删除该会话？',
  'sidebar.export': '导出为 Markdown',
  'chat.welcome': '你好，我是 WorkBuddy',
  'chat.welcomeHint': '在下方输入消息开始对话。首次使用请先在设置中配置 API 接口。',
  'chat.copy': '复制',
  'chat.copied': '已复制',
  'chat.edit': '编辑',
  'chat.regenerate': '重新生成',
  'chat.delete': '删除',
  'chat.cancel': '取消',
  'chat.saveAndRegen': '保存并重生成',
  'chat.loadingText': '思考中',
  'chat.streamingText': '生成回复中',
  'chat.clearContext': '清空上下文',
  'chat.clearSession.toast': '已清空上下文，开启新对话',
  'chat.search.tooltip': '对话内搜索',
  'chat.search.placeholder': '搜索对话内容',
  'chat.search.noMatch': '未找到匹配内容',
  'chat.search.previous': '上一个（Shift+Enter）',
  'chat.search.next': '下一个（Enter）',
  'chat.search.close': '关闭搜索（Esc）',
  'chat.mode.label.default': '默认',
  'chat.mode.label.plan': '计划',
  'chat.mode.label.ask': '仅问答',
  'chat.mode.description.default': '当前为默认模式，可高效执行并完成任务。',
  'chat.mode.description.plan': '当前为计划模式，将先规划任务，等你确认后再执行。',
  'chat.mode.description.ask': '当前为问答模式，适合问问题，找思路，无法做执行。',
  'chat.mode.title': '模式',
  'chat.mode.exit': '退出{mode}模式',
  'composer.queue': '队列（{count}）',
  'composer.queued': '已加入队列，将在当前回复结束后发送',
  'composer.placeholder': '输入消息，Enter 发送，Shift+Enter 换行',
  'composer.send': '发送',
  'composer.stop': '停止',
  'composer.attach': '添加图片',
  'composer.maxImages': '最多 4 张图片',
  'composer.tooLarge': '图片过大（上限 8MB）',
  'composer.attachFailed': '图片读取失败',
  'settings.title': '设置',
  'settings.tab.account': '账户与连接',
  'settings.tab.model': '模型',
  'settings.baseUrl': 'Base URL',
  'settings.apiKey': 'API Key',
  'settings.theme': '主题',
  'settings.theme.system': '跟随系统',
  'settings.theme.dark': '深色',
  'settings.theme.light': '浅色',
  'settings.locale': '语言',
  'settings.model': '模型',
  'settings.temperature': 'Temperature',
  'settings.save': '保存',
  'settings.cancel': '取消',
  'terminal.title': '内置终端',
  'terminal.opening': '启动中…',
  'terminal.failed': '终端启动失败',
  'terminal.exit': '进程退出，退出码',
  'terminal.toggle': '内置终端',
  'settings.toggle': '设置',
  'toast.copied': '已复制到剪贴板',
  'toast.copyFailed': '复制失败',
  'toast.exported': '已导出为 Markdown',
  'toast.exportCanceled': '已取消导出',
  'toast.regenerated': '已重新生成'
}

const en: Dict = {
  'app.name': 'WorkBuddy',
  'sidebar.new': 'New chat',
  'sidebar.search': 'Search conversations…',
  'sidebar.empty': 'No conversations',
  'sidebar.emptySearch': 'No matching conversations',
  'sidebar.delete': 'Delete',
  'sidebar.deleteConfirm': 'Delete this conversation?',
  'sidebar.export': 'Export as Markdown',
  'chat.welcome': "Hi, I'm WorkBuddy",
  'chat.welcomeHint': 'Type a message below to start. Configure the API endpoint in Settings first.',
  'chat.copy': 'Copy',
  'chat.copied': 'Copied',
  'chat.edit': 'Edit',
  'chat.regenerate': 'Regenerate',
  'chat.delete': 'Delete',
  'chat.cancel': 'Cancel',
  'chat.saveAndRegen': 'Save & regenerate',
  'chat.loadingText': 'Thinking',
  'chat.streamingText': 'Generating reply',
  'chat.clearContext': 'Clear context',
  'chat.clearSession.toast': 'Context cleared, starting a new chat',
  'chat.search.tooltip': 'Search in chat',
  'chat.search.placeholder': 'Search conversation',
  'chat.search.noMatch': 'No matches found',
  'chat.search.previous': 'Previous (Shift+Enter)',
  'chat.search.next': 'Next (Enter)',
  'chat.search.close': 'Close search (Esc)',
  'chat.mode.label.default': 'Default',
  'chat.mode.label.plan': 'Plan',
  'chat.mode.label.ask': 'Ask only',
  'chat.mode.description.default': 'Default mode — execute and complete tasks efficiently.',
  'chat.mode.description.plan': 'Plan mode — plan first, then execute after your confirmation.',
  'chat.mode.description.ask': 'Ask mode — good for questions and ideas, no execution.',
  'chat.mode.title': 'Mode',
  'chat.mode.exit': 'Exit {mode} mode',
  'composer.queue': 'Queue ({count})',
  'composer.queued': 'Added to queue; will send after the current reply',
  'composer.placeholder': 'Type a message. Enter to send, Shift+Enter for newline',
  'composer.send': 'Send',
  'composer.stop': 'Stop',
  'composer.attach': 'Add image',
  'composer.maxImages': 'Up to 4 images',
  'composer.tooLarge': 'Image too large (max 8MB)',
  'composer.attachFailed': 'Failed to read image',
  'settings.title': 'Settings',
  'settings.tab.account': 'Account & Connection',
  'settings.tab.model': 'Model',
  'settings.baseUrl': 'Base URL',
  'settings.apiKey': 'API Key',
  'settings.theme': 'Theme',
  'settings.theme.system': 'System',
  'settings.theme.dark': 'Dark',
  'settings.theme.light': 'Light',
  'settings.locale': 'Language',
  'settings.model': 'Model',
  'settings.temperature': 'Temperature',
  'settings.save': 'Save',
  'settings.cancel': 'Cancel',
  'terminal.title': 'Terminal',
  'terminal.opening': 'Starting…',
  'terminal.failed': 'Failed to start terminal',
  'terminal.exit': 'Process exited with code',
  'terminal.toggle': 'Terminal',
  'settings.toggle': 'Settings',
  'toast.copied': 'Copied to clipboard',
  'toast.copyFailed': 'Copy failed',
  'toast.exported': 'Exported as Markdown',
  'toast.exportCanceled': 'Export canceled',
  'toast.regenerated': 'Regenerated'
}

const DICTS: Record<Locale, Dict> = { 'zh-CN': zhCN, en }

interface I18nState {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const useI18nStore = create<I18nState>()((set) => ({
  locale: 'zh-CN',
  setLocale: (locale) => set({ locale })
}))

// 翻译函数：非 hook 场景（store / 工具函数）可直接调用
export function t(key: string): string {
  const { locale } = useI18nStore.getState()
  return DICTS[locale][key] ?? DICTS['zh-CN'][key] ?? key
}

// hook：组件内使用，locale 变化时触发重渲染
export function useTranslation(): { t: (key: string) => string; locale: Locale; setLocale: (l: Locale) => void } {
  const locale = useI18nStore((s) => s.locale)
  const setLocale = useI18nStore((s) => s.setLocale)
  return { t: (key: string) => DICTS[locale][key] ?? DICTS['zh-CN'][key] ?? key, locale, setLocale }
}
