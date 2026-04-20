import { useState, useEffect, useRef } from 'react'
import SearchBar from './SearchBar.tsx'
import AnswerTab from './AnswerTab.tsx'
import SourcesTab from './SourcesTab.tsx'
import AssetsTab from './AssetsTab.tsx'
import type { Message, TabId } from '../types.ts'

// ── Per-message tabs for sources/assets ──────────────────
function MessageTabs({
  message,
}: {
  message: Message
}) {
  const [tab, setTab] = useState<TabId>('answer')
  const hasArticles = message.articles.length > 0
  const hasAssets = message.assets.length > 0

  if (!hasArticles && !hasAssets && !message.isStreaming) return null

  return (
    <div className="msg-tabs-wrap">
      <div className="tabs-bar" style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
        {(['answer', 'sources', 'assets'] as TabId[]).map((id) => {
          const count = id === 'sources' ? message.articles.length : id === 'assets' ? message.assets.length : undefined
          return (
            <button
              key={id}
              className={`tab-btn ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              {id.charAt(0).toUpperCase() + id.slice(1)}
              {count != null && count > 0 && <span className="tab-count">{count}</span>}
            </button>
          )
        })}
      </div>
      {tab === 'answer' && (
        <AnswerTab answer={message.content} isStreaming={message.isStreaming} error={null} />
      )}
      {tab === 'sources' && (
        <SourcesTab articles={message.articles} isLoading={message.isStreaming && !hasArticles} />
      )}
      {tab === 'assets' && (
        <AssetsTab assets={message.assets} isLoading={message.isStreaming && !hasAssets} />
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────
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

// ── Main ChatView ─────────────────────────────────────────
interface ChatViewProps {
  messages: Message[]
  onSend: (query: string) => void
}

export default function ChatView({ messages, onSend }: ChatViewProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const isStreaming = messages.some((m) => m.isStreaming)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(q: string) {
    setInput('')
    onSend(q)
  }

  return (
    <div className="chat-view">
      {/* Top bar */}
      <div className="topbar">
        <div className="lang-selector">EN ▾</div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`chat-message chat-message--${msg.role}`}>
              {msg.role === 'user' ? (
                <div className="chat-bubble-user">{msg.content}</div>
              ) : (
                <div className="chat-bubble-assistant">
                  <div className="chat-olive-label">Olive</div>
                  <MessageTabs message={msg} />
                </div>
              )}
            </div>
          ))
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
