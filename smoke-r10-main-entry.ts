/**
 * 冒烟辅助入口 —— 供 esbuild 打包为 .smoke-main.cjs，
 * 在冒烟脚本内可手工调用 registerIpcHandlers() / registerTerminalHandlers()，
 * 而不启动真实窗口（避免与冒烟自建窗口冲突）。
 */
export { registerIpcHandlers, activeStreams } from './src/main/ipc'
export { registerTerminalHandlers } from './src/main/terminal'
export { Store, getStore } from './src/main/store'
