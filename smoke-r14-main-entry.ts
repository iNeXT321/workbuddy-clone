/**
 * 冒烟辅助入口（第十四轮）—— 供 esbuild 打包为 .smoke-main.cjs，
 * 在冒烟脚本内可手工调用 registerIpcHandlers()，不启动真实窗口。
 */
export { registerIpcHandlers, activeStreams } from './src/main/ipc'
export { registerTerminalHandlers } from './src/main/terminal'
export { Store, getStore } from './src/main/store'
export { runAutomation, tick, startScheduler, stopScheduler, runningAutomationIds, reasonForError } from './src/main/automation'
export { DEFAULT_CALENDAR_DEFAULTS } from './src/shared/scheduleEvent'
export * as colleague from './src/shared/colleague'
export * as skill from './src/shared/skill'
