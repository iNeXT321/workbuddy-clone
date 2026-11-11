/**
 * 逻辑冒烟前置：把 shared/colleague.ts 打包为可 node 直接 import 的 ESM。
 * 运行：node smoke-r13-logic-prep.mjs
 */
import { buildSync } from 'esbuild'

buildSync({
  entryPoints: ['src/shared/colleague.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '.smoke-colleague.mjs',
  logLevel: 'error'
})
console.log('已生成 .smoke-colleague.mjs')
