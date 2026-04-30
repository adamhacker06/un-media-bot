import type { Article } from '../types.ts'

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

interface SourcesPanelProps {
  articles: Article[]
  query: string
  onClose: () => void
}

function SourceRow({ article, index }: { article: Article; index: number }) {
  const hasUrl = article.url.startsWith('http')
  const domain = hasUrl ? getDomain(article.url) : article.source || 'UN'
  const inner = (
    <>
      <span className="sp-item-num">{index + 1}</span>
      <div className="sp-item-body">
        <div className="sp-item-meta">
          {hasUrl && (
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
              width={13}
              height={13}
              alt=""
              className="sp-favicon"
            />
          )}
          <span className="sp-domain">{domain}</span>
          {article.date && <span className="sp-date">{article.date}</span>}
        </div>
        <div className="sp-title">{article.title}</div>
        {article.excerpt && (
          <div className="sp-excerpt">{article.excerpt}</div>
        )}
      </div>
    </>
  )
  return hasUrl ? (
    <a className="sp-item" href={article.url} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <div className="sp-item sp-item--no-link">{inner}</div>
  )
}

export default function SourcesPanel({ articles, query, onClose }: SourcesPanelProps) {
  return (
    <aside className="sources-panel">
      <div className="sp-header">
        <div className="sp-header-left">
          <span className="sp-header-title">Sources</span>
          {articles.length > 0 && (
            <span className="sp-header-count">{articles.length}</span>
          )}
        </div>
        <button className="sp-close" onClick={onClose} aria-label="Close sources">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {query && (
        <p className="sp-query-label">for "{query}"</p>
      )}

      <div className="sp-list">
        {articles.length === 0 ? (
          <div className="sp-empty">No sources for this response.</div>
        ) : (
          articles.map((a, i) => (
            <SourceRow key={a.url + i} article={a} index={i} />
          ))
        )}
      </div>
    </aside>
  )
}
