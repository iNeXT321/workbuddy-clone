/**
 * 为第十轮运行时冒烟打包主进程 handler 集（外部化 electron / node:sqlite）
 * 运行：node smoke-r11-main-prep.mjs
 */
import { buildSync } from 'esbuild'

buildSync({
  entryPoints: ['smoke-r11-main-entry.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: '.smoke-main.cjs',
  external: ['electron', 'node:sqlite'],
  logLevel: 'error'
})
console.log('已生成 .smoke-main.cjs')
