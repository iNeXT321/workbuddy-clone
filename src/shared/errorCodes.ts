import type { ErrorKind, StopReason, ApprovalTool } from './types'

/**
 * 结构化错误码体系 —— 对齐原版 `errorCode.*`（254 条）：
 * 每条错误码 = 简短标题 + `.desc` 详细成因与建议动作。
 * 原版按业务域分段：1xxxx 通用/服务、2xxx 请求参数、3xxx 网络与鉴权、
 * 4xx HTTP 直映射、6xxx 限流、14xxx 额度、172xx 技能/专家、18xxx 会议与消息流。
 */

export interface ErrorCodeEntry {
  code: string
  title: string
  desc: string
}

// 本复刻实现对齐原版中与「对话链路」直接相关的核心错误码
export const ERROR_CODES: Record<string, ErrorCodeEntry> = {
  '10000': { code: '10000', title: '服务出错了，请稍后重试', desc: '服务出现未知错误，与你的网络和设置无关。请切换模型或稍后重试。' },
  '10001': { code: '10001', title: '处理中断，请点击重试', desc: '模型调用过程中出现未预期的错误，这一轮已中断。请点击重试，还失败请新建任务。' },
  '10006': { code: '10006', title: '模型调用失败，请重试', desc: '调用模型接口时失败，没有拿到有效响应。请重试，一直失败请换个模型继续。' },
  '10010': { code: '10010', title: '响应解析失败，请点击重试', desc: '读取流式返回内容时出错，输出没能完整展示。请重试，反复失败请换个模型。' },
  '10013': { code: '10013', title: '输入内容不合规，请修改后重试', desc: '这次输入没通过格式检查，无法提交给模型。请精简或修改内容后重新发送。' },
  '10017': { code: '10017', title: '密钥读取失败，请检查密钥配置', desc: '读取模型密钥时失败，无法发起调用。请到设置里检查密钥，重新保存后再试。' },
  '2005': { code: '2005', title: '消息内容为空，请输入后发送', desc: '这次发送没有带上任何文字内容，无法处理。请在输入框补上问题或指令再发。' },
  '3001': { code: '3001', title: '密钥无效，请检查密钥配置', desc: '服务器拒绝了这个密钥，说明网络是通的。请检查密钥后重试。' },
  '3002': { code: '3002', title: '网络连接失败，请检查网络后重试', desc: '网络连接失败，请检查本地网络是否可正常联网或检查 VPN 代理服务。' },
  '3003': { code: '3003', title: '网络请求超时，请检查网络后重试', desc: '网络响应超时，可尝试暂停正进行的下载或上传任务；更换至稳定网络；切换至其他模型。' },
  '3004': { code: '3004', title: '登录已过期，请重新登录', desc: '账号登录状态已过期，服务端拒绝了这次请求。请重新登录后继续当前对话。' },
  '3005': { code: '3005', title: '请求处理失败，请重试', desc: '服务器收到了请求但认为内容不合法，与你的网络无关。请检查提示词后重试。' },
  '3007': { code: '3007', title: '服务暂时不可用，请稍后重试', desc: '请求没有成功返回，多是服务端临时故障，少数是本地代理异常。请稍后重试。' },
  '3008': { code: '3008', title: '模型未返回有效信息，请稍后重试', desc: '本次模型未返回可用的回答或操作指令，任务暂时无法继续。您可以稍后重试、切换模型或提交反馈。' },
  '400': { code: '400', title: '请求无效，请稍后重试', desc: '服务器判定此次请求的格式或参数不合法，请稍后重试或提交反馈。' },
  '401': { code: '401', title: '身份验证失败，请重新登录', desc: '服务器无法确认你的账号身份，拒绝了这次请求。请重新登录后继续当前对话。' },
  '402': { code: '402', title: '登录已失效，请重新登录', desc: '账号的登录凭证被服务器拒绝，与你的网络无关。请重新登录后继续当前对话。' },
  '404': { code: '404', title: '模型不可用，请切换模型后重试', desc: '请求的模型或接口地址不存在。请检查模型配置，或换个模型后重新发送。' },
  '429': { code: '429', title: '请求过于频繁，请等几秒再发送', desc: '短时间发送的请求太多，触发了限流保护，不是故障。等几秒重新发送即可恢复。' },
  '502': { code: '502', title: '服务网关异常，请稍后重试', desc: '请求到了网关但转发失败，多是服务端临时波动。请稍后重试，反复出现请检查代理。' },
  '6000': { code: '6000', title: '请求过于频繁，请稍候再发送', desc: '请求频率超过了保护阈值，属于正常限流。稍等片刻重新发送即可，无需改设置。' },
  '6001': { code: '6001', title: '发送过快已限流，请等几秒', desc: '每秒消耗的内容量超过上限，触发了限流。请等几秒再试，或减少单次输入的长度。' },
  '6004': { code: '6004', title: '当前模型用量已达今日上限，请切换模型或稍后重试。', desc: '今日该模型用量已达上限，请切换模型或稍后重试。' },
  '6008': { code: '6008', title: '今日次数已用完，明日恢复', desc: '今天的请求次数达到账号上限，次日零点重置。可先换个模型继续，或明天再来。' },
  '14003': { code: '14003', title: '模型繁忙，请换模型或稍后重试', desc: '这个模型当前请求量饱和，与你的网络无关。请换个模型，或稍等一会儿再重试。' },
  '4015': { code: '4015', title: '上下文压缩失败，请稍后重试或新建任务', desc: '当前任务上下文过长，请调整模型上下文长度或新建任务。' },
  '11115': { code: '11115', title: '内容过长，请精简或新建任务', desc: '本次输入加上历史对话超过了模型上限。请精简内容、删掉大附件，或新建任务。' },
  generic: { code: 'generic', title: '服务出现异常，请重试', desc: '服务出现异常，请重试。' }
}

