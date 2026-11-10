import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

/**
 * Markdown 渲染 —— 对齐 WorkBuddy 本体的 react-markdown + remark-gfm 组合，
 * 代码块用 highlight.js 做语法高亮。
 */

export default function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { children, className, ...rest } = props
            const match = /language-(\w+)/.exec(className || '')
            const isBlock = match || (typeof children === 'string' && children.includes('\n'))
            if (!isBlock) {
              return (
                <code className="inline-code" {...rest}>
                  {children}
                </code>
              )
            }
            const lang = match ? match[1] : ''
            const code = String(children).replace(/\n$/, '')
            let highlighted: string
            try {
              highlighted = lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value
            } catch {
              highlighted = code
            }
            return (
              <pre className="code-block">
                <code dangerouslySetInnerHTML={{ __html: highlighted }} />
              </pre>
            )
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
