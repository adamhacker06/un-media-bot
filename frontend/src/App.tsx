import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar.tsx'
import SearchHome from './components/SearchHome.tsx'
import ResultsView from './components/ResultsView.tsx'
import type { Article, Asset, ChatHistoryItem, SseEvent } from './types.ts'

const API_BASE = '/api'

let chatIdCounter = 0

export default function App() {
  const [query, setQuery]             = useState<string>('')
  const [answer, setAnswer]           = useState<string>('')
  const [articles, setArticles]       = useState<Article[]>([])
  const [assets, setAssets]           = useState<Asset[]>([])
  const [isStreaming, setIsStreaming]  = useState<boolean>(false)
  const [error, setError]             = useState<string | null>(null)
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([])
  const [activeChat, setActiveChat]   = useState<number | null>(null)

  const hasResult = query !== ''

  const runQuery = useCallback(async (q: string) => {
    setQuery(q)
    setAnswer('')
    setArticles([])
    setAssets([])
    setError(null)
    setIsStreaming(true)

    const id = ++chatIdCounter
    setActiveChat(id)
    setChatHistory((prev) => [{ id, query: q }, ...prev.slice(0, 19)])

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })

      if (!res.ok) {
        throw new Error(`Server error ${res.status}: ${await res.text()}`)
      }
      if (!res.body) {
        throw new Error('No response body received')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (raw === '[DONE]') {
            setIsStreaming(false)
            continue
          }

          let event: SseEvent
          try {
            event = JSON.parse(raw) as SseEvent
          } catch {
            continue
          }

          if (event.type === 'token') {
            setAnswer((prev) => prev + event.content)
          } else if (event.type === 'sources') {
            setArticles(event.articles)
            setAssets(event.assets)
          } else if (event.type === 'error') {
            setError(event.message)
            setIsStreaming(false)
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStreaming(false)
    }
  }, [])

  function handleNewChat() {
    setQuery('')
    setAnswer('')
    setArticles([])
    setAssets([])
    setError(null)
    setIsStreaming(false)
    setActiveChat(null)
  }

  function handleSelectChat(id: number) {
    setActiveChat(id)
  }

  return (
    <div className="layout">
      <Sidebar
        chatHistory={chatHistory}
        activeChat={activeChat}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
      />
      <div className="main">
        <div className="topbar">
          <div className="lang-selector">EN ▾</div>
        </div>
        {hasResult ? (
          <ResultsView
            query={query}
            answer={answer}
            articles={articles}
            assets={assets}
            isStreaming={isStreaming}
            error={error}
            onNewQuery={runQuery}
          />
        ) : (
          <SearchHome onSubmit={runQuery} isLoading={isStreaming} />
        )}
      </div>
    </div>
  )
}
