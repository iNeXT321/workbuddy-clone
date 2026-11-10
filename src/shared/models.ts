/**
 * 模型能力表 —— 对齐原版 `model.*` 命名空间与「模型能力门控」语义：
 * 原版在发送前按所选模型的能力做校验，不满足时给出明确提示而非静默失败：
 * - `chat.imageNotSupported`=当前模型暂不支持图片，请切换模型后重试
 * - `chat.gifNotSupported`=当前模型不支持 GIF，请切换至 kimi 或 minimax 模型后重试
 * - `chat.modelUnavailableSwitchModel`=当前模型不可用，请切换模型
 *
 * 原版模型族（`model.*` 事实）：claudeSonnet4（平衡性能与成本的选择）、
 * claude35Sonnet（快速响应，适合日常任务）、gpt4o（OpenAI 多模态模型）、
 * GLM-4.7（能力均衡，适合日常使用）、GLM-4.6（具有强大推理能力的先进语言模型）等。
 */

export interface ModelCapability {
  id: string
  label: string
  description?: string
  /** 是否支持图片输入（多模态） */
  vision: boolean
  /** 是否支持 GIF 动图输入 */
  gif: boolean
  /** 是否支持 function calling（工具调用） */
  tools: boolean
}

// 原版内置模型族（能力声明对齐 model.* 的描述文案）
export const BUILT_IN_MODELS: ModelCapability[] = [
  {
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    description: '平衡性能与成本的选择',
    vision: true,
    gif: false,
    tools: true
  },
  {
    id: 'claude-3-5-sonnet',
    label: 'Claude 3.5 Sonnet',
    description: '快速响应，适合日常任务',
    vision: true,
    gif: false,
    tools: true
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    description: 'OpenAI 多模态模型',
    vision: true,
    gif: true,
    tools: true
  },
  {
    id: 'glm-4.7',
    label: 'GLM-4.7',
    description: '大模型，能力均衡，适合日常使用',
    vision: true,
    gif: false,
    tools: true
  },
  {
    id: 'glm-4.6',
    label: 'GLM-4.6',
    description: '具有强大推理能力的先进语言模型',
    vision: false,
    gif: false,
    tools: true
  },
  {
    id: 'kimi',
    label: 'Kimi',
    vision: true,
    gif: true,
    tools: true
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    vision: true,
    gif: true,
    tools: true
  }
]

/** 按名称片段识别已知模型族（大小写不敏感，兼容带版本后缀的 id） */
function matchFamily(name: string): ModelCapability | undefined {
  const n = name.toLowerCase()
  return BUILT_IN_MODELS.find((m) => n.includes(m.id) || n.includes(m.label.toLowerCase()))
}

/**
 * 查询模型能力。
 * 未知模型采取保守策略：允许文本与工具，图片按「多模态常见能力」放行，
 * 仅在明确不支持时（如 glm-4.6）拦截，避免误拦正常用户。
 */
export function modelCapability(modelId: string): ModelCapability {
  const known = matchFamily(modelId)
  if (known) return known
  const n = modelId.toLowerCase()
  return {
    id: modelId,
    label: modelId,
    // 未登记模型：gpt/claude/gemini/glm-4.7/qwen/vl/vision 等一律视为支持图片
    vision: /gpt|claude|gemini|vision|-vl|omni|glm-4\.7|qwen|kimi|minimax|moonshot/.test(n) || !n,
    gif: /^(gpt-4o|gpt-4\.1|kimi|minimax|gemini)/.test(n),
    tools: true
  }
}

/** 是否支持图片输入 */
export function supportsVision(modelId: string): boolean {
  return modelCapability(modelId).vision
}

/** 是否支持 GIF 动图输入 */
export function supportsGif(modelId: string): boolean {
  return modelCapability(modelId).gif
}

export interface AttachmentSupportIssue {
  /** 不支持的附件类型 */
  kind: 'image' | 'gif'
  /** 命中的附件个数 */
  count: number
}

/**
 * 校验附件与所选模型的能力匹配。
 * 返回第一条不匹配项（图片优先于 GIF），无问题时返回 null。
 */
export function checkAttachmentSupport(
  modelId: string,
  attachments: Array<{ mime: string; name: string }>
): AttachmentSupportIssue | null {
  const cap = modelCapability(modelId)
  const images = attachments.filter((a) => a.mime.startsWith('image/'))
  const gifs = images.filter((a) => a.mime === 'image/gif' || a.name.toLowerCase().endsWith('.gif'))

  if (gifs.length > 0 && !cap.gif) return { kind: 'gif', count: gifs.length }
  if (images.length > 0 && !cap.vision) return { kind: 'image', count: images.length }
  return null
}

/** 从模型列表里挑一个支持图片的替代模型（用于提示文案里的「切换模型」引导） */
export function suggestVisionModel(current: string): string | undefined {
  return BUILT_IN_MODELS.find((m) => m.vision && m.id !== current)?.label
}

/**
 * 从模型列表里挑一个支持 GIF 的替代模型。
 * 原版文案 `chat.gifNotSupported` 明确点名「请切换至 kimi 或 minimax 模型后重试」，
 * 因此优先返回这两个模型，保证提示语与建议动作一致。
 */
export function suggestGifModel(current: string): string | undefined {
  const named = BUILT_IN_MODELS.find((m) => m.gif && (m.id === 'kimi' || m.id === 'minimax') && m.id !== current)
  return (named ?? BUILT_IN_MODELS.find((m) => m.gif && m.id !== current))?.label
}
