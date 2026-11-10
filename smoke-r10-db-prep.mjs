/**
 * 为第十轮 DB 冒烟打包 store.ts（外部化 electron / node:sqlite）
 * 运行：node smoke-r10-db-prep.mjs
 */
import { buildSync } from 'esbuild'

buildSync({
  entryPoints: ['src/main/store.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: '.smoke-store.cjs',
  external: ['electron', 'node:sqlite'],
  logLevel: 'error'
})
console.log('已生成 .smoke-store.cjs')
