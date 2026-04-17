import type { Article } from '../types.ts'

function ExternalLinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function SourceCard({ article }: { article: Article }) {
  function handleClick() {
    if (article.url) window.open(article.url, '_blank', 'noopener')
  }

  return (
    <div className="source-card" onClick={handleClick}>
      <div className="source-card-header">
        <span className="source-badge">{article.source || 'UN'}</span>
        {article.date && <span className="source-date">{article.date}</span>}
      </div>
      <div className="source-title">{article.title}</div>
      {article.excerpt && (
        <div className="source-excerpt">{article.excerpt}</div>
      )}
      {article.url && (
        <a
          className="source-link"
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          View source <ExternalLinkIcon />
        </a>
      )}
    </div>
  )
}

const SKELETON_WIDTHS = [50, 90, 70, 80, 55]

function SkeletonCard() {
  return (
    <div className="source-card" style={{ minHeight: 140, background: '#f9f9f9' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SKELETON_WIDTHS.map((w, j) => (
          <div key={j} className="skeleton-line" style={{ width: `${w}%`, height: 12 }} />
        ))}
      </div>
    </div>
  )
}

interface SourcesTabProps {
  articles: Article[]
  isLoading: boolean
}

export default function SourcesTab({ articles, isLoading }: SourcesTabProps) {
  if (isLoading && articles.length === 0) {
    return (
      <div className="tab-content">
        <div className="sources-grid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  if (!isLoading && articles.length === 0) {
    return (
      <div className="tab-content">
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <p>No source articles found for this query.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content">
      <div className="sources-grid">
        {articles.map((article, i) => (
          <SourceCard key={i} article={article} />
        ))}
      </div>
    </div>
  )
}
