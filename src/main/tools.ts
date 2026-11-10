import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve, basename } from 'node:path'
import type { UserQuestion } from '../shared/types'
import { needsApproval, approvalToolFor } from '../shared/errorCodes'

/**
 * 工具层 —— 对齐原版 WorkBuddy 的「模型发起工具调用 → 审批 → 执行 → 结果回灌」闭环。
 *
 * 工具名对齐原版内置工具（ImageGen / VideoGen / ComputerUse / AudioTranscribe /
 * ImageEdit / AskUserQuestion，以及文件类操作），需要审批的工具走
 * errorCodes 里的 APPROVAL_RULES（即原版 tool.approval.confirmTitle.*）。
 * 完全访问（fullAccess）下跳过审批；ask（仅问答）模式不挂载工具。
 */

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** OpenAI function-calling 形态的工具表 */
export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取本机文件内容。返回文件的文本内容。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件的绝对路径' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '把内容写入本机文件（覆盖式）。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件的绝对路径' },
          content: { type: 'string', description: '要写入的文本内容' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出目录下的文件与子目录。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '目录的绝对路径，默认当前目录' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: '根据文字描述生成图片。该能力会产生积分消耗。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '图片内容描述' },
          size: { type: 'string', description: '图片尺寸，如 1024x1024' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: '根据文字描述生成视频。该能力积分消耗较高。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '视频内容描述' },
          duration: { type: 'number', description: '时长（秒），默认 5' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'transcribe_audio',
      description: '把本地音频文件转成文字。该能力会产生积分消耗。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '音频文件的绝对路径' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_image',
      description: '按指令处理/编辑本地图片。该能力会产生积分消耗。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '图片文件的绝对路径' },
          instruction: { type: 'string', description: '处理要求' }
        },
        required: ['path', 'instruction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use',
      description: '操控本机图形界面完成任务（打开浏览器、点击、输入等）。该能力会产生积分消耗。',
      parameters: {
        type: 'object',
        properties: { task: { type: 'string', description: '要完成的桌面任务描述' } },
        required: ['task']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_user_question',
      description:
        '当需要用户补充信息或做选择时，向用户提问并等待回答。适用于方案选择、参数确认等场景。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '要问用户的问题' },
          header: { type: 'string', description: '问题的简短标题（不超过12字）' },
          options: {
            type: 'array',
            description: '可选项列表；不提供则让用户自由输入',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '选项名称' },
                description: { type: 'string', description: '选项说明' }
              },
              required: ['label']
            }
          },
          multiSelect: { type: 'boolean', description: '是否允许多选' }
        },
        required: ['question']
      }
    }
  }
]

/** 工具名 → 原版内置能力名（用于审批规则匹配与 UI 展示） */
export const TOOL_CANONICAL: Record<string, string> = {
  read_file: 'Read',
  write_file: 'Write',
  list_files: 'List',
  generate_image: 'ImageGen',
  generate_video: 'VideoGen',
  transcribe_audio: 'AudioTranscribe',
  edit_image: 'ImageEdit',
  computer_use: 'ComputerUse',
  ask_user_question: 'AskUserQuestion'
}

/** 需要用户审批的工具（对齐原版 tool.approval.*） */
export function toolNeedsApproval(toolName: string): boolean {
  const canonical = TOOL_CANONICAL[toolName] ?? toolName
  return needsApproval(canonical)
}

/** 该工具对应的审批类别（imageGen / videoGen / ...） */
export function toolApprovalKind(toolName: string): string {
  return approvalToolFor(TOOL_CANONICAL[toolName] ?? toolName)
}

/** 该工具是否为「向用户提问」（由主进程交互通道处理，不走执行器） */
export function isAskUserQuestion(toolName: string): boolean {
  return toolName === 'ask_user_question'
}

