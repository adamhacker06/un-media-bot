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

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
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

interface SourcesBarProps {
  articles: Article[]
  open: boolean
  onToggle: () => void
}

function SourcesBar({ articles, open, onToggle }: SourcesBarProps) {
  if (articles.length === 0) return null
  const preview = articles.slice(0, 4)
  return (
    <div className="sources-bar">
      <button
        className={`sources-bar-btn ${open ? 'active' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="sources-bar-favicons">
          {preview.map((a, i) => {
            const domain = getDomain(a.url)
            return (
              <img
                key={i}
                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                width={14}
                height={14}
                alt=""
                className="sources-bar-favicon"
                style={{ zIndex: preview.length - i }}
              />
            )
          })}
        </span>
        <span className="sources-bar-label">
          {articles.length} {articles.length === 1 ? 'source' : 'sources'}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ opacity: 0.5 }}>
          {open
            ? <polyline points="18 15 12 9 6 15" />
            : <polyline points="6 9 12 15 18 9" />}
        </svg>
      </button>
    </div>
  )
}

interface ChatViewProps {
  messages: Message[]
  onSend: (query: string) => void
  sourcesPanelOpen: boolean
  onToggleSources: () => void
}

export default function ChatView({ messages, onSend, sourcesPanelOpen, onToggleSources }: ChatViewProps) {
  const [input, setInput]       = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('answer')
  const bottomRef = useRef<HTMLDivElement>(null)
  const isStreaming = messages.some((m) => m.isStreaming)

  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  useEffect(() => { setActiveTab('answer') }, [latestAssistant?.id])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function handleSubmit(q: string) {
    setInput('')
    onSend(q)
  }

  const hasResponse  = !!latestAssistant
  const citedArticles = latestAssistant
    ? filterCitedArticles(latestAssistant.articles, latestAssistant.content, latestAssistant.isStreaming ?? false)
    : []

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'answer',  label: 'Answer' },
    { id: 'sources', label: 'Links',  count: citedArticles.length },
    { id: 'assets',  label: 'Assets', count: latestAssistant?.assets.length },
  ]

  return (
    <div className="chat-view">
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

      <div className="chat-messages">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="chat-content-wrap">
            {messages
              .filter((m) => {
                if (m.id === latestAssistant?.id) return false
                // also exclude the user query immediately before the latest assistant —
                // it is rendered separately as the "current query" bubble below
                if (latestAssistant) {
                  const idx = messages.findIndex((x) => x.id === latestAssistant.id)
                  if (idx > 0 && messages[idx - 1].id === m.id) return false
                }
                return true
              })
              .map((msg) => (
                <div key={msg.id} className={`chat-history-msg chat-history-msg--${msg.role}`}>
                  {msg.role === 'user' ? (
                    <span className="chat-history-query">{msg.content}</span>
                  ) : (
                    <p className="chat-history-answer">
                      {msg.content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trimStart()}
                    </p>
                  )}
                </div>
              ))}

            {latestAssistant && (() => {
              const idx = messages.findIndex((m) => m.id === latestAssistant.id)
              const q   = idx > 0 ? messages[idx - 1] : null
              return q ? (
                <div className="chat-current-query">
                  <span className="chat-current-query-bubble">{q.content}</span>
                </div>
              ) : null
            })()}

            {latestAssistant && (
              <>
                {activeTab === 'answer' && (
                  <AnswerTab
                    answer={latestAssistant.content}
                    isStreaming={latestAssistant.isStreaming}
                    error={null}
                    articles={latestAssistant.articles}
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

                {/* Perplexity-style sources bar — shown after streaming completes */}
                {!latestAssistant.isStreaming && activeTab === 'answer' && (
                  <SourcesBar
                    articles={citedArticles}
                    open={sourcesPanelOpen}
                    onToggle={onToggleSources}
                  />
                )}
              </>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

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
