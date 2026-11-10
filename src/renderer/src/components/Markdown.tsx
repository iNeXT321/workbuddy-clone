import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import type { Highlighter } from 'shiki'
import { useTranslation } from '../i18n'

/**
 * Markdown 渲染 —— 对齐 WorkBuddy 本体：
 * react-markdown + remark-gfm + remark-math + rehype-katex，
 * 代码高亮用 shiki（原版方案，按需懒加载语言/主题 chunk），
 * 图表用 mermaid（原版方案）。
 */

type Theme = 'dark' | 'light'

// ---------- 主题跟随 ----------
function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  )
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return theme
}

// ---------- shiki 高亮器（单例，语言按需加载，对齐原版懒加载形态）----------
const SHIKI_THEMES = { dark: 'catppuccin-mocha', light: 'catppuccin-latte' } as const

let hlPromise: Promise<Highlighter> | null = null
function getHighlighter(): Promise<Highlighter> {
  if (!hlPromise) {
    hlPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: [SHIKI_THEMES.dark, SHIKI_THEMES.light],
        langs: []
      })
    )
  }
  return hlPromise
}

function CodeBlock({ code, lang, theme }: { code: string; lang: string; theme: Theme }) {
  const { t } = useTranslation()
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      const hl = await getHighlighter()
      let resolved = 'text'
      if (lang) {
        try {
          if (!hl.getLoadedLanguages().includes(lang)) await hl.loadLanguage(lang as never)
          if (hl.getLoadedLanguages().includes(lang)) resolved = lang
        } catch {
          resolved = 'text'
        }
      }
      const out = hl.codeToHtml(code, { lang: resolved, theme: SHIKI_THEMES[theme] })
      if (!cancelled) setHtml(out)
    }
    run().catch(() => {
      /* 高亮失败则保持回退到原生 code */
    })
    return () => {
      cancelled = true
    }
  }, [code, lang, theme])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板不可用 */
    }
  }

  const body = html ? (
    <div className="code-block-shiki-inner" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <pre className="code-block">
      <code className={lang ? `language-${lang}` : ''}>{code}</code>
    </pre>
  )

  return (
    <div className="code-block-wrap">
      <div className="code-block-bar">
        <span className="code-lang">{lang || 'text'}</span>
        <button className="code-copy" onClick={copy} title={t('chat.copy')}>
          {copied ? t('chat.copied') : t('chat.copy')}
        </button>
      </div>
      {body}
    </div>
  )
}

function MermaidBlock({ code, theme }: { code: string; theme: Theme }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'light' ? 'default' : 'dark'
        })
        const id = 'mmd-' + Math.random().toString(36).slice(2)
        const { svg } = await mermaid.render(id, code)
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [code, theme])

  if (error) {
    return (
      <pre className="code-block">
        <code>{code}</code>
      </pre>
    )
  }
  return <div className="mermaid-block" ref={ref} />
}

// ---------- 主组件 ----------
export default function Markdown({ content }: { content: string }) {
  const theme = useTheme()

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // 去掉默认 <pre> 包裹，由 code 组件自行输出（shiki/mermaid 需要块级容器）
          pre({ children }) {
            return <>{children}</>
          },
          code(props) {
            const { children, className, ...rest } = props
            const text =
              typeof children === 'string'
                ? children
                : Array.isArray(children)
                  ? children.join('')
                  : String(children ?? '')
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !className && !text.includes('\n')
            if (isInline) {
              return (
                <code className="inline-code" {...rest}>
                  {children}
                </code>
              )
            }
            const lang = match ? match[1] : ''
            const source = text.replace(/\n$/, '')
            if (lang === 'mermaid') {
              return <MermaidBlock code={source} theme={theme} />
            }
            return <CodeBlock code={source} lang={lang} theme={theme} />
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