/** 把 ask_user_question 的参数解析成 UserQuestion（不含 id） */
export function parseQuestion(args: string): Omit<UserQuestion, 'id'> {
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(args || '{}')
  } catch {
    // 参数非 JSON 时退化为纯文本问题
  }
  const rawOptions = Array.isArray(parsed.options) ? (parsed.options as Array<Record<string, unknown>>) : undefined
  const text = String(parsed.question ?? parsed.text ?? '').trim()
  return {
    question: text || '请补充信息',
    header: parsed.header ? String(parsed.header) : undefined,
    options: rawOptions?.map((o) => ({
      label: String(o.label ?? ''),
      description: o.description ? String(o.description) : undefined
    })),
    multiSelect: !!parsed.multiSelect
  }
}

export interface ToolExecResult {
  ok: boolean
  output: string
}

/** 把参数里的路径解析为绝对路径（相对路径落到 cwd） */
function absPath(p: unknown): string {
  const s = String(p ?? '').trim()
  if (!s) return process.cwd()
  return resolve(s)
}

/**
 * 执行工具 —— 返回回灌给模型的文本结果。
 * 生成类能力（图片/视频/音频/电脑操控）在本复刻实现中不做真实外部调用，
 * 返回可读的降级说明，保证工具闭环完整、模型可继续推进。
 */
export async function executeTool(name: string, args: string): Promise<ToolExecResult> {
  let a: Record<string, unknown> = {}
  try {
    a = JSON.parse(args || '{}')
  } catch {
    return { ok: false, output: `参数解析失败：${args}` }
  }

  try {
    switch (name) {
      case 'read_file': {
        const p = absPath(a.path)
        const content = readFileSync(p, 'utf-8')
        // 截断超长文件，避免撑爆上下文（对齐原版「内容过长」保护思路）
        const MAX = 20000
        const out = content.length > MAX ? content.slice(0, MAX) + `\n…（已截断，共 ${content.length} 字符）` : content
        return { ok: true, output: out }
      }
      case 'write_file': {
        const p = absPath(a.path)
        mkdirSync(dirname(p), { recursive: true })
        const content = String(a.content ?? '')
        writeFileSync(p, content, 'utf-8')
        return { ok: true, output: `已写入 ${p}（${content.length} 字符）` }
      }
      case 'list_files': {
        const p = absPath(a.path)
        const entries = readdirSync(p, { withFileTypes: true })
        const lines = entries.slice(0, 300).map((e) => {
          if (e.isDirectory()) return `${e.name}/`
          try {
            const st = statSync(resolve(p, e.name))
            return `${e.name}\t${st.size}B`
          } catch {
            return e.name
          }
        })
        return { ok: true, output: lines.length ? lines.join('\n') : '（空目录）' }
      }
      case 'generate_image':
        return { ok: true, output: `[图片生成] 已受理提示词「${String(a.prompt ?? '')}」。本工作区未接入图片生成服务，未产生实际消耗。` }
      case 'generate_video':
        return { ok: true, output: `[视频生成] 已受理提示词「${String(a.prompt ?? '')}」。本工作区未接入视频生成服务，未产生实际消耗。` }
      case 'transcribe_audio':
        return { ok: true, output: `[音频转文字] 已受理文件 ${basename(absPath(a.path))}。本工作区未接入语音识别服务，未产生实际消耗。` }
      case 'edit_image':
        return { ok: true, output: `[图片处理] 已受理 ${basename(absPath(a.path))}（${String(a.instruction ?? '')}）。本工作区未接入图像处理服务，未产生实际消耗。` }
      case 'computer_use':
        return { ok: true, output: `[电脑操控] 已受理任务「${String(a.task ?? '')}」。本工作区未接入桌面操控服务，未产生实际消耗。` }
      default:
        return { ok: false, output: `未知工具：${name}` }
    }
  } catch (err) {
    return { ok: false, output: `工具执行失败：${err instanceof Error ? err.message : String(err)}` }
  }
}
