import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

/**
 * 工作空间 —— 对齐原版 `taskStarter.*` 语义：
 * - `selectWorkspace`=选择工作空间、`startFromEmpty`=新建工作空间、`openNewDirectory`=打开本地文件夹
 * - `createWorkspaceDesc`=为工作空间命名，本地将自动创建同名文件夹，命名后不可随意更改
 * - `createWorkspace.toast.failed`=新建工作空间失败，请重试
 * - `workspaceNotExist`=所选工作空间不存在，请重新选择
 * - `noWorkspace`=不使用工作空间
 *
 * 原版工作空间是一个真实目录（任务在其下读写文件），因此这里维护
 * 「工作空间名 → 绝对路径」的映射，并保证目录真实存在。
 */

export interface Workspace {
  name: string
  path: string
  createdAt: number
}

/** 工作空间名合法性：非空、无路径分隔符、无文件系统保留字符 */
export function validateWorkspaceName(name: string): { ok: boolean; reason?: string } {
  const n = name.trim()
  if (!n) return { ok: false, reason: 'empty' }
  if (n === '.' || n === '..') return { ok: false, reason: 'reserved' }
  // 路径分隔符与常见非法字符（跨平台保守集）
  if (/[\\/:*?"<>|]/.test(n)) return { ok: false, reason: 'illegalChar' }
  if (n.length > 64) return { ok: false, reason: 'tooLong' }
  return { ok: true }
}

/** 在指定根目录下创建一个同名文件夹（对齐「本地将自动创建同名文件夹」） */
export function createWorkspace(root: string, name: string): { ok: boolean; path?: string; reason?: string } {
  const v = validateWorkspaceName(name)
  if (!v.ok) return { ok: false, reason: v.reason }
  const path = join(root, name.trim())
  try {
    mkdirSync(path, { recursive: true })
    if (!existsSync(path)) return { ok: false, reason: 'mkdirFailed' }
    return { ok: true, path }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'mkdirFailed' }
  }
}

/** 校验工作空间目录是否仍然存在（对齐 `workspaceNotExist`） */
export function workspaceExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** 列出根目录下的候选工作空间（子目录），用于「选择工作空间」列表 */
export function listWorkspaces(root: string, limit = 50): Array<{ name: string; path: string; mtime: number }> {
  if (!workspaceExists(root)) return []
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => {
        const p = join(root, e.name)
        let mtime = 0
        try {
          mtime = statSync(p).mtimeMs
        } catch {
          // 权限不足时忽略时间
        }
        return { name: e.name, path: p, mtime }
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
  } catch {
    return []
  }
}

/** 工作空间显示名（路径末段） */
export function workspaceLabel(path: string): string {
  return basename(path) || path
}
