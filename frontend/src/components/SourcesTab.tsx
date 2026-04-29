import type { Article } from '../types.ts'

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function SourceCard({ article, index }: { article: Article; index: number }) {
  const domain = getDomain(article.url)
  return (
    <a
      className="source-card-perp"
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="scp-num">{index + 1}</span>
      <div className="scp-body">
        <div className="scp-meta">
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
            width={13}
            height={13}
            alt=""
            className="scp-favicon"
          />
          <span className="scp-domain">{domain}</span>
          {article.date && <span className="scp-date">{article.date}</span>}
        </div>
        <div className="scp-title">{article.title}</div>
        {article.excerpt && (
          <div className="scp-excerpt">{article.excerpt}</div>
        )}
      </div>
    </a>
  )
}

const SKELETON_ROWS = [80, 60, 90, 55, 75]

function SkeletonRow() {
  return (
    <div className="source-card-perp source-card-perp--skeleton">
      <span className="scp-num" style={{ background: '#e8e8e8', borderRadius: 4, display: 'block', width: 16, height: 16 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SKELETON_ROWS.map((w, i) => (
          <div key={i} className="skeleton-line" style={{ width: `${w}%`, height: 11 }} />
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
        <div className="sources-list">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
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
      <div className="sources-list">
        {articles.map((article, i) => (
          <SourceCard key={article.url + i} article={article} index={i} />
        ))}
      </div>
    </div>
  )
}
