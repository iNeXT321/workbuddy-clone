/**
 * 逻辑冒烟前置：用 esbuild 把 shared/scheduleEvent.ts 打包成可被 node 直接 import 的 ESM。
 * 运行：node smoke-r12-logic-prep.mjs
 */
import { buildSync } from 'esbuild'

buildSync({
  entryPoints: ['src/shared/scheduleEvent.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '.smoke-event.mjs',
  logLevel: 'error'
})
console.log('已生成 .smoke-event.mjs')
