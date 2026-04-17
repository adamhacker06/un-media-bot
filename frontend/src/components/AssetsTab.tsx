import { useState, type CSSProperties } from 'react'
import type { Asset } from '../types.ts'

function ImageIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}

function AssetCard({ asset }: { asset: Asset }) {
  const [imgError, setImgError] = useState(false)
  const isVideo = asset.asset_type === 'video'

  function handleClick() {
    const url = asset.asset_url || asset.thumbnail_url
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="asset-card" onClick={handleClick}>
      <div className="asset-thumb">
        {asset.thumbnail_url && !imgError ? (
          <img
            src={asset.thumbnail_url}
            alt={asset.title}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="asset-thumb-placeholder">
            {isVideo ? <VideoIcon /> : <ImageIcon />}
          </div>
        )}
        {isVideo && (
          <div className="video-overlay">
            <div className="play-btn">▶</div>
          </div>
        )}
        <span className="asset-type-badge">{isVideo ? 'Video' : 'Photo'}</span>
      </div>
      <div className="asset-info">
        <div className="asset-title">{asset.title}</div>
        <div className="asset-meta">
          {asset.date && <span>{asset.date}</span>}
          {asset.description && asset.date && <span> · </span>}
          {asset.description && (
            <span
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              } as CSSProperties}
            >
              {asset.description}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function SkeletonAssetCard({ delay }: { delay: number }) {
  return (
    <div className="asset-card">
      <div
        style={{
          aspectRatio: '16/10',
          background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
          backgroundSize: '200% 100%',
          animation: `shimmer 1.4s infinite ${delay}s`,
        }}
      />
      <div style={{ padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skeleton-line" style={{ width: '80%', height: 12 }} />
        <div className="skeleton-line" style={{ width: '50%', height: 10 }} />
      </div>
    </div>
  )
}

interface AssetsTabProps {
  assets: Asset[]
  isLoading: boolean
}

export default function AssetsTab({ assets, isLoading }: AssetsTabProps) {
  if (isLoading && assets.length === 0) {
    return (
      <div className="tab-content">
        <div className="assets-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonAssetCard key={i} delay={i * 0.1} />
          ))}
        </div>
      </div>
    )
  }

  if (!isLoading && assets.length === 0) {
    return (
      <div className="tab-content">
        <div className="empty-state">
          <div className="empty-state-icon">🖼</div>
          <p>No media assets found for this query.</p>
          <p style={{ fontSize: '12px', marginTop: 4 }}>
            Try queries about specific events or press conferences.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content">
      <div className="assets-grid">
        {assets.map((asset, i) => (
          <AssetCard key={i} asset={asset} />
        ))}
      </div>
    </div>
  )
}
