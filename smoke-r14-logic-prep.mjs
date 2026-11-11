/**
 * 逻辑冒烟前置：把 shared/skill.ts 打包为可 node 直接 import 的 ESM。
 * 运行：node smoke-r14-logic-prep.mjs
 */
import { buildSync } from 'esbuild'

buildSync({
  entryPoints: ['src/shared/skill.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '.smoke-skill.mjs',
  logLevel: 'error'
})
console.log('已生成 .smoke-skill.mjs')
