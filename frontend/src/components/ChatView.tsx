import { useState, useEffect, useRef } from 'react'
import SearchBar from './SearchBar.tsx'
import AnswerTab from './AnswerTab.tsx'
import SourcesTab from './SourcesTab.tsx'
import AssetsTab from './AssetsTab.tsx'
import type { Article, Message, TabId } from '../types.ts'

const CITATION_URL_RE = /\[Source:\s*[^\]—]+?,\s*[^—\]]+?\s*—\s*(https?:\/\/[^\]]+?)\]/g

function extractCitedUrls(text: string): Set<string> {
  const urls = new Set<string>()
  CITATION_URL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CITATION_URL_RE.exec(text)) !== null) urls.add(m[1].trim())
  return urls
}

function filterCitedArticles(articles: Article[], answerText: string, isStreaming: boolean): Article[] {
  if (isStreaming) return articles
  const cited = extractCitedUrls(answerText)
  if (cited.size === 0) return articles
  return articles.filter((a) => a.url && cited.has(a.url))
}

function EmptyState() {
  return (
    <div className="chat-empty">
      <div className="portal-label">Journalist Portal</div>
      <h1 className="portal-heading">
        Find <strong>Anything</strong> At the UN
      </h1>
      <p className="chat-empty-sub">
        Ask about press releases, resolutions, briefings, or media assets.
      </p>
    </div>
  )
}

interface ChatViewProps {
  messages: Message[]
  onSend: (query: string) => void
}

export default function ChatView({ messages, onSend }: ChatViewProps) {
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('answer')
  const bottomRef = useRef<HTMLDivElement>(null)
  const isStreaming = messages.some((m) => m.isStreaming)

  // Latest assistant message drives the tab content
  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  // Reset to answer tab whenever a new response starts
  useEffect(() => {
    setActiveTab('answer')
  }, [latestAssistant?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(q: string) {
    setInput('')
    onSend(q)
  }

  const hasResponse = !!latestAssistant

  const citedArticles = latestAssistant
    ? filterCitedArticles(latestAssistant.articles, latestAssistant.content, latestAssistant.isStreaming ?? false)
    : []

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'answer', label: 'Answer' },
    { id: 'sources', label: 'Links', count: citedArticles.length },
    { id: 'assets', label: 'Assets', count: latestAssistant?.assets.length },
  ]

  return (
    <div className="chat-view">
      {/* Top bar — tab bar when response exists, language selector otherwise */}
      <div className="chat-topbar">
        {hasResponse ? (
          <div className="chat-global-tabs">
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
        ) : (
          <div className="lang-selector">EN ▾</div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="chat-content-wrap">
            {/* History: all messages except the latest assistant response */}
            {messages
              .filter((m) => m.id !== latestAssistant?.id)
              .map((msg) => (
                <div key={msg.id} className={`chat-history-msg chat-history-msg--${msg.role}`}>
                  {msg.role === 'user' ? (
                    <span className="chat-history-query">{msg.content}</span>
                  ) : (
                    <p className="chat-history-answer">{msg.content}</p>
                  )}
                </div>
              ))}

            {/* Latest query — right-side bubble */}
            {latestAssistant && (() => {
              const latestIdx = messages.findIndex((m) => m.id === latestAssistant.id)
              const latestQuery = latestIdx > 0 ? messages[latestIdx - 1] : null
              return latestQuery ? (
                <div className="chat-current-query">
                  <span className="chat-current-query-bubble">{latestQuery.content}</span>
                </div>
              ) : null
            })()}

            {/* Tab content for latest response */}
            {latestAssistant && (
              <>
                {activeTab === 'answer' && (
                  <AnswerTab
                    answer={latestAssistant.content}
                    isStreaming={latestAssistant.isStreaming}
                    error={null}
                  />
                )}
                {activeTab === 'sources' && (
                  <SourcesTab
                    articles={citedArticles}
                    isLoading={latestAssistant.isStreaming && !latestAssistant.articles.length}
                  />
                )}
                {activeTab === 'assets' && (
                  <AssetsTab
                    assets={latestAssistant.assets}
                    isLoading={latestAssistant.isStreaming && !latestAssistant.assets.length}
                  />
                )}
              </>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Bottom input bar */}
      <div className="chat-input-bar">
        <div className="chat-input-inner">
          <SearchBar
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            disabled={isStreaming}
            placeholder="Ask about UN press releases, resolutions, events…"
          />
        </div>
      </div>
    </div>
  )
}