/** 错误分类 → 错误码（分类到码的映射，供渲染层展示「错误码：」） */
const KIND_TO_CODE: Record<ErrorKind, string> = {
  network: '3002',
  timeout: '3003',
  auth: '401',
  rateLimit: '6000',
  modelOverload: '14003',
  server: '3007',
  unknown: 'generic'
}

/** 停止原因 → 错误码（截断/拒绝类） */
const STOP_TO_CODE: Partial<Record<StopReason, string>> = {
  authError: '401',
  maxTokens: '11115',
  maxTurnRequests: '10001',
  modelService: '3008',
  network: '3002',
  generic: 'generic'
}

export function errorCodeForKind(kind: ErrorKind | undefined): string {
  return kind ? KIND_TO_CODE[kind] ?? 'generic' : 'generic'
}

export function errorCodeForStopReason(r: StopReason | undefined): string | undefined {
  return r ? STOP_TO_CODE[r] : undefined
}

export function lookupErrorCode(code: string | undefined): ErrorCodeEntry | undefined {
  return code ? ERROR_CODES[code] : undefined
}

/**
 * 需要审批的工具表 —— 对齐原版 `tool.approval.confirmTitle.*` / `riskTag.*` / `creditHint.*`。
 * 审批只在「默认权限」下触发；完全访问（fullAccess）时跳过。
 */
export interface ApprovalRule {
  title: string
  riskTag: string
  creditHint: string
}

export const APPROVAL_RULES: Record<ApprovalTool, ApprovalRule> = {
  imageGen: {
    title: '确认开始生成图片？',
    riskTag: '产生积分消耗',
    creditHint: '当前模型生成图片将消耗额外积分，每张图片约 5-10积分，请谨慎操作'
  },
  videoGen: {
    title: '确认开始生成视频？',
    riskTag: '积分消耗较高',
    creditHint: '生成视频将消耗额外积分，每 5 秒约 50-100 积分，请谨慎操作'
  },
  computerUse: {
    title: '确认开始使用电脑操控能力？',
    riskTag: '产生积分消耗',
    creditHint: '使用该能力将消耗额外积分，请谨慎操作'
  },
  audioTranscribe: {
    title: '确认开始音频文件转文字？',
    riskTag: '产生积分消耗',
    creditHint: '当前模型音频文件转文本将消耗额外积分，约 0.6 积分/分钟，请谨慎操作。实际费用以最终识别的音频时长结算。'
  },
  imageProcessing: {
    title: '确认开始处理图片？',
    riskTag: '预计产生积分消耗',
    creditHint: '图片处理预计每张将消耗 5-10 积分，批量处理或复杂任务可能消耗更多，实际消耗以最终结算为准，请谨慎操作。'
  },
  generic: {
    title: '确认执行该操作？',
    riskTag: '需要授权',
    creditHint: '该操作需要你的授权后才能继续。'
  }
}

/** 工具名 → 审批类别（对齐原版 tool.approval.confirmTitle.{tool}） */
const TOOL_TO_APPROVAL: Record<string, ApprovalTool> = {
  ImageGen: 'imageGen',
  VideoGen: 'videoGen',
  ComputerUse: 'computerUse',
  AudioTranscribe: 'audioTranscribe',
  ImageEdit: 'imageProcessing',
  ImageProcessing: 'imageProcessing'
}

export function approvalToolFor(toolName: string): ApprovalTool {
  return TOOL_TO_APPROVAL[toolName] ?? 'generic'
}

/** 该工具是否需要审批 */
export function needsApproval(toolName: string): boolean {
  return toolName in TOOL_TO_APPROVAL
}

// 会话数量上限 —— 对齐原版 conversation.maxSessions.dialog.*
export const MAX_SESSIONS = 500
