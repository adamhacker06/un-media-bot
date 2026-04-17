import { useState } from 'react'
import AnswerTab from './AnswerTab.tsx'
import SourcesTab from './SourcesTab.tsx'
import AssetsTab from './AssetsTab.tsx'
import type { Article, Asset, TabId } from '../types.ts'

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

interface Tab {
  id: TabId
  label: string
  count?: number
}

interface ResultsViewProps {
  query: string
  answer: string
  articles: Article[]
  assets: Asset[]
  isStreaming: boolean
  error: string | null
  onNewQuery: (q: string) => void
}

export default function ResultsView({
  query,
  answer,
  articles,
  assets,
  isStreaming,
  error,
  onNewQuery,
}: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('answer')
  const [followUp, setFollowUp] = useState<string>('')

  const isLoading = isStreaming && answer === '' && articles.length === 0

  const tabs: Tab[] = [
    { id: 'answer',  label: 'Answer' },
    { id: 'sources', label: 'Sources', count: articles.length },
    { id: 'assets',  label: 'Assets',  count: assets.length  },
  ]

  function handleFollowUp(q: string) {
    setFollowUp('')
    setActiveTab('answer')
    onNewQuery(q)
  }

  return (
    <div className="results-view">
      {/* Mini search bar showing current query */}
      <div className="results-query-bar">
        <div className="results-search-mini">
          <SearchIcon />
          <input
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && followUp.trim()) {
                handleFollowUp(followUp.trim())
              }
            }}
            placeholder={query}
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="tabs-bar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="tab-count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'answer'  && <AnswerTab  answer={answer}     isStreaming={isStreaming} error={error} />}
      {activeTab === 'sources' && <SourcesTab articles={articles} isLoading={isLoading} />}
      {activeTab === 'assets'  && <AssetsTab  assets={assets}     isLoading={isLoading} />}
    </div>
  )
}
