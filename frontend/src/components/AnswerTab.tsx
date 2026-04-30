import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

function stripThink(raw: string): { text: string; thinking: boolean } {
  const closed = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, '')
  const stillOpen = /<think>/.test(raw) && !raw.includes('</think>')
  return { text: closed.trimStart(), thinking: stillOpen }
}

// Strip any inline citation markers that leak through from the model
// and tidy whitespace left behind.
function stripCitations(text: string): string {
  return text
    .replace(/\[\d+\](?:\[\d+\])*/g, '')
    .replace(/\[Source:\s*[^\]]*?\]/g, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
}

const mdComponents: Components = {
  a({ href, children }) {
    if (href && (href.startsWith('https://') || href.startsWith('http://')) && !href.includes('localhost')) {
      return (
        <a className="md-link" href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    }
    return <span>{children}</span>
  },
  h1({ children }) { return <h2 className="md-h2">{children}</h2> },
  h2({ children }) { return <h2 className="md-h2">{children}</h2> },
  h3({ children }) { return <h3 className="md-h3">{children}</h3> },
  p({ children }) { return <p className="md-p">{children}</p> },
  ul({ children }) { return <ul className="md-ul">{children}</ul> },
  ol({ children }) { return <ol className="md-ol">{children}</ol> },
  li({ children }) { return <li className="md-li">{children}</li> },
  code({ children, className }) {
    return className
      ? <pre className="md-pre"><code className="md-code">{children}</code></pre>
      : <code className="md-inline-code">{children}</code>
  },
  blockquote({ children }) { return <blockquote className="md-blockquote">{children}</blockquote> },
  hr() { return <hr className="md-hr" /> },
  strong({ children }) { return <strong className="md-strong">{children}</strong> },
}

function SkeletonLines() {
  const widths = [100, 88, 94, 70, 85, 60]
  return (
    <div className="answer-skeleton">
      {widths.map((w, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
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
        <div className="error-banner"><span>⚠</span><span>{error}</span></div>
      </div>
    )
  }

  const { text, thinking } = stripThink(answer)

  if (thinking || (!text && isStreaming)) {
    return <div className="tab-content"><SkeletonLines /></div>
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

  const cleanText = stripCitations(text)

  return (
    <div className="tab-content">
      <div className="answer-body">
        <div className="answer-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {cleanText}
          </ReactMarkdown>
          {isStreaming && <span className="cursor-blink" />}
        </div>
      </div>
    </div>
  )
}
