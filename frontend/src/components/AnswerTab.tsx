import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

function stripThink(raw: string): { text: string; thinking: boolean } {
  const closed = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, '')
  const stillOpen = /<think>/.test(raw) && !raw.includes('</think>')
  return { text: closed.trimStart(), thinking: stillOpen }
}

// Convert [Source: title, date — URL] → markdown link [domain](URL)
const CITATION_RE = /\[Source:\s*[^\]—]+?,\s*[^—\]]+?\s*—\s*(https?:\/\/[^\]]+?)\]/g

function preprocessCitations(text: string): string {
  return text.replace(CITATION_RE, (_, url: string) => {
    const trimmed = url.trim()
    let label = trimmed
    try { label = new URL(trimmed).hostname.replace(/^www\./, '') } catch { /* keep raw */ }
    return `[${label}](${trimmed})`
  })
}

const mdComponents: Components = {
  // Citation badges + normal links
  a({ href, children }) {
    return (
      <a
        className="citation-badge"
        href={href ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  },
  // Tighten headings
  h1({ children }) { return <h2 className="md-h2">{children}</h2> },
  h2({ children }) { return <h2 className="md-h2">{children}</h2> },
  h3({ children }) { return <h3 className="md-h3">{children}</h3> },
  // Paragraphs
  p({ children }) { return <p className="md-p">{children}</p> },
  // Lists
  ul({ children }) { return <ul className="md-ul">{children}</ul> },
  ol({ children }) { return <ol className="md-ol">{children}</ol> },
  li({ children }) { return <li className="md-li">{children}</li> },
  // Inline code
  code({ children, className }) {
    const isBlock = !!className
    return isBlock
      ? <pre className="md-pre"><code className="md-code">{children}</code></pre>
      : <code className="md-inline-code">{children}</code>
  },
  // Blockquote
  blockquote({ children }) { return <blockquote className="md-blockquote">{children}</blockquote> },
  // Horizontal rule
  hr() { return <hr className="md-hr" /> },
  // Strong / em
  strong({ children }) { return <strong className="md-strong">{children}</strong> },
}

function SkeletonLines() {
  const widths = [100, 88, 94, 70, 85, 60]
  return (
    <div className="answer-skeleton">
      {widths.map((w, i) => (
        <div
          key={i}
          className="skeleton-line"
          style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  )
}

interface AnswerTabProps {
  answer: string
  isStreaming: boolean
  error: string | null
}

export default function AnswerTab({ answer, isStreaming, error }: AnswerTabProps) {
  if (error) {
    return (
      <div className="tab-content">
        <div className="error-banner">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      </div>
    )
  }

  const { text, thinking } = stripThink(answer)

  if (thinking || (!text && isStreaming)) {
    return (
      <div className="tab-content">
        <SkeletonLines />
      </div>
    )
  }

  if (!text) {
    return (
      <div className="tab-content">
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <p>Your answer will appear here.</p>
        </div>
      </div>
    )
  }

  const processed = preprocessCitations(text)

  return (
    <div className="tab-content">
      <div className="answer-body">
        <div className="answer-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {processed}
          </ReactMarkdown>
          {isStreaming && <span className="cursor-blink" />}
        </div>
      </div>
    </div>
  )
}
