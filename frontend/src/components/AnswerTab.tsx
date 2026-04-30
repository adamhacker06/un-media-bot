import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { Article } from '../types.ts'

// ─── Types ───────────────────────────────────────────────

interface Citation {
  title: string
  date: string
  url: string
  source: string
}

interface CiteGroup {
  citations: Citation[]
}

// ─── Text helpers ─────────────────────────────────────────

function stripThink(raw: string): { text: string; thinking: boolean } {
  const closed = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, '')
  const stillOpen = /<think>/.test(raw) && !raw.includes('</think>')
  return { text: closed.trimStart(), thinking: stillOpen }
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// ─── Numbered citations: [1], [2], etc. ──────────────────

function preprocessNumbered(text: string, articles: Article[]): { md: string; groups: CiteGroup[] } | null {
  if (articles.length === 0 || !/\[\d+\]/.test(text)) return null

  const groups: CiteGroup[] = []
  const articleToGroup = new Map<number, number>()

  const md = text.replace(/\[(\d+)\]/g, (match, numStr) => {
    const num = parseInt(numStr, 10)
    if (num < 1 || num > articles.length) return match

    const artIdx = num - 1
    let groupIdx: number

    if (articleToGroup.has(artIdx)) {
      groupIdx = articleToGroup.get(artIdx)!
    } else {
      groupIdx = groups.length
      articleToGroup.set(artIdx, groupIdx)
      const a = articles[artIdx]
      groups.push({ citations: [{ title: a.title, date: a.date, url: a.url, source: a.source }] })
    }

    const a = articles[artIdx]
    const label = a.source || (a.url.startsWith('http') ? getDomain(a.url) : 'UN')
    return `[${label}](cite://${groupIdx})`
  })

  return { md, groups }
}

// ─── Legacy citations: [Source: title, date — URL] ───────

const SINGLE_CITE_RE = /\[Source:\s*([^,\]—]+?),\s*([^—\]]+?)\s*—\s*(https?:\/\/[^\]]+?)\]/g
const GROUP_RE = /(?:\[Source:\s*[^\]—]+?,\s*[^—\]]+?\s*—\s*https?:\/\/[^\]]+?\])+/g

function preprocessLegacy(text: string): { md: string; groups: CiteGroup[] } {
  const groups: CiteGroup[] = []

  const md = text.replace(GROUP_RE, (groupMatch) => {
    const citations: Citation[] = []
    SINGLE_CITE_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SINGLE_CITE_RE.exec(groupMatch)) !== null) {
      citations.push({ title: m[1].trim(), date: m[2].trim(), url: m[3].trim(), source: '' })
    }
    const idx = groups.length
    groups.push({ citations })
    const domain = getDomain(citations[0].url)
    const extra = citations.length > 1 ? ` +${citations.length - 1}` : ''
    return `[${domain}${extra}](cite://${idx})`
  })

  return { md, groups }
}

function preprocessCitations(text: string, articles: Article[]): { md: string; groups: CiteGroup[] } {
  return preprocessNumbered(text, articles) ?? preprocessLegacy(text)
}

// ─── Citation badge component ────────────────────────────

function CitationBadge({ label, group }: { label: string; group: CiteGroup }) {
  // Use the first citation as the primary link target
  const cite = group.citations[0]
  const hasUrl = cite.url.startsWith('http') && !cite.url.includes('localhost')
  const domain = hasUrl ? getDomain(cite.url) : (cite.source || 'UN')

  if (hasUrl) {
    return (
      <a
        className="cite-badge"
        href={cite.url}
        target="_blank"
        rel="noopener noreferrer"
        title={cite.title}
      >
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
          width={12}
          height={12}
          alt=""
          className="cite-badge-favicon"
        />
        {label}
      </a>
    )
  }

  // No external URL — render non-navigable badge
  return (
    <span className="cite-badge cite-badge--no-link" title={cite.title}>
      {label}
    </span>
  )
}

// ─── Markdown component map ──────────────────────────────

function makeMdComponents(groups: CiteGroup[], articles: Article[]): Components {
  // source label → group index, for fallback matching when model generates bad hrefs
  const sourceToGroup = new Map<string, CiteGroup>()
  articles.forEach((a) => {
    const g: CiteGroup = { citations: [{ title: a.title, date: a.date, url: a.url, source: a.source }] }
    if (a.source) sourceToGroup.set(a.source.toLowerCase(), g)
    if (a.url.startsWith('http')) sourceToGroup.set(getDomain(a.url).toLowerCase(), g)
  })

  return {
    a({ href, children }) {
      // Numbered citation resolved by preprocessor
      if (href?.startsWith('cite://')) {
        const idx = parseInt(href.slice(7), 10)
        const group = groups[idx]
        if (group) return <CitationBadge label={String(children)} group={group} />
      }
      // Genuine external link
      if (href && (href.startsWith('https://') || href.startsWith('http://')) && !href.includes('localhost')) {
        return (
          <a className="md-link" href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        )
      }
      // Bad/relative href — try to resolve via source label so it still links correctly
      const label = String(children).trim().toLowerCase()
      const fallback = sourceToGroup.get(label)
      if (fallback) return <CitationBadge label={String(children)} group={fallback} />
      // Truly unresolvable — render as plain text, never navigate to localhost
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
}

// ─── Skeleton ────────────────────────────────────────────

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

// ─── Main component ──────────────────────────────────────

interface AnswerTabProps {
  answer: string
  isStreaming: boolean
  error: string | null
  articles: Article[]
}

export default function AnswerTab({ answer, isStreaming, error, articles }: AnswerTabProps) {
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

  const { md, groups } = preprocessCitations(text, articles)
  const components = makeMdComponents(groups, articles)

  return (
    <div className="tab-content">
      <div className="answer-body">
        <div className="answer-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {md}
          </ReactMarkdown>
          {isStreaming && <span className="cursor-blink" />}
        </div>
      </div>
    </div>
  )
}
